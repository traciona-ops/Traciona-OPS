// Smoke test das rotas do dashboard: cada tela abre sem 500 e sem erro de
// runtime? Serve pra pegar import quebrado depois de mover arquivo de lugar.
// SÓ LEITURA: navega e olha. Não clica em nada que altere dado.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = {};
for (const line of readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim();
}

const APP = process.argv[2] || "http://localhost:3000";
const EMAIL = "e2e-routes@traciona.internal";
const PASS = "E2e-routes-2026!x";

const ROUTES = [
  "/",
  "/agenda",
  "/disponibilidade",
  "/playbooks",
  "/contatos",
  "/crm",
  "/crm/relatorios",
  "/atividades",
  "/contratos",
  "/vendas",
  "/chat",
  "/settings",
  "/settings/conta",
  "/settings/usuarios",
  "/settings/permissoes",
  "/settings/funis",
  "/settings/integracoes",
];

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
  name: "E2E Rotas",
  email: EMAIL,
  role: "admin",
  sector: "vendas",
  active: true,
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASS);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !String(u).includes("/login"), { timeout: 60000 });

let falhas = 0;
for (const route of ROUTES) {
  const erros = [];
  const onErr = (e) => erros.push(String(e).slice(0, 160));
  page.on("pageerror", onErr);

  const res = await page
    .goto(`${APP}${route}`, { waitUntil: "domcontentloaded", timeout: 90000 })
    .catch((e) => ({ status: () => `nav-fail: ${String(e).slice(0, 80)}` }));
  await page.waitForTimeout(2500);

  const status = typeof res?.status === "function" ? res.status() : "?";
  // rota que redireciona (ex.: /settings) destrói o contexto no meio: espera
  // assentar e tenta de novo antes de ler a página.
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  const body = await page
    .evaluate(() => document.body.innerText.slice(0, 400))
    .catch(async () => {
      await page.waitForTimeout(1500);
      return page
        .evaluate(() => document.body.innerText.slice(0, 400))
        .catch(() => "");
    });
  // Next mostra a mensagem do erro na página em dev
  const temErro =
    /Unhandled Runtime Error|Application error|Module not found|Cannot find module|is not defined|Internal Server Error/i.test(
      body
    );

  page.off("pageerror", onErr);
  const ok = status === 200 && !temErro && erros.length === 0;
  if (!ok) falhas++;
  console.log(
    `${ok ? "OK  " : "FALHA"} ${route}  (HTTP ${status})` +
      (temErro ? ` — texto de erro na página: ${body.slice(0, 140)}` : "") +
      (erros.length ? ` — ${erros[0]}` : "")
  );
}

await browser.close();
await admin.auth.admin.deleteUser(uid);
await admin.from("profiles").delete().eq("id", uid);
console.log(falhas ? `\n${falhas} rota(s) com problema` : "\ntodas as rotas OK");
process.exit(falhas ? 1 : 0);
