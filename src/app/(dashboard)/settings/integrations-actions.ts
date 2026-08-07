"use server";

import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  getIntegrationSecret,
  setIntegrationSecret,
  bustIntegrationCache,
} from "@/lib/integrations";
import { getStatus, adminListInstances } from "@/lib/whatsapp/dinastia";
import { accountInfo, autentiqueConfigured } from "@/lib/autentique";
import { getBalance, asaasConfigured } from "@/lib/asaas";

// Central de Integrações (Configurações). Chaves salvas no cofre do banco
// (RLS sem policy — navegador nunca lê); .env segue como reserva. Toda
// chave é TESTADA na API real antes de salvar.

async function ensureAdmin() {
  const profile = await getProfile();
  if (!can.manageTeam(profile.role)) throw new Error("Sem permissão.");
}

export type IntegrationStatus = {
  configured: boolean;
  ok: boolean;
  detail: string;
  source: "painel" | "env" | null;
};

export async function getIntegrationsStatus(): Promise<{
  dinastiapi: IntegrationStatus;
  autentique: IntegrationStatus;
  asaas: IntegrationStatus;
}> {
  await ensureAdmin();

  const [dinDb, autDb, asaDb] = await Promise.all([
    getIntegrationSecret("dinastiapi"),
    getIntegrationSecret("autentique"),
    getIntegrationSecret("asaas"),
  ]);

  // DinastiAPI: sessão do número principal + token admin
  let dinastiapi: IntegrationStatus = {
    configured: false,
    ok: false,
    detail: "Sem conexão.",
    source: null,
  };
  try {
    const s = await getStatus();
    const d = (s.data ?? {}) as {
      connected?: boolean;
      loggedIn?: boolean;
      jid?: string;
    };
    const numero = d.jid ? d.jid.split("@")[0].split(":")[0] : null;
    const adminOk = (await adminListInstances()) !== null;
    dinastiapi = {
      configured: true,
      ok: !!(s.ok && d.connected && d.loggedIn),
      detail:
        s.ok && d.connected && d.loggedIn
          ? `Número ${numero ?? "—"} conectado${adminOk ? " · token admin válido" : " · token admin FALHOU"}`
          : "Sessão do WhatsApp desconectada — conecte em OPS Chat → Configurações → Número.",
      source: dinDb.adminToken ? "painel" : "env",
    };
  } catch {
    /* mantém o default */
  }

  // Autentique
  let autentique: IntegrationStatus = {
    configured: await autentiqueConfigured(),
    ok: false,
    detail: "Chave não configurada.",
    source: autDb.token ? "painel" : process.env.AUTENTIQUE_TOKEN ? "env" : null,
  };
  if (autentique.configured) {
    const acc = await accountInfo();
    autentique.ok = !acc.error;
    autentique.detail = acc.error
      ? `Falha: ${acc.error}`
      : `Conta ${acc.name ?? "—"} (${acc.email ?? "—"})`;
  }

  // Asaas
  let asaas: IntegrationStatus = {
    configured: await asaasConfigured(),
    ok: false,
    detail: "Chave não configurada.",
    source: asaDb.apiKey ? "painel" : process.env.ASAAS_API_KEY ? "env" : null,
  };
  if (asaas.configured) {
    const bal = await getBalance();
    asaas.ok = !bal.error;
    const amb = (
      asaDb.apiUrl ||
      process.env.ASAAS_API_URL ||
      ""
    ).includes("sandbox")
      ? "sandbox"
      : "produção";
    asaas.detail = bal.error
      ? `Falha: ${bal.error}`
      : `Conectado (${amb}) · saldo ${new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(bal.balance ?? 0)}`;
  }

  return { dinastiapi, autentique, asaas };
}

/** Salva a chave DEPOIS de testar na API real. */
export async function saveIntegration(kind: string, form: FormData) {
  await ensureAdmin();
  const s = (k: string) => String(form.get(k) ?? "").trim();

  if (kind === "dinastiapi") {
    const adminToken = s("admin_token");
    if (!adminToken) return { error: "Cole o token admin." };
    const base = (process.env.WHATSAPP_API_URL ?? "").replace(/\/+$/, "");
    const r = await fetch(`${base}/admin/users`, {
      headers: { Authorization: adminToken },
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    if (!r?.ok)
      return { error: `Token admin recusado pela DinastiAPI (${r?.status ?? "sem resposta"}).` };
    await setIntegrationSecret("dinastiapi", { adminToken });
    bustIntegrationCache("dinastiapi");
    return { ok: true };
  }

  if (kind === "autentique") {
    const token = s("token");
    if (!token) return { error: "Cole o token da API." };
    const r = await fetch("https://api.autentique.com.br/v2/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "query { me { name } }" }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : null;
    if (!r?.ok || !j?.data?.me)
      return { error: "Token recusado pela Autentique." };
    await setIntegrationSecret("autentique", { token });
    bustIntegrationCache("autentique");
    return { ok: true, detail: `Conta ${j.data.me.name}` };
  }

  if (kind === "asaas") {
    const apiKey = s("api_key");
    const apiUrl =
      s("environment") === "sandbox"
        ? "https://api-sandbox.asaas.com/v3"
        : "https://api.asaas.com/v3";
    if (!apiKey) return { error: "Cole a chave da API." };
    const r = await fetch(`${apiUrl}/customers?limit=1`, {
      headers: { access_token: apiKey },
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    if (!r?.ok) return { error: `Chave recusada pelo Asaas (${r?.status ?? "sem resposta"}).` };
    await setIntegrationSecret("asaas", { apiKey, apiUrl });
    bustIntegrationCache("asaas");
    return { ok: true };
  }

  return { error: "Integração desconhecida." };
}
