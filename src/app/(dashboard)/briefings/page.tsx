import { Topbar } from "@/components/topbar";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/access";
import {
  BriefingsView,
  type BriefingRow,
  type CommentRow,
  type TeamOpt,
  type LeadOpt,
} from "@/components/briefings/briefings-view";

export const metadata = { title: "Briefings" };

export default async function BriefingsPage() {
  const profile = await requireModule("briefings");
  const supabase = await createClient();
  const [briefRes, commentsRes, teamRes, leadsRes] = await Promise.all([
    supabase
      .from("briefings")
      .select(
        "id, code, title, kind, priority, status, description_html, due_date, refs, created_at, updated_at, lead:leads(id, name), requester:profiles!briefings_requester_id_fkey(id, name, avatar_url), assignee:profiles!briefings_assignee_id_fkey(id, name, avatar_url)"
      )
      .order("updated_at", { ascending: false }),
    supabase
      .from("briefing_comments")
      .select("id, briefing_id, kind, body, created_at, author:profiles(id, name, avatar_url)")
      .order("created_at"),
    supabase
      .from("profiles")
      .select("id, name, avatar_url")
      .eq("active", true)
      .order("name"),
    supabase.from("leads").select("id, name").order("name").limit(500),
  ]);

  return (
    <>
      <Topbar
        title="Briefings & Solicitações"
        subtitle="Pedidos de arte, copy, campanha e site — com aprovação na plataforma"
      />
      <BriefingsView
        briefings={(briefRes.data ?? []) as unknown as BriefingRow[]}
        comments={(commentsRes.data ?? []) as unknown as CommentRow[]}
        team={(teamRes.data ?? []) as TeamOpt[]}
        leads={(leadsRes.data ?? []) as LeadOpt[]}
        currentUserId={profile.id}
      />
    </>
  );
}
