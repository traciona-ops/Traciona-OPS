"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

// Actions PÚBLICAS do Onboarding (via token). Service role: a tabela não é
// exposta pro navegador. Autosave a cada resposta — fechar não perde nada.

type ObRequest = {
  id: string;
  status: string;
  assets: { name: string; url: string }[];
};

async function findOpen(token: string): Promise<ObRequest | null> {
  if (!/^[a-f0-9-]{16,64}$/i.test(token)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("onboarding_requests")
    .select("id, status, assets")
    .eq("token", token)
    .maybeSingle();
  const req = data as ObRequest | null;
  if (!req || req.status === "cancelado" || req.status === "respondido")
    return null;
  return req;
}

/** Autosave: grava respostas + passo atual (status vira em_andamento). */
export async function saveOnboardingProgress(
  token: string,
  answers: Record<string, string>,
  step: number
) {
  const req = await findOpen(token);
  if (!req) return { error: "Link indisponível." };
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers ?? {})) {
    if (typeof v === "string") clean[k.slice(0, 40)] = v.slice(0, 4000);
  }
  const admin = createAdminClient();
  await admin
    .from("onboarding_requests")
    .update({
      answers: clean,
      current_step: Math.max(0, Math.min(50, step | 0)),
      status: "em_andamento",
      updated_at: new Date().toISOString(),
    })
    .eq("id", req.id);
  return { ok: true };
}

/** Upload de asset (logo, manual, fotos) pro bucket público ops-assets. */
export async function uploadOnboardingAsset(token: string, fd: FormData) {
  const req = await findOpen(token);
  if (!req) return { error: "Link indisponível." };
  const file = fd.get("file") as File | null;
  if (!file || !file.size) return { error: "Arquivo vazio." };
  if (file.size > 25 * 1024 * 1024) return { error: "Arquivo acima de 25MB." };

  const admin = createAdminClient();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  const path = `onboarding/${req.id}/${Date.now()}-${safeName}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from("ops-assets")
    .upload(path, buf, { contentType: file.type || "application/octet-stream" });
  if (upErr) return { error: `Upload falhou: ${upErr.message}` };
  const url = admin.storage.from("ops-assets").getPublicUrl(path).data.publicUrl;

  const assets = [...(req.assets ?? []), { name: file.name, url }];
  await admin
    .from("onboarding_requests")
    .update({ assets, updated_at: new Date().toISOString() })
    .eq("id", req.id);
  return { ok: true, name: file.name, url };
}

/** Conclui o onboarding (status respondido). */
export async function finishOnboarding(
  token: string,
  answers: Record<string, string>
) {
  const req = await findOpen(token);
  if (!req) return { error: "Link indisponível." };
  await saveOnboardingProgress(token, answers, 999);
  const admin = createAdminClient();
  await admin
    .from("onboarding_requests")
    .update({ status: "respondido", answered_at: new Date().toISOString() })
    .eq("id", req.id);
  revalidatePath(`/o/${token}`);
  return { ok: true };
}
