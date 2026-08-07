// Verificação visual do redesign de /contratos: tiles de status, fluxo de
// criação com cartões de modo, lista e mobile.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = {};
for (const line of readFileSync(new URL(".env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim();
}

const APP = "https://traciona-eco-sistema.vercel.app";
const EMAIL = "e2e-contratos@traciona.internal";
const PASS = "E2e-contratos-2026!x";
const OUT = process.argv[2] || ".";

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
  name: "E2E Contratos",
  email: EMAIL,
  role: "admin",
  sector: "vendas",
  active: true,
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASS);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !String(u).includes("/login"), { timeout: 20000 });

await page.goto(`${APP}/contratos`, { waitUntil: "networkidle" });
await page.waitForSelector('h1:has-text("Contratos")', { timeout: 20000 });
await page.waitForTimeout(1200);

const tiles = await page.locator('button:has-text("Assinados")').count();
console.log("tiles de status:", tiles > 0 ? "✔" : "✖");
await page.screenshot({ path: `${OUT}/contratos-lista.png` });

await page.click('button:has-text("Novo contrato")');
await page.waitForTimeout(600);
const modos = await page.locator('button:has-text("OPS Form")').count();
console.log("cartões de modo:", modos > 0 ? "✔" : "✖");
await page.screenshot({ path: `${OUT}/contratos-novo-opsform.png` });

await page.click('button:has-text("Preencher aqui")');
await page.waitForTimeout(500);
const dados = await page
  .locator("text=3 · Dados do contratante")
  .isVisible()
  .catch(() => false);
console.log("seção dados do contratante:", dados ? "✔" : "✖");
await page.screenshot({ path: `${OUT}/contratos-novo-modelo.png`, fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/contratos-mobile.png` });

await browser.close();
await admin.auth.admin.deleteUser(uid);
await admin.from("profiles").delete().eq("id", uid);
console.log("limpeza feita");
process.exit(0);
