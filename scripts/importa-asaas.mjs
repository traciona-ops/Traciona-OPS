// Importa a base do Asaas pro Eco Sistema (uma vez; dali em diante o
// webhook mantém em dia). Só LEITURA no Asaas.
// - clientes → contatos (casa por telefone; cria se não existir)
// - assinaturas → vendas recorrentes
// - cobranças → parcelas (sale_payments); avulsas viram vendas avulsas
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim();
}

const BASE = (env.ASAAS_API_URL ?? "https://api.asaas.com/v3").replace(/\/+$/, "");
const KEY = env.ASAAS_API_KEY;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function asaas(path) {
  const r = await fetch(`${BASE}${path}`, { headers: { access_token: KEY } });
  if (!r.ok) throw new Error(`Asaas ${r.status} em ${path}`);
  return r.json();
}
async function listAll(path) {
  const out = [];
  let offset = 0;
  while (true) {
    const sep = path.includes("?") ? "&" : "?";
    const j = await asaas(`${path}${sep}limit=100&offset=${offset}`);
    out.push(...(j.data ?? []));
    if (!j.hasMore) break;
    offset += 100;
  }
  return out;
}

const digits = (s) => String(s ?? "").replace(/\D/g, "");
const mapStatus = (s) => {
  const t = String(s ?? "").toUpperCase();
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(t)) return "pago";
  if (t === "OVERDUE") return "atrasado";
  if (["REFUNDED", "REFUND_REQUESTED", "REFUND_IN_PROGRESS"].includes(t)) return "estornado";
  if (["DELETED", "CANCELED"].includes(t)) return "cancelado";
  return "pendente";
};

// ---------- leads existentes (casamento por telefone) ----------
const { data: leads } = await admin.from("leads").select("id, name, phone");
const byTail = new Map();
for (const l of leads ?? []) {
  const d = digits(l.phone);
  if (d.length >= 8) byTail.set(d.slice(-8), l.id);
}

async function leadForCustomer(c) {
  const phone = digits(c.mobilePhone || c.phone);
  if (phone.length >= 8 && byTail.has(phone.slice(-8)))
    return { id: byTail.get(phone.slice(-8)), matched: true };
  // cria contato novo (sem card — contato ≠ negócio)
  const { data, error } = await admin
    .from("leads")
    .insert({
      name: c.name,
      phone: phone ? (phone.length <= 11 ? "55" + phone : phone) : null,
      email: c.email || null,
      source: "manual",
      value: 0,
      pipeline_id: null,
      stage_id: null,
    })
    .select("id")
    .single();
  if (error) {
    // telefone duplicado (canônico) → tenta achar de novo pelo tail
    if (phone.length >= 8 && byTail.has(phone.slice(-8)))
      return { id: byTail.get(phone.slice(-8)), matched: true };
    throw new Error(`lead p/ ${c.name}: ${error.message}`);
  }
  if (phone.length >= 8) byTail.set(phone.slice(-8), data.id);
  return { id: data.id, matched: false };
}

// ---------- importação ----------
const customers = await listAll("/customers");
console.log(`clientes no Asaas: ${customers.length}`);
let vendasNovas = 0, parcelas = 0, contatosNovos = 0, casados = 0, avulsas = 0;

for (const c of customers) {
  const lead = await leadForCustomer(c);
  if (lead.matched) casados++; else contatosNovos++;

  // assinaturas do cliente
  const subs = await listAll(`/subscriptions?customer=${c.id}`);
  for (const s of subs) {
    const { data: existing } = await admin
      .from("sales")
      .select("id")
      .eq("asaas_subscription_id", s.id)
      .maybeSingle();
    let saleId = existing?.id;
    if (!saleId) {
      const dueDay = Number(String(s.nextDueDate ?? "").slice(8, 10)) || null;
      const { data: sale, error } = await admin
        .from("sales")
        .insert({
          lead_id: lead.id,
          description: s.description || `Assinatura Asaas (${c.name})`,
          kind: "recorrente",
          value: Number(s.value ?? 0),
          billing_day: dueDay,
          status: String(s.status).toUpperCase() === "ACTIVE" ? "ativa" : "encerrada",
          asaas_customer_id: c.id,
          asaas_subscription_id: s.id,
          started_at: String(s.dateCreated ?? "").slice(0, 10) || null,
        })
        .select("id")
        .single();
      if (error) { console.log("✖ venda", s.id, error.message); continue; }
      saleId = sale.id;
      vendasNovas++;
      console.log(`✔ venda: ${c.name} — ${s.description || "assinatura"} (R$ ${s.value})`);
    }
    const pays = await listAll(`/payments?subscription=${s.id}`);
    for (const p of pays) {
      const { error } = await admin.from("sale_payments").upsert(
        {
          sale_id: saleId,
          asaas_payment_id: p.id,
          value: Number(p.value ?? 0),
          due_date: p.dueDate,
          status: mapStatus(p.status),
          billing_type: p.billingType,
          invoice_url: p.invoiceUrl,
          paid_at: mapStatus(p.status) === "pago" ? p.clientPaymentDate ?? p.paymentDate ?? null : null,
        },
        { onConflict: "asaas_payment_id" }
      );
      if (!error) parcelas++;
    }
  }

  // cobranças avulsas (sem assinatura) → uma venda avulsa cada
  const loose = (await listAll(`/payments?customer=${c.id}`)).filter((p) => !p.subscription);
  for (const p of loose) {
    const { data: existing } = await admin
      .from("sales")
      .select("id")
      .eq("asaas_payment_id", p.id)
      .maybeSingle();
    let saleId = existing?.id;
    if (!saleId) {
      const st = mapStatus(p.status);
      const { data: sale, error } = await admin
        .from("sales")
        .insert({
          lead_id: lead.id,
          description: p.description || `Cobrança avulsa (${c.name})`,
          kind: "avulsa",
          value: Number(p.value ?? 0),
          status: st === "pendente" || st === "atrasado" ? "ativa" : "encerrada",
          asaas_customer_id: c.id,
          asaas_payment_id: p.id,
          started_at: String(p.dateCreated ?? "").slice(0, 10) || null,
        })
        .select("id")
        .single();
      if (error) { console.log("✖ avulsa", p.id, error.message); continue; }
      saleId = sale.id;
      avulsas++;
    }
    const { error } = await admin.from("sale_payments").upsert(
      {
        sale_id: saleId,
        asaas_payment_id: p.id,
        value: Number(p.value ?? 0),
        due_date: p.dueDate,
        status: mapStatus(p.status),
        billing_type: p.billingType,
        invoice_url: p.invoiceUrl,
        paid_at: mapStatus(p.status) === "pago" ? p.clientPaymentDate ?? p.paymentDate ?? null : null,
      },
      { onConflict: "asaas_payment_id" }
    );
    if (!error) parcelas++;
  }
}

console.log("---");
console.log(`contatos: ${casados} casados com a base, ${contatosNovos} criados`);
console.log(`vendas: ${vendasNovas} recorrentes + ${avulsas} avulsas importadas`);
console.log(`parcelas espelhadas: ${parcelas}`);
process.exit(0);
