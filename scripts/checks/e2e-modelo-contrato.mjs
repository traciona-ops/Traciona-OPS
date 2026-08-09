// E2E: gera um contrato do MODELO pela tela em produção, baixa o PDF gerado
// pra conferência visual e apaga o contrato de teste no final.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";

const env = {};
for (const line of readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim();
}

const APP = "https://traciona-eco-sistema.vercel.app";
const LEAD64 = "f49be3d1-5266-4287-a776-33744e96f1b5"; // Adriano Alves (64)
const EMAIL = "e2e-modelo@traciona.internal";
const PASS = "E2e-modelo-2026!x";
const OUT = process.argv[2] || "e2e-modelo.pdf";

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

let uid = null;
const { data: created } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASS,
  email_confirm: true,
});
if (created?.user) uid = created.user.id;
if (!uid) {
  const { data } = await admin.auth.admin.listUsers();
  uid = data.users.find((u) => u.email === EMAIL)?.id ?? null;
}
await admin.from("profiles").upsert({
  id: uid,
  name: "E2E Modelo",
  email: EMAIL,
  role: "admin",
  sector: "vendas",
  active: true,
});

const t0 = new Date().toISOString();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASS);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !String(u).includes("/login"), { timeout: 20000 });

await page.goto(`${APP}/contratos`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('h1:has-text("Contratos")', { timeout: 20000 });
await page.click('button:has-text("Novo contrato")');
await page.waitForSelector('select[name="lead_id"]');

// modo "Gerar do modelo" já é o padrão
await page.selectOption('select[name="lead_id"]', LEAD64);
await page.fill('input[name="empresa"]', "Alves Marketing LTDA");
await page.fill('input[name="estado_civil"]', "solteiro");
await page.fill('input[name="profissao"]', "empresário");
await page.fill('input[name="rg"]', "1.234.567");
await page.fill('input[name="cpf"]', "000.000.000-00");
await page.fill('input[name="endereco"]', "Rua das Palmeiras, nº 45, Centro, Acreúna – GO, CEP 75960-000");
await page.fill('input[name="email"]', "teste-e2e@traciona.internal");
await page.fill('input[name="valor_mensal"]', "2500,00");
await page.fill('input[name="prazo_meses"]', "6");
await page.fill('input[name="data_inicio"]', "2026-08-10");
await page.fill('input[name="dia_vencimento"]', "10");

await page.click('button:has-text("Gerar contrato")');
const okNotice = await page
  .waitForSelector("text=Contrato gerado do modelo", { timeout: 30000 })
  .then(() => true)
  .catch(() => false);
await page.screenshot({ path: OUT.replace(".pdf", "-tela.png") });
console.log("aviso de sucesso na tela:", okNotice ? "✔" : "✖");

await browser.close();

// pega o contrato criado, baixa o PDF e limpa
const { data: rows } = await admin
  .from("contracts")
  .select("id, title, value, starts_at, ends_at, status, file_path, template_data")
  .gt("created_at", t0)
  .order("created_at", { ascending: false })
  .limit(1);
const c = rows?.[0];
if (!c) {
  console.log("✖ contrato não apareceu no banco");
} else {
  console.log("contrato:", JSON.stringify({ title: c.title, value: c.value, starts: c.starts_at, ends: c.ends_at, status: c.status }));
  const { data: blob, error } = await admin.storage.from("contracts").download(c.file_path);
  if (blob) {
    writeFileSync(OUT, Buffer.from(await blob.arrayBuffer()));
    console.log("PDF baixado:", OUT);
  } else {
    console.log("✖ falha ao baixar PDF:", error?.message);
  }
  await admin.from("contracts").delete().eq("id", c.id);
  await admin.storage.from("contracts").remove([c.file_path]);
  console.log("contrato de teste apagado");
}

await admin.auth.admin.deleteUser(uid);
await admin.from("profiles").delete().eq("id", uid);
console.log("limpeza feita");
process.exit(0);
