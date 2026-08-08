import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { requireModule } from "@/lib/access";
import { LeadDetail } from "@/components/crm/lead-detail";
import type {
  Lead,
  LeadNote,
  LeadTag,
  LeadTask,
  LeadTransfer,
  PipelineStage,
  Profile,
} from "@/lib/types";

// A URL usa o código curto (/crm/leads/42); links antigos por UUID seguem
// funcionando e redirecionam pro formato novo.
const isCodeParam = (id: string) => /^\d+$/.test(id);

// Título da aba com o nome do lead ("Traciona | Ana Luisa Alves")
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const q = supabase.from("leads").select(selectLead('basic'));
  const { data } = await (isCodeParam(id)
    ? q.eq("code", Number(id))
    : q.eq("id", id)
  ).maybeSingle();
  return { title: (data as { name: string } | null)?.name ?? "Lead" };
}

export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("crm");
  const { id } = await params;
  const profile = await getProfile();
  const supabase = await createClient();

  const leadQuery = supabase
    .from("leads")
    .select("*, tags:lead_tags(*), owner:profiles(*)");
  const { data: lead } = await (isCodeParam(id)
    ? leadQuery.eq("code", Number(id))
    : leadQuery.eq("id", id)
  ).maybeSingle();

  if (!lead) notFound();
  const typedLead = lead as unknown as Lead & {
    tags: LeadTag[];
    owner: Profile | null;
  };

  // URL canônica é o código — quem chegou pelo UUID antigo é redirecionado
  if (!isCodeParam(id) && typedLead.code != null)
    redirect(`/crm/leads/${typedLead.code}`);

  const [stagesRes, notesRes, transfersRes, teamRes, tasksRes] =
    await Promise.all([
      supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", typedLead.pipeline_id ?? "")
        .order("position"),
      supabase
        .from("lead_notes")
        .select("*, author:profiles(name)")
        .eq("lead_id", typedLead.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("lead_transfers")
        .select(
          "*, from:profiles!lead_transfers_from_user_fkey(name), to:profiles!lead_transfers_to_user_fkey(name)"
        )
        .eq("lead_id", typedLead.id)
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").eq("active", true),
      supabase
        .from("lead_tasks")
        .select("*, assignee:profiles!lead_tasks_assignee_id_fkey(name)")
        .eq("lead_id", typedLead.id)
        .order("done")
        .order("due_date", { nullsFirst: false }),
    ]);

  return (
    <>
      <Topbar title={typedLead.name} subtitle={typedLead.company ?? "Lead"} />
      <div className="flex-1 overflow-y-auto">
        <LeadDetail
          lead={typedLead}
          stages={(stagesRes.data ?? []) as PipelineStage[]}
          notes={(notesRes.data ?? []) as (LeadNote & { author?: { name: string } })[]}
          transfers={
            (transfersRes.data ?? []) as (LeadTransfer & {
              from?: { name: string };
              to?: { name: string };
            })[]
          }
          team={(teamRes.data ?? []) as Profile[]}
          tasks={(tasksRes.data ?? []) as (LeadTask & { assignee?: { name: string } })[]}
          currentUserId={profile.id}
        />
      </div>
    </>
  );
}
