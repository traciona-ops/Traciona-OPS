// Verificação E2E do módulo src/components/chat/ (workspace + conversa):
// o shell estilo GronerZap renderiza e reage?
//
// SÓ LEITURA nos dados de lead: percorre o rail (conversas, dashboards, filas,
// configurações), abre uma conversa existente e confere lista, pills, cabeçalho,
// bolhas, composer, respostas rápidas, painel do lead e o botão flutuante do dock.
// Nada é enviado, agendado ou alterado. Roda contra o dev local.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = {};
for (const line of readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim();
}

const APP = process.argv[2] || "http://localhost:3000";
const SHOT = process.argv[3] || "chat-refactor.png";
const EMAIL = "e2e-chat-refactor@traciona.internal";
const PASS = "E2e-chat-refactor-2026!x";

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const results = [];
const check = (name, ok, extra = "") =>
  results.push(`${ok ? "OK  " : "FALHA"} ${name}${extra ? ` — ${extra}` : ""}`);

// 1) usuário admin de teste
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
  name: "E2E Refactor",
  email: EMAIL,
  role: "admin",
  sector: "vendas",
  active: true,
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));

// os canais de realtime viraram dois hooks (mensagens + presença): confere que
// os DOIS continuam entrando no WebSocket.
const joinedTopics = new Set();
page.on("websocket", (ws) => {
  if (!ws.url().includes("realtime")) return;
  ws.on("framesent", (f) => {
    try {
      const j = JSON.parse(f.payload);
      // objeto {topic,event} ou array do serializer v2 [ref,join,topic,event,..]
      if (j.event === "phx_join" && j.topic) joinedTopics.add(j.topic);
      else if (Array.isArray(j) && j[3] === "phx_join" && j[2]) joinedTopics.add(j[2]);
    } catch {}
  });
});

