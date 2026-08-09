"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import { can, NOT_ALLOWED } from "@/lib/permissions";
import {
  getStatus,
  connectSession,
  getQR,
  disconnectSession,
  logoutSession,
  requestFullHistorySync,
  getAvatar,
  adminCreateInstance,
} from "@/lib/services/whatsapp/dinastia";
import { tokenForNumberId } from "@/lib/services/whatsapp/numbers";
import { headers as nextHeaders } from "next/headers";
import type { UserRole, Sector } from "@/lib/types";

// Só admin gerencia equipe. Estas actions usam o service role (bypassa RLS),
// então esta checagem é a ÚNICA trava — precisa estar em todas.
async function requireAdmin(): Promise<
  { id: string } | { error: string }
> {
  const profile = await getProfile();
  if (!can.manageTeam(profile.role)) return { error: NOT_ALLOWED };
  return { id: profile.id };
}

/** Cada um sobe a PRÓPRIA foto de perfil (escopo travado ao id do logado). */
export async function updateMyAvatar(formData: FormData) {
  const me = await getProfile();
  const file = formData.get("file") as File | null;
  if (!file) return { error: "Nenhum arquivo enviado." };
  if (!file.type.startsWith("image/"))
    return { error: "Envie uma imagem (JPG/PNG)." };
  if (file.size > 5 * 1024 * 1024)
    return { error: "Imagem acima de 5MB." };

  const admin = createAdminClient();
  const buf = Buffer.from(await file.arrayBuffer());
  const path = `profile-${me.id}.jpg`;
  const { error: upErr } = await admin.storage
    .from("avatars")
    .upload(path, buf, { contentType: file.type, upsert: true });
  if (upErr) return { error: `Upload falhou: ${upErr.message}` };

  const publicUrl = admin.storage.from("avatars").getPublicUrl(path).data
    .publicUrl;
  const finalUrl = `${publicUrl}?v=${Date.now()}`; // cache-buster
  const { error } = await admin
    .from("profiles")
    .update({ avatar_url: finalUrl })
    .eq("id", me.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true, url: finalUrl };
}

/** Remove a própria foto → volta pras iniciais. */
export async function removeMyAvatar() {
  const me = await getProfile();
  const admin = createAdminClient();
  await admin.storage.from("avatars").remove([`profile-${me.id}.jpg`]);
  await admin.from("profiles").update({ avatar_url: null }).eq("id", me.id);
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function createTeamMember(input: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  sector: Sector;
}) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name },
  });

  if (error) return { error: traduz(error.message) };
  const id = data.user?.id;
  if (!id) return { error: "Falha ao criar usuário." };

  // Garante o profile com os dados corretos (independe do trigger)
  const { error: pErr } = await admin.from("profiles").upsert({
    id,
    name: input.name,
    email: input.email,
    role: input.role,
    sector: input.sector,
    active: true,
  });
  if (pErr) return { error: pErr.message };

  revalidatePath("/settings");
  revalidatePath("/crm");
  return { ok: true };
}

export async function updateMemberSector(id: string, sector: Sector) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ sector }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/crm");
  return { ok: true };
}

/** A operação deixaria o sistema sem NENHUM admin ativo? (auto-lockout) */
async function wouldRemoveLastAdmin(
  admin: ReturnType<typeof createAdminClient>,
  targetId: string
): Promise<boolean> {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("active", true);
  const admins = (data ?? []).map((r) => (r as { id: string }).id);
  return admins.length === 1 && admins[0] === targetId;
}

export async function updateMemberRole(id: string, role: UserRole) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const admin = createAdminClient();
  if (role !== "admin" && (await wouldRemoveLastAdmin(admin, id))) {
    return { error: "Precisa haver ao menos um admin ativo no sistema." };
  }
  const { error } = await admin.from("profiles").update({ role }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function toggleMemberActive(id: string, active: boolean) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const admin = createAdminClient();
  if (!active && (await wouldRemoveLastAdmin(admin, id))) {
    return { error: "Precisa haver ao menos um admin ativo no sistema." };
  }
  const { error } = await admin
    .from("profiles")
    .update({ active })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/crm");
  return { ok: true };
}

