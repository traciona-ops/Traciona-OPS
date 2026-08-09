// E2E do OPS Form: cria a solicitação direto no banco (sem disparar WhatsApp),
// abre o link público num "celular" (Playwright), responde o wizard inteiro,
// confere se o contrato nasceu sozinho, baixa o PDF e limpa tudo.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";

const env = {};
for (const line of readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim();
}

const APP = "https://traciona-eco-sistema.vercel.app";
const LEAD64 = "f49be3d1-5266-4287-a776-33744e96f1b5"; // Adriano Alves
const OUTDIR = process.argv[2] || ".";

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// CPF válido gerado (dígitos verificadores calculados)
function cpfValido() {
  const n = Array.from({ length: 9 }, (_, i) => (i * 3 + 7) % 10);
  for (const len of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += n[i] * (len + 1 - i);
    n.push(((soma * 10) % 11) % 10);
  }
  return n.join("");
}

// CNPJ válido gerado (dígitos verificadores calculados)
function cnpjValidoGen() {
  const n = [1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 1];
  for (const len of [12, 13]) {
    const pesos =
      len === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < len; i++) soma += n[i] * pesos[i];
    const resto = soma % 11;
    n.push(resto < 2 ? 0 : 11 - resto);
  }
  return n.join("");
}

const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 8);
const { data: fr, error: frErr } = await admin
  .from("form_requests")
  .insert({
    token,
    lead_id: LEAD64,
    kind: "contrato_trafego_pago",
    terms: { valorMensal: 3000, prazoMeses: 12, dataInicio: "2026-09-01", diaVencimento: 5, comarca: "Acreúna – Goiás" },
  })
  .select("id")
  .single();
if (frErr) {
  console.log("✖ não criou form_request:", frErr.message);
  process.exit(1);
}
console.log("form_request criado (sem WhatsApp)");

// limpa restos de execuções interrompidas
await admin
  .from("form_requests")
  .delete()
  .eq("lead_id", LEAD64)
  .eq("status", "pendente")
  .neq("id", fr.id);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(`${APP}/f/${token}`, { waitUntil: "networkidle" });

const intro = await page
  .waitForSelector("text=Olá, Adriano", { timeout: 20000 })
  .then(() => true)
  .catch(() => false);
console.log("intro pública sem login:", intro ? "✔" : "✖");
await page.screenshot({ path: `${OUTDIR}/opsform-intro.png` });

// hidratação: o SSR mostra a tela antes do React ligar os cliques
await page.waitForTimeout(1500);
await page.click('button:has-text("Começar")');
const avancou = await page
  .waitForSelector("text=pessoa física ou como empresa", { timeout: 4000 })
  .then(() => true)
  .catch(() => false);
if (!avancou) await page.click('button:has-text("Começar")');

const fill = async (v) => {
  await page.waitForSelector("input", { timeout: 8000 });
  await page.fill("input", v);
  await page.click('button:has-text("Continuar")');
};

// testa o caminho PJ (empresa)
await page.click('button:has-text("Empresa (CNPJ)")');
await page.waitForTimeout(400);
await fill("Alves Marketing LTDA"); // razão social
await fill(cnpjValidoGen()); // CNPJ
await fill("Rua das Palmeiras, nº 45, Centro"); // endereço da sede
await fill("Acreúna – GO"); // cidade/UF
await fill("75960000"); // CEP
await page.screenshot({ path: `${OUTDIR}/opsform-step.png` });
await fill("Adriano Alves"); // quem assina
await fill(cpfValido()); // CPF de quem assina
await fill("teste-opsform@traciona.internal"); // e-mail

// revisão
await page.waitForSelector("text=Confere se está tudo certo", { timeout: 8000 });
await page.screenshot({ path: `${OUTDIR}/opsform-review.png` });
await page.click('button:has-text("Confirmar e enviar")');

// espera texto EXCLUSIVO da tela final ("tudo certo" também existe na revisão)
const done = await page
  .waitForSelector("text=Recebemos os seus dados", { timeout: 45000 })
  .then(() => true)
  .catch(() => false);
await page.waitForTimeout(1500);
console.log("tela de sucesso:", done ? "✔" : "✖");
await page.screenshot({ path: `${OUTDIR}/opsform-done.png` });
await browser.close();

// contrato nasceu?
const { data: after } = await admin
  .from("form_requests")
  .select("status, contract_id, answers")
  .eq("id", fr.id)
  .maybeSingle();
console.log("form status:", after?.status, "| contrato:", after?.contract_id ? "criado ✔" : "✖");

if (after?.contract_id) {
  const { data: c } = await admin
    .from("contracts")
    .select("title, value, starts_at, ends_at, status, file_path")
    .eq("id", after.contract_id)
    .maybeSingle();
  console.log("contrato:", JSON.stringify(c));
  if (c?.file_path) {
    const { data: blob } = await admin.storage.from("contracts").download(c.file_path);
    if (blob) {
      writeFileSync(`${OUTDIR}/opsform-contrato.pdf`, Buffer.from(await blob.arrayBuffer()));
      console.log("PDF baixado ✔");
    }
    await admin.storage.from("contracts").remove([c.file_path]);
  }
  await admin.from("contracts").delete().eq("id", after.contract_id);
}
await admin.from("form_requests").delete().eq("id", fr.id);
console.log("limpeza feita");
process.exit(0);