try {
  await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !String(u).includes("/login"), { timeout: 40000 });

  // o header mostra o nome do número ativo, então o rail é a âncora estável
  await page.goto(`${APP}/chat`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('nav[aria-label="Navegação do chat"]', {
    timeout: 60000,
  });
  await page.waitForTimeout(3000);

  // --- Rail do shell (ChatRail) ---
  const rail = page.locator('nav[aria-label="Navegação do chat"]');
  check("shell: rail renderiza", (await rail.count()) > 0);
  for (const label of [
    "Conversas",
    "Minha dashboard",
    "Dashboard de atendimentos",
    "Filas de atendimento",
    "Configurações",
  ]) {
    check(
      `rail: ${label}`,
      (await rail.getByRole("button", { name: label }).count()) > 0
    );
  }

  // "Todas" é a timeline do CRM — as pills de fila dependem de sessão aberta,
  // que pode não existir. Garante a lista cheia antes de abrir uma conversa.
  const pillTodas = page
    .locator("aside button")
    .filter({ hasText: /^Todas/ })
    .first();
  if (await pillTodas.count()) {
    await pillTodas.click();
    await page.waitForTimeout(1500);
  }

  // abre a primeira conversa da lista (linha da lista, não coordenada fixa)
  const primeiraConversa = page
    .locator("aside div.overflow-y-auto > button")
    .first();
  if (!(await page.locator("textarea").count())) {
    if (await primeiraConversa.count()) {
      await primeiraConversa.click();
      await page.waitForSelector("textarea", { timeout: 40000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }
  }

  // --- Composer (MessageComposer) ---
  const hasComposer = (await page.locator("textarea").count()) > 0;
  check("composer renderiza (textarea)", hasComposer);

  // --- Cabeçalho (ChatHeader) ---
  check(
    "cabeçalho: botão sincronizar",
    (await page.getByRole("button", { name: "Sincronizar mensagens" }).count()) > 0
  );
  check(
    "cabeçalho: histórico de movimentação",
    (await page.getByRole("button", { name: "Histórico de movimentação" }).count()) > 0
  );
  check(
    "cabeçalho: marcar como não lida",
    (await page.getByRole("button", { name: "Marcar como não lida" }).count()) > 0
  );

  // popover do histórico abre (só leitura)
  const histBtn = page.getByRole("button", { name: "Histórico de movimentação" }).first();
  if (await histBtn.count()) {
    await histBtn.click();
    await page.waitForTimeout(1500);
    check(
      "popover de histórico abre",
      await page
        .locator("p", { hasText: "Histórico de movimentação" })
        .first()
        .isVisible()
        .catch(() => false)
    );
    await page.mouse.click(700, 400); // clica no overlay pra fechar
    await page.waitForTimeout(400);
  }

  // --- Respostas rápidas (QuickReplyPicker) ---
  const qrBtn = page.getByRole("button", { name: "Respostas rápidas" }).first();
  if (await qrBtn.count()) {
    await qrBtn.click();
    await page.waitForTimeout(800);
    check(
      "picker de respostas rápidas abre",
      await page
        .getByPlaceholder("Buscar (ou digite / na mensagem)")
        .isVisible()
        .catch(() => false)
    );
    await page.mouse.click(700, 300);
    await page.waitForTimeout(400);
  } else {
    check("picker de respostas rápidas abre", false, "botão não encontrado");
  }

  // --- Menu de anexo (AttachMenu) ---
  const attachBtn = page.getByRole("button", { name: "Anexar" }).first();
  if (await attachBtn.count()) {
    await attachBtn.click();
    await page.waitForTimeout(700);
    check("menu de anexo abre", (await page.locator("text=Fotos e vídeos").count()) > 0);
    await page.mouse.click(700, 300);
    await page.waitForTimeout(400);
  } else {
    check("menu de anexo abre", false, "botão não encontrado");
  }

  // --- Agendar (SchedulePopover) — abre e fecha, NÃO agenda nada ---
  const schedBtn = page.getByRole("button", { name: "Agendar envio" }).first();
  if (await schedBtn.count()) {
    await schedBtn.click();
    await page.waitForTimeout(700);
    check("popover de agendar abre", (await page.locator("text=Agendar para").count()) > 0);
    await schedBtn.click();
    await page.waitForTimeout(300);
  } else {
    check("popover de agendar abre", false, "botão não encontrado");
  }

  // --- Digitação: escreve na caixa e apaga (não envia) ---
  const ta = page.locator("textarea").first();
  if (await ta.count()) {
    await ta.fill("teste de digitação do refactor");
    await page.waitForTimeout(600);
    check(
      "botão enviar aparece ao digitar",
      (await page.getByRole("button", { name: "Enviar" }).count()) > 0
    );
    await ta.fill("");
    await page.waitForTimeout(400);
    check(
      "volta pro botão de áudio ao limpar",
      (await page.getByRole("button", { name: "Gravar áudio" }).count()) > 0
    );
  }

  // --- Painel do lead (LeadPanel + seções) ---
  // os rótulos vêm em caixa alta por CSS (uppercase) → compara sem caixa.
  // "Etapa" só aparece quando o lead tem card no funil, por isso fica de fora.
  const body = (await page.evaluate(() => document.body.innerText)).toLowerCase();
  for (const needle of [
    "responsável",
    "setor",
    "valor",
    "tags",
    "tarefas",
    "agendamentos",
    "notas internas",
  ]) {
    check(`painel do lead: seção ${needle}`, body.includes(needle));
  }

  // --- Lista de conversas (ConversationList + QueuePillsList) ---
  const busca = page.getByPlaceholder("Pesquisar conversas");
  check("lista: campo de busca", await busca.isVisible().catch(() => false));

  // Sem sessions_enabled só existem as pills de CRM (Minhas/Todas); com a flag
  // ligada entram Aguardando/Em atendimento/Encerradas.
  const pills = page.locator("aside button").filter({ hasText: /^(Minhas|Todas)/ });
  check("lista: pills de fila", (await pills.count()) >= 2);

  // busca que não casa → estado vazio
  await busca.fill("zzzzzznaoexiste");
  await page.waitForTimeout(700);
  check(
    "lista: estado vazio de busca",
    (await page.locator("text=Nenhuma conversa com esses filtros").count()) > 0
  );
  await busca.fill("");
  await page.waitForTimeout(700);
  check(
    "lista: limpar a busca traz as conversas de volta",
    (await page.locator("text=Nenhuma conversa com esses filtros").count()) === 0
  );

  // --- Nova conversa (NewConversation) ---
  const novaBtn = page.getByRole("button", { name: "Nova conversa" }).first();
  if (await novaBtn.count()) {
    await novaBtn.click();
    await page.waitForTimeout(700);
    check(
      "painel de nova conversa abre",
      await page
        .getByPlaceholder("Buscar lead por nome ou número")
        .isVisible()
        .catch(() => false)
    );
    await novaBtn.click();
    await page.waitForTimeout(400);
  } else {
    check("painel de nova conversa abre", false, "botão não encontrado");
  }

  // --- Views do rail: dashboards e filas ---
  const irPara = async (label) => {
    await rail.getByRole("button", { name: label }).click();
    await page.waitForTimeout(2000);
  };

  await irPara("Minha dashboard");
  check(
    "view: minha dashboard renderiza",
    (await page.getByRole("heading", { name: "Minha dashboard" }).count()) > 0 &&
      (await page.locator("text=Tempo médio de atendimento").count()) > 0
  );

  await irPara("Dashboard de atendimentos");
  check(
    "view: dashboard de atendimentos renderiza",
    (await page.getByRole("heading", { name: "Dashboard de atendimentos" }).count()) > 0
  );

  await irPara("Filas de atendimento");
  check(
    "view: admin de filas renderiza",
    (await page.getByRole("heading", { name: "Filas de atendimento" }).count()) > 0
  );

  await irPara("Conversas");
  check(
    "rail volta pras conversas",
    await busca.isVisible().catch(() => false)
  );

  // --- Menu ⋮ do header do número ---
  const maisBtn = page.getByRole("button", { name: "Mais opções" }).first();
  if (await maisBtn.count()) {
    await maisBtn.click();
    await page.waitForTimeout(500);
    check(
      "menu ⋮ abre",
      (await page.locator("text=Marcar todas como lidas").count()) > 0 &&
        (await page.locator("text=Recarregar chat").count()) > 0
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    // --- Configurações pelo rail (ChatSettings) ---
    // Admin cai direto na seção Números; o menu fica um "Voltar" atrás.
    await irPara("Configurações");
    const voltar = () => page.getByRole("button", { name: "Voltar" }).first();
    check(
      "configurações → Números (lista + toggles)",
      (await page.locator("text=Configurações do número").count()) > 0
    );

    await voltar().click();
    await page.waitForTimeout(800);
    const temMenuPrefs =
      (await page.locator("text=Mensagens Rápidas").count()) > 0 &&
      (await page.locator("text=Preferências").count()) > 0;
    check("central de configurações abre (menu)", temMenuPrefs);

    // seção Mensagens Rápidas — só leitura da lista
    if (temMenuPrefs) {
      await page.locator("text=Mensagens Rápidas").first().click();
      await page.waitForTimeout(1500);
      check(
        "configurações → Mensagens Rápidas",
        (await page.locator("text=Templates").count()) > 0 &&
          (await page.locator("text=Novo template").count()) > 0
      );
      await voltar().click();
      await page.waitForTimeout(600);
    }

    // seção Preferências (cor do chat) — não muda nada, só abre
    if (temMenuPrefs) {
      await page.locator("text=Preferências").first().click();
      await page.waitForTimeout(800);
      check(
        "configurações → Preferências (cor do chat)",
        (await page.locator("text=Cor do chat").count()) > 0
      );
      // volta pro menu e sai da central
      await voltar().click();
      await page.waitForTimeout(500);
      await voltar().click();
      await page.waitForTimeout(800);
    }
    check(
      "sai das configurações e volta pra lista",
      await busca.isVisible().catch(() => false)
    );
  }

  // --- Realtime: canal de mensagens e canal de presença ---
  const topics = [...joinedTopics];
  check(
    "realtime: canal de mensagens (wa-chat-*)",
    topics.some((t) => /wa-chat-(?!presence)/.test(t)),
    topics.join(", ").slice(0, 160)
  );
  check(
    "realtime: canal de presença (wa-chat-presence-*)",
    topics.some((t) => t.includes("wa-chat-presence-"))
  );

  await page.screenshot({ path: SHOT, fullPage: false });

  // --- Dock: botão flutuante numa página do sistema abre o mesmo workspace ---
  await page.goto(`${APP}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000); // o dock é lazy (chunk separado)
  const dockBtn = page.getByRole("button", { name: "OPS Chat" }).first();
  const temDock = await dockBtn.isVisible().catch(() => false);
  check("dock: botão flutuante aparece", temDock);
  if (temDock) {
    await dockBtn.click();
    await page.waitForTimeout(3000);
    const buscaDock = page.getByPlaceholder("Pesquisar conversas");
    check(
      "dock: modal abre com a lista de conversas",
      await buscaDock.isVisible().catch(() => false)
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    check(
      "dock: Escape fecha o modal",
      !(await buscaDock.isVisible().catch(() => false))
    );
  }
} catch (e) {
  check("execução do teste", false, String(e).slice(0, 300));
  await page.screenshot({ path: SHOT }).catch(() => {});
}

console.log(results.join("\n"));
const realErrors = consoleErrors.filter(
  (e) => !/favicon|404|Download the React DevTools|hydrat/i.test(e)
);
if (realErrors.length) {
  console.log("\nerros de console:");
  for (const e of realErrors.slice(0, 10)) console.log(" -", e);
} else {
  console.log("\nsem erros de console relevantes");
}

await browser.close();
await admin.auth.admin.deleteUser(uid);
await admin.from("profiles").delete().eq("id", uid);
process.exit(results.some((r) => r.startsWith("FALHA")) ? 1 : 0);