export async function deleteTeamMember(id: string) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  if (guard.id === id) return { error: "Você não pode remover a si mesmo." };
  const admin = createAdminClient();
  if (await wouldRemoveLastAdmin(admin, id)) {
    return { error: "Precisa haver ao menos um admin ativo no sistema." };
  }
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/crm");
  return { ok: true };
}

// ---------- Meta mensal de faturamento ----------

export async function setMonthlyGoal(month: string, target: number) {
  const profile = await getProfile();
  if (!["admin", "gestor"].includes(profile.role)) return { error: NOT_ALLOWED };
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Mês inválido." };
  const t = Number(target);
  if (!Number.isFinite(t) || t < 0) return { error: "Valor de meta inválido." };

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { error } = await supabase
    .from("org_goals")
    .upsert({ month, revenue_target: t, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  revalidatePath("/");
  return { ok: true };
}

// ---------- Conexão WhatsApp (DinastiAPI) — admin only ----------

export async function getWhatsappState(numberId?: string) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const s = await getStatus(await tokenForNumberId(numberId));
  const d = (s.data ?? {}) as Record<string, unknown>;
  const connected = !!(d.connected ?? d.Connected);
  const loggedIn = !!(d.loggedIn ?? d.LoggedIn ?? d.logged_in);
  // O QR durante o pareamento vem no próprio status (qrcode); o /session/qr dá 500 sem client.
  const raw = String(d.qrcode ?? d.QRCode ?? "");
  const qr = raw ? (raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`) : null;
  // JID do número conectado (nem toda build do wuzapi devolve — a UI trata null)
  const jid = String(d.jid ?? d.Jid ?? d.JID ?? "").trim() || null;
  return { ok: true as const, connected, loggedIn, qr, jid };
}

export async function connectWhatsapp(numberId?: string) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  return await connectSession(await tokenForNumberId(numberId));
}

export async function fetchWhatsappQR() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  return await getQR();
}

export async function disconnectWhatsapp(numberId?: string) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  return await disconnectSession(await tokenForNumberId(numberId));
}

export async function logoutWhatsapp(numberId?: string) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  return await logoutSession(await tokenForNumberId(numberId));
}

// ===================== multi-número =====================

/** Lista os números (SEM token — segredo nunca vai pro browser). */
export async function listWaNumbers() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("wa_numbers")
    .select("id, name, jid, env_default, active, created_at")
    .eq("active", true)
    .order("env_default", { ascending: false })
    .order("created_at");
  if (error) return { error: error.message };
  return {
    ok: true as const,
    numbers: (data ?? []) as {
      id: string;
      name: string;
      jid: string | null;
      env_default: boolean;
      active: boolean;
      created_at: string;
    }[],
  };
}

/**
 * "+ Adicionar Número": cria a instância na DinastiAPI já apontando pro
 * nosso webhook (com ?n=<id> pra rotear as mensagens) e registra no banco.
 * Depois é só abrir o número e escanear o QR.
 */
export async function addWaNumber(name: string) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const clean = name.trim();
  if (!clean) return { error: "Dê um nome pro número (ex.: Financeiro)." };

  const id = crypto.randomUUID();
  const h = await nextHeaders();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET ?? "";
  if (!host || !secret) return { error: "Webhook não configurável (host/secret)." };
  const webhookUrl = `${proto}://${host}/api/whatsapp/webhook?secret=${secret}&n=${id}`;

  const r = await adminCreateInstance(clean, webhookUrl);
  if (!r.ok) return { error: r.error };

  const admin = createAdminClient();
  const { error } = await admin.from("wa_numbers").insert({
    id,
    name: clean,
    token: r.token,
    instance_id: r.id || null,
  });
  if (error) return { error: error.message };
  return { ok: true as const, id };
}

/** Renomeia o número (só o rótulo no nosso sistema). */
export async function renameWaNumber(id: string, name: string) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const clean = name.trim();
  if (!clean) return { error: "Nome não pode ficar vazio." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("wa_numbers")
    .update({ name: clean })
    .eq("id", id);
  if (error) return { error: error.message };
  return { ok: true as const };
}

/**
 * Remove o número do sistema (active = false). A instância continua
 * existindo na DinastiAPI — mensagens antigas ficam intactas e a conversa
 * volta a responder pelo número principal.
 */
export async function removeWaNumber(id: string) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const admin = createAdminClient();
  const { error } = await admin
    .from("wa_numbers")
    .update({ active: false })
    .eq("id", id)
    .eq("env_default", false); // o principal nunca sai
  if (error) return { error: error.message };
  return { ok: true as const };
}

/**
 * Pede ao WhatsApp o histórico dos últimos 30 dias. Disparado automaticamente
 * pela UI ao conectar (1×/dia). O histórico chega assíncronamente pelo webhook
 * como eventos `HistorySync` — não é processado aqui.
 */
/**
 * Puxa as fotos de perfil do WhatsApp e guarda no bucket "avatars".
 * Processa um lote por chamada (limite do serverless). Só busca de novo se a
 * foto mudou (avatar_id). Retorna quantas atualizou e quantas faltam.
 */
export async function syncAvatars() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const admin = createAdminClient();

  const BATCH = 40;
  // Leads com telefone que ainda não têm foto (prioriza os sem avatar).
  const { data: leads } = await admin
    .from("leads")
    .select("id, phone, avatar_id")
    .not("phone", "is", null)
    .is("avatar_url", null)
    .limit(BATCH);

  const list = leads ?? [];
  let updated = 0;
  for (const lead of list) {
    const av = await getAvatar(lead.phone as string);
    if (!av) continue;
    // se a foto é a mesma que já temos, pula
    if (lead.avatar_id && av.id && lead.avatar_id === av.id) continue;
    try {
      // av.base64 é um data URI "data:image/jpeg;base64,...."
      const comma = av.base64.indexOf(",");
      const buf = Buffer.from(av.base64.slice(comma + 1), "base64");
      const path = `${lead.id}.jpg`;
      const { error: upErr } = await admin.storage
        .from("avatars")
        .upload(path, buf, { contentType: "image/jpeg", upsert: true });
      if (upErr) continue;
      const publicUrl = admin.storage.from("avatars").getPublicUrl(path).data
        .publicUrl;
      // cache-buster pelo id da foto pra atualizar quando trocar
      const finalUrl = `${publicUrl}?v=${av.id ?? Date.now()}`;
      await admin
        .from("leads")
        .update({
          avatar_url: finalUrl,
          avatar_id: av.id,
          avatar_checked_at: new Date().toISOString(),
        })
        .eq("id", lead.id);
      updated++;
    } catch {
      /* pula esse lead */
    }
  }

  const { count: remaining } = await admin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .not("phone", "is", null)
    .is("avatar_url", null);

  revalidatePath("/crm");
  revalidatePath("/crm/mensagens");
  return { ok: true, updated, remaining: remaining ?? 0 };
}

export async function requestChatHistory() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard;
  const r = await requestFullHistorySync({
    days: 30,
    sizeMb: 500,
    includeGroups: false,
    includeCalls: false,
  });
  if (!r.ok) return { error: r.error };
  return { ok: true, requestId: r.requestId };
}

function traduz(msg: string): string {
  if (msg.includes("already been registered") || msg.includes("already exists"))
    return "Esse e-mail já tem conta.";
  if (msg.toLowerCase().includes("password"))
    return "Senha inválida (mínimo 6 caracteres).";
  return msg;
}
