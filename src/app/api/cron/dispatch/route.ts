import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendText,
  getStatus,
  getWebhookConfig,
  setWebhook,
  setGlobalPresence,
} from "@/lib/services/whatsapp/dinastia";
import { runTimeAutomations } from "@/lib/automations/engine";
import { sweepAvatars } from "@/lib/services/whatsapp/avatar";
import { sweepNumberNames } from "@/lib/services/whatsapp/names";
import { sweepLids } from "@/lib/services/whatsapp/lids";

// Dispara as mensagens agendadas vencidas.
// Chamado a cada minuto pelo pg_cron (pg_net) com header x-cron-secret.
// Também aceita ?secret= para teste manual.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DueRow = {
  id: string;
  body: string;
  created_by: string | null;
  attempts: number;
  lead: { id: string; name: string; phone: string | null } | null;
};

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5 * 60_000;
const STUCK_AFTER_MS = 10 * 60_000;

async function dispatch(req: Request) {
  // Secret só por header (pg_cron envia x-cron-secret). Tiramos a query string
  // de propósito — ela apareceria nos logs de proxy/Vercel.
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");
  // Fail-closed: sem secret configurado OU secret errado → 401.
  if (!secret || provided !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowISO = new Date().toISOString();

  // 0. resgate: linhas presas em 'processing' (processo morreu no meio do
  //    envio) voltam pra fila depois de 10 min em vez de sumir pra sempre.
  await admin
    .from("scheduled_messages")
    .update({ status: "pending" })
    .eq("status", "processing")
    .lt("claimed_at", new Date(Date.now() - STUCK_AFTER_MS).toISOString());

  // 1+2. claim ATÔMICO: um único UPDATE ... WHERE status='pending' RETURNING.
  //      Dois ticks sobrepostos nunca pegam a mesma mensagem (o UPDATE do
  //      segundo não encontra mais linhas 'pending').
  const { data: claimed } = await admin
    .from("scheduled_messages")
    .update({ status: "processing", claimed_at: nowISO })
    .eq("status", "pending")
    .lte("send_at", nowISO)
    .select("id, body, created_by, attempts, lead:leads(id,name,phone)");

  let sent = 0;
  let failed = 0;
  const rows = (claimed ?? []) as unknown as DueRow[];

  for (const row of rows) {
    const phone = row.lead?.phone;
    if (!phone) {
      await admin
        .from("scheduled_messages")
        .update({ status: "failed", error: "Lead sem telefone." })
        .eq("id", row.id);
      failed++;
      continue;
    }

    const result = await sendText(phone, row.body);

    if (result.ok) {
      const { data: inserted } = await admin
        .from("whatsapp_messages")
        .insert({
          lead_id: row.lead!.id,
          direction: "out",
          body: row.body,
          status: "sent",
          provider: "dinastia",
          provider_msg_id: result.id,
          sent_by: row.created_by,
        })
        .select("id")
        .single();

      await admin
        .from("scheduled_messages")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          error: null,
          sent_message_id: inserted?.id ?? null,
        })
        .eq("id", row.id);

      await admin
        .from("leads")
        .update({ last_contact_at: new Date().toISOString() })
        .eq("id", row.lead!.id);
      sent++;
    } else if ((row.attempts ?? 0) + 1 < MAX_ATTEMPTS) {
      // erro transitório (instância fria/timeout): reagenda pra daqui a 5 min
      await admin
        .from("scheduled_messages")
        .update({
          status: "pending",
          attempts: (row.attempts ?? 0) + 1,
          send_at: new Date(Date.now() + RETRY_DELAY_MS).toISOString(),
          error: result.error,
        })
        .eq("id", row.id);
      failed++;
    } else {
      await admin
        .from("scheduled_messages")
        .update({
          status: "failed",
          sent_at: new Date().toISOString(),
          error: result.error,
        })
        .eq("id", row.id);
      failed++;
    }
  }

  // 3. Automações de tempo (parado X dias / sem resposta X dias → move card).
  //    Roda todo tick, mesmo sem mensagem agendada vencida. Nunca deixa a
  //    automação derrubar o dispatch de mensagens.
  let automated = 0;
  try {
    automated = await runTimeAutomations(admin);
  } catch (e) {
    console.log("[cron] automações falharam:", (e as Error).message);
  }

  // 4. Fotos de perfil: puxa quem está sem foto e revisa fotos antigas
  //    (novos leads já são cobertos pelo webhook; isto pega o resto).
  let avatars = 0;
  try {
    avatars = await sweepAvatars(admin, 8);
  } catch (e) {
    console.log("[cron] sync de avatares falhou:", (e as Error).message);
  }

  // 4b. Nomes: corrige leads salvos com o número no lugar do nome usando a
  //     agenda da instância (PushName). Novos casos são raros — o webhook já
  //     corrige na hora; isto pega o estoque antigo e o que escapar.
  let namesFixed = 0;
  try {
    namesFixed = await sweepNumberNames(admin, 30);
    if (namesFixed > 0) console.log(`[cron] nomes corrigidos: ${namesFixed}`);
  } catch (e) {
    console.log("[cron] sync de nomes falhou:", (e as Error).message);
  }

  // 4c. Lids: preenche o wa_lid de quem ainda não tem, cruzando a agenda —
  //     sem ele o "digitando" do contato chega com id desconhecido e é
  //     descartado (o evento de presença não traz o telefone).
  let lidsLearned = 0;
  try {
    lidsLearned = await sweepLids(admin, 500);
    if (lidsLearned > 0)
      console.log(`[cron] lids aprendidos: ${lidsLearned}`);
  } catch (e) {
    console.log("[cron] sync de lids falhou:", (e as Error).message);
  }

  // 4d. Contratos aguardando assinatura: consulta a Autentique (os 3 mais
  //     antigos por tick — rate limit 60/min) e marca assinado/recusado
  //     sozinho. O refresh manual na tela continua existindo.
  let contractsSynced = 0;
  try {
    const { autentiqueConfigured, getSignatureStatus } = await import(
      "@/lib/services/autentique"
    );
    if (await autentiqueConfigured()) {
      const { data: pend } = await admin
        .from("contracts")
        .select("id, autentique_id")
        .eq("status", "enviado")
        .not("autentique_id", "is", null)
        .order("updated_at", { ascending: true })
        .limit(3);
      for (const c of (pend ?? []) as { id: string; autentique_id: string }[]) {
        const { status } = await getSignatureStatus(c.autentique_id);
        const patch: Record<string, unknown> = {
          updated_at: new Date().toISOString(), // rodízio: o próximo tick olha outros
        };
        if (status?.signedAt) {
          patch.status = "assinado";
          patch.signed_at = status.signedAt;
          if (status.signedUrl) patch.signed_file_url = status.signedUrl;
          contractsSynced++;
          console.log(`[cron] contrato assinado: ${c.id}`);
          // Comprovante pro cliente (VibeUX 78): confirmação por canal
          // externo em fluxo de contrato é praticamente obrigatória.
          try {
            const { data: cc } = await admin
              .from("contracts")
              .select("title, lead:leads(id, name, phone)")
              .eq("id", c.id)
              .maybeSingle();
            const lead = (
              cc as unknown as {
                title: string;
                lead: { id: string; name: string; phone: string | null } | null;
              } | null
            )?.lead;
            if (lead?.phone) {
              const first = lead.name.split(" ")[0];
              await admin.from("scheduled_messages").insert({
                lead_id: lead.id,
                body: `Assinatura recebida, ${first}! O seu contrato "${(cc as { title?: string })?.title}" está assinado e vale a partir de agora. Obrigado pela confiança — qualquer coisa é só chamar por aqui.`,
                send_at: new Date().toISOString(),
                status: "pending",
                created_by: null,
              });
            }
          } catch (e) {
            console.log(
              "[cron] comprovante de assinatura falhou:",
              (e as Error).message
            );
          }
          // Fase 3: contrato assinado → venda recorrente + cobrança no Asaas
          try {
            const { createSaleFromContract } = await import("@/lib/sales");
            const r = await createSaleFromContract(admin, c.id);
            if (r.created)
              console.log(
                `[cron] venda criada do contrato ${c.id}${
                  r.reason ? ` (${r.reason})` : ""
                }`
              );
          } catch (e) {
            console.log("[cron] venda do contrato falhou:", (e as Error).message);
          }
        } else if (status?.rejectedAt) {
          patch.status = "recusado";
          contractsSynced++;
          console.log(`[cron] contrato recusado: ${c.id}`);
        }
        await admin.from("contracts").update(patch).eq("id", c.id);
      }
    }
  } catch (e) {
    console.log("[cron] sync de contratos falhou:", (e as Error).message);
  }

  // 5. Guardião por número: pra CADA número ativo — status da sessão,
  //    presença inteligente e webhook/assinatura corretos. Auto-cura os
  //    modos de falha já vistos em produção: webhook "roubado" por outra
  //    aplicação, assinatura sem ChatPresence (o "digitando" some em
  //    silêncio) e presença perdida em reconexão.
  let waOnline: boolean | null = null;
  let webhookFixed = false;
  try {
    const host =
      req.headers.get("x-forwarded-host") ?? new URL(req.url).host;
    const expectedPrefix = `https://${host}/api/whatsapp/webhook`;
    const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;

    // TRAVA: rodando local, `host` é localhost — re-apontar o webhook aqui
    // mandaria a DinastiAPI entregar as mensagens de PRODUÇÃO num endereço
    // que não existe pra ela, e o recebimento pararia até alguém perceber.
    // Só o host público pode mexer no webhook.
    const hostIsPublic =
      !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host) &&
      host.includes(".");

    // Presença global inteligente (estilo WhatsApp Web): "available" só
    // enquanto alguém estiver com o OPS Chat aberto (batimento < 5 min) —
    // é o que libera o "digitando..." dos contatos. Sem ninguém no chat,
    // volta a "unavailable" e o número não fica online 24h.
    const { data: act } = await admin
      .from("system_state")
      .select("value")
      .eq("key", "chat_activity")
      .maybeSingle();
    const lastAt = (act?.value as { at?: string } | null)?.at;
    const fresh =
      !!lastAt && Date.now() - new Date(lastAt).getTime() < 5 * 60_000;

    const { data: nums } = await admin
      .from("wa_numbers")
      .select("id, token, env_default")
      .eq("active", true);
    const numbers = (nums ?? []) as {
      id: string;
      token: string | null;
      env_default: boolean;
    }[];
    // a principal existe mesmo se a tabela estiver vazia (token do env)
    if (!numbers.some((n) => n.env_default))
      numbers.unshift({ id: "", token: null, env_default: true });

    for (const n of numbers) {
      const authToken = n.env_default ? undefined : n.token ?? undefined;
      if (!n.env_default && !authToken) continue;

      const s = await getStatus(authToken);
      const d = (s.data ?? {}) as { connected?: boolean; loggedIn?: boolean };
      // instância fora do ar (timeout/erro) também conta como desconectado
      const online = !!(s.ok && d.connected && d.loggedIn);
      if (n.env_default) waOnline = online;
      if (!online) continue;

      await setGlobalPresence(fresh ? "available" : "unavailable", authToken);

      const expectedUrl = n.env_default
        ? `${expectedPrefix}?secret=${webhookSecret}`
        : `${expectedPrefix}?secret=${webhookSecret}&n=${n.id}`;
      const wh = await getWebhookConfig(authToken);
      const subscribed =
        !!wh &&
        (wh.events.includes("All") || wh.events.includes("ChatPresence"));
      const rightUrl =
        !!wh &&
        wh.url.startsWith(expectedPrefix) &&
        (n.env_default || wh.url.includes(`n=${n.id}`));
      if (wh && (!rightUrl || !subscribed) && hostIsPublic) {
        await setWebhook(expectedUrl, authToken);
        webhookFixed = true;
        console.log(
          "[cron] webhook/assinatura re-apontados (estava em:",
          wh.url.split("?")[0] || "(vazio)",
          "| eventos:",
          wh.events.join(",") || "(nenhum)",
          ")"
        );
      }
    }

    // banner de conexão do app segue o número principal
    const { data: prev } = await admin
      .from("system_state")
      .select("value")
      .eq("key", "whatsapp")
      .maybeSingle();
    const prevOnline = (prev?.value as { online?: boolean } | null)?.online;
    const prevSince = (prev?.value as { since?: string } | null)?.since;

    await admin.from("system_state").upsert({
      key: "whatsapp",
      value: {
        online: waOnline,
        // 'since' marca quando o estado ATUAL começou (pro banner mostrar
        // "caiu há X min")
        since:
          prevOnline === waOnline && prevSince
            ? prevSince
            : new Date().toISOString(),
        checked_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.log("[cron] guardião WhatsApp falhou:", (e as Error).message);
  }

  return NextResponse.json({
    ok: true,
    processed: rows.length,
    sent,
    failed,
    automated,
    avatars,
    namesFixed,
    lidsLearned,
    contractsSynced,
    waOnline,
    webhookFixed,
  });
}

export async function POST(req: Request) {
  return dispatch(req);
}

export async function GET(req: Request) {
  return dispatch(req);
}
