// Teste E2E temporário: o "digitando…" aparece na UI de verdade?
// Cria usuário de teste, loga no Chrome (Playwright) na PRODUÇÃO, abre o
// OPS Chat, injeta presença no banco e verifica a renderização.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = {};
for (const line of readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim();
}

const APP = "https://traciona-eco-sistema.vercel.app";
const LEAD64 = "f49be3d1-5266-4287-a776-33744e96f1b5"; // Adriano Alves (64)
const EMAIL = "e2e-typing@traciona.internal";
const PASS = "E2e-typing-2026!x";
const SHOT = process.argv[2] || "e2e-typing.png";

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// 1) usuário + profile de teste
let uid = null;
const { data: created, error: cErr } = await admin.auth.admin.createUser({
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
  console.log("FALHA: não criou usuário:", cErr?.message);
  process.exit(1);
}
await admin.from("profiles").upsert({
  id: uid,
  name: "E2E Teste",
  email: EMAIL,
  role: "admin",
  sector: "vendas",
  active: true,
});
console.log("usuário de teste pronto");

// 2) navegador real
const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 200));
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));
page.on("response", (r) => {
  if (r.status() >= 500) console.log("HTTP", r.status(), r.url().slice(0, 120));
});

// espiona o WebSocket do realtime: com que token os canais entram + o que chega
const wsLog = [];
page.on("websocket", (ws) => {
  if (!ws.url().includes("realtime")) return;
  ws.on("framesent", (f) => {
    try {
      const j = JSON.parse(f.payload);
      if (j.event === "phx_join") {
        const tok = j.payload?.access_token ?? j.payload?.config?.access_token ?? "";
        const kind = !tok
          ? "SEM-TOKEN"
          : tok === process.env.__ANON
          ? "ANON"
          : "JWT-USUARIO";
        wsLog.push(`JOIN ${j.topic} token=${kind}`);
      }
    } catch {}
  });
  ws.on("framereceived", (f) => {
    try {
      const j = JSON.parse(f.payload);
      if (j.event === "postgres_changes") {
        const table = j.payload?.data?.table ?? "?";
        wsLog.push(`EVENTO recebido: ${table}`);
      }
      if (j.event === "phx_reply" && j.payload?.status === "error") {
        wsLog.push(`ERRO canal ${j.topic}: ${JSON.stringify(j.payload).slice(0, 150)}`);
      }
      if (j.event === "system") {
        wsLog.push(`SYSTEM ${j.topic}: ${JSON.stringify(j.payload).slice(0, 150)}`);
      }
    } catch {}
  });
});
process.env.__ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500); // hidratação do React
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASS);
await page.click('button[type="submit"]');
const navigated = await page
  .waitForURL((u) => !String(u).includes("/login"), { timeout: 20000 })
  .then(() => true)
  .catch(() => false);
if (!navigated) {
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log("LOGIN NAO NAVEGOU. Texto da página:", JSON.stringify(bodyText));
  await page.screenshot({ path: SHOT });
  await browser.close();
  process.exit(1);
}
console.log("logado, indo pro /chat");

await page.goto(`${APP}/chat`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("text=OPS Chat", { timeout: 25000 });
console.log("chat aberto — esperando canais assinarem (4s)");
await page.waitForTimeout(4000);

// 3) injeta presença (repetida, como digitação real) e observa a UI
const inject = () =>
  admin.from("chat_presence").upsert({
    lead_id: LEAD64,
    state: "composing",
    at: new Date().toISOString(),
  });
await inject();
const injector = setInterval(() => void inject(), 2500);
console.log("presença composing injetada (repetindo a cada 2,5s)");

const appeared = await page
  .waitForSelector("text=digitando", { timeout: 15000 })
  .then(() => true)
  .catch(() => false);
clearInterval(injector);

await page.screenshot({ path: SHOT });
console.log(appeared ? ">>> DIGITANDO APARECEU NA UI ✔" : ">>> NAO apareceu na UI ✖");
console.log("--- log do WebSocket realtime:");
for (const l of wsLog.slice(0, 40)) console.log(" ", l);
if (consoleErrors.length) {
  console.log("erros de console:", JSON.stringify(consoleErrors.slice(0, 8), null, 1));
}

await browser.close();
// limpeza
await admin.from("chat_presence").delete().eq("lead_id", LEAD64);
await admin.auth.admin.deleteUser(uid);
await admin.from("profiles").delete().eq("id", uid);
console.log("limpeza feita");
process.exit(0);
