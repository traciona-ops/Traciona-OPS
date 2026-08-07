// Verificação E2E temporária: /contatos renderiza com a sidebar setorizada?
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = {};
for (const line of readFileSync(new URL(".env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim();
}

const APP = "https://traciona-eco-sistema.vercel.app";
const EMAIL = "e2e-contatos@traciona.internal";
const PASS = "E2e-contatos-2026!x";
const SHOT = process.argv[2] || "e2e-contatos.png";

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
if (!uid) {
  console.log("FALHA: não criou usuário de teste");
  process.exit(1);
}
await admin.from("profiles").upsert({
  id: uid,
  name: "E2E Contatos",
  email: EMAIL,
  role: "admin",
  sector: "vendas",
  active: true,
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASS);
await page.click('button[type="submit"]');
const ok = await page
  .waitForURL((u) => !String(u).includes("/login"), { timeout: 20000 })
  .then(() => true)
  .catch(() => false);
if (!ok) {
  console.log("LOGIN falhou");
  await page.screenshot({ path: SHOT });
  await browser.close();
  process.exit(1);
}

await page.goto(`${APP}/contatos`, { waitUntil: "domcontentloaded" });
const hasTitle = await page
  .waitForSelector('h1:has-text("Contatos")', { timeout: 20000 })
  .then(() => true)
  .catch(() => false);
await page.waitForTimeout(1200);
const rows = await page.locator("table tbody tr").count();
const hasComercial = await page.locator('text=Comercial').first().isVisible().catch(() => false);
const hasGeral = await page.locator('text=Geral').first().isVisible().catch(() => false);
const chips = await page.locator('button:has-text("No funil")').count();

await page.screenshot({ path: SHOT });
console.log("título Contatos:", hasTitle ? "✔" : "✖");
console.log("linhas na tabela:", rows);
console.log("sidebar Comercial:", hasComercial ? "✔" : "✖", "| Geral:", hasGeral ? "✔" : "✖");
console.log("chips de filtro:", chips > 0 ? "✔" : "✖");

// mobile: bottom bar tem Contatos?
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(800);
const mobileTab = await page.locator('nav a:has-text("Contatos")').first().isVisible().catch(() => false);
console.log("bottom bar mobile com Contatos:", mobileTab ? "✔" : "✖");
await page.screenshot({ path: SHOT.replace(".png", "-mobile.png") });

await browser.close();
await admin.auth.admin.deleteUser(uid);
await admin.from("profiles").delete().eq("id", uid);
console.log("limpeza feita");
process.exit(0);
