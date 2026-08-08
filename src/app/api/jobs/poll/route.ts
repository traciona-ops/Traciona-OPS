import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processDueJobs } from "@/lib/jobs";
import {
  sendText,
  getStatus,
  getWebhookConfig,
  setWebhook,
  setGlobalPresence,
} from "@/lib/whatsapp/dinastia";
import { runTimeAutomations } from "@/lib/automations/engine";
import { sweepAvatars } from "@/lib/whatsapp/avatar";
import { sweepNumberNames } from "@/lib/whatsapp/names";
import { sweepLids } from "@/lib/whatsapp/lids";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Job handlers: name -> async function that processes the job
const JOB_HANDLERS = {
  async scheduled_messages_dispatch(admin) {
    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 5 * 60_000;
    const STUCK_AFTER_MS = 10 * 60_000;

    const nowISO = new Date().toISOString();

    // Rescue stuck processing messages
    await admin
      .from("scheduled_messages")
      .update({ status: "pending" })
      .eq("status", "processing")
      .lt("claimed_at", new Date(Date.now() - STUCK_AFTER_MS).toISOString());

    // Claim due messages atomically
    const { data: claimed } = await admin
      .from("scheduled_messages")
      .update({ status: "processing", claimed_at: nowISO })
      .eq("status", "pending")
      .lte("send_at", nowISO)
      .select("id, body, created_by, attempts, lead:leads(id,name,phone)");

    type DueRow = {
      id: string;
      body: string;
      created_by: string | null;
      attempts: number;
      lead: { id: string; name: string; phone: string | null } | null;
    };

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

    return {
      success: sent + failed > 0,
      message: `Sent: ${sent}, Failed: ${failed}`,
    };
  },

  async automations_run(admin) {
    const automated = await runTimeAutomations(admin);
    return {
      success: true,
      message: `Automated: ${automated}`,
    };
  },

  async sync_avatars(admin) {
    const avatars = await sweepAvatars(admin, 8);
    return {
      success: true,
      message: `Synced: ${avatars}`,
    };
  },

  async sync_names(admin) {
    const namesFixed = await sweepNumberNames(admin, 30);
    return {
      success: true,
      message: `Fixed: ${namesFixed}`,
    };
  },

  async sync_lids(admin) {
    const lidsLearned = await sweepLids(admin, 500);
    return {
      success: true,
      message: `Learned: ${lidsLearned}`,
    };
  },

  async sync_contracts(admin) {
    try {
      const { autentiqueConfigured, getSignatureStatus } = await import(
        "@/lib/autentique"
      );
      if (!(await autentiqueConfigured())) {
        return { success: true, message: "Autentique not configured" };
      }

      const { data: pend } = await admin
        .from("contracts")
        .select("id, autentique_id")
        .eq("status", "enviado")
        .not("autentique_id", "is", null)
        .order("updated_at", { ascending: true })
        .limit(3);

      let contractsSynced = 0;
      for (const c of (pend ?? []) as {
        id: string;
        autentique_id: string;
      }[]) {
        const { status } = await getSignatureStatus(c.autentique_id);
        const patch: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (status?.signedAt) {
          patch.status = "assinado";
          patch.signed_at = status.signedAt;
          if (status.signedUrl) patch.signed_file_url = status.signedUrl;
          contractsSynced++;

          // Send confirmation message
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
            console.log("[jobs] contract confirmation failed:", (e as Error).message);
          }

          // Create sale from contract
          try {
            const { createSaleFromContract } = await import("@/lib/sales");
            const r = await createSaleFromContract(admin, c.id);
            if (r.created) {
              console.log(
                `[jobs] sale created from contract ${c.id}${
                  r.reason ? ` (${r.reason})` : ""
                }`
              );
            }
          } catch (e) {
            console.log("[jobs] contract sale failed:", (e as Error).message);
          }
        } else if (status?.rejectedAt) {
          patch.status = "recusado";
          contractsSynced++;
        }
        await admin.from("contracts").update(patch).eq("id", c.id);
      }

      return {
        success: true,
        message: `Synced: ${contractsSynced}`,
      };
    } catch (e) {
      throw new Error(`Contract sync failed: ${(e as Error).message}`);
    }
  },

  async whatsapp_guardian(admin, req?: Request) {
    try {
      const host =
        req?.headers.get("x-forwarded-host") ??
        new URL(req?.url || "http://localhost").host;
      const expectedPrefix = `https://${host}/api/whatsapp/webhook`;
      const secret = process.env.WHATSAPP_WEBHOOK_SECRET;

      // Smart presence: only online while someone is in chat
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

      if (!numbers.some((n) => n.env_default))
        numbers.unshift({ id: "", token: null, env_default: true });

      let waOnline: boolean | null = null;
      let webhookFixed = false;

      for (const n of numbers) {
        const authToken = n.env_default ? undefined : n.token ?? undefined;
        if (!n.env_default && !authToken) continue;

        const s = await getStatus(authToken);
        const d = (s.data ?? {}) as { connected?: boolean; loggedIn?: boolean };
        const online = !!(s.ok && d.connected && d.loggedIn);
        if (n.env_default) waOnline = online;
        if (!online) continue;

        await setGlobalPresence(fresh ? "available" : "unavailable", authToken);

        const expectedUrl = n.env_default
          ? `${expectedPrefix}?secret=${secret}`
          : `${expectedPrefix}?secret=${secret}&n=${n.id}`;
        const wh = await getWebhookConfig(authToken);
        const subscribed =
          !!wh &&
          (wh.events.includes("All") || wh.events.includes("ChatPresence"));
        const rightUrl =
          !!wh &&
          wh.url.startsWith(expectedPrefix) &&
          (n.env_default || wh.url.includes(`n=${n.id}`));
        if (wh && (!rightUrl || !subscribed)) {
          await setWebhook(expectedUrl, authToken);
          webhookFixed = true;
        }
      }

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
          since:
            prevOnline === waOnline && prevSince
              ? prevSince
              : new Date().toISOString(),
          checked_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      });

      return {
        success: true,
        message: `Online: ${waOnline}, Webhook fixed: ${webhookFixed}`,
      };
    } catch (e) {
      throw new Error(`WhatsApp guardian failed: ${(e as Error).message}`);
    }
  },
};

async function poll(req: Request) {
  const secret = process.env.JOB_SECRET;
  const provided = req.headers.get("x-job-secret");

  if (!secret || provided !== secret) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const admin = createAdminClient();

  try {
    // Pass request to handlers that need it (like whatsapp_guardian)
    const handlersWithReq = {
      ...JOB_HANDLERS,
      async whatsapp_guardian(admin) {
        return (JOB_HANDLERS.whatsapp_guardian as any)(admin, req);
      },
    };

    const result = await processDueJobs(
      admin,
      handlersWithReq as Record<string, any>
    );

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (e) {
    console.error("[jobs/poll] error:", (e as Error).message);
    return NextResponse.json(
      {
        ok: false,
        error: (e as Error).message,
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return poll(req);
}

export async function POST(req: Request) {
  return poll(req);
}
