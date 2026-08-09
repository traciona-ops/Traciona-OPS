import { Topbar } from "@/components/topbar";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/access";
import type { CalMeeting } from "@/components/agenda/agenda-calendar";
import { AgendaWrapper } from "@/components/agenda/agenda-wrapper";
import type { Meeting } from "@/lib/types";

type MeetingRow = Meeting & { lead: { id: string; name: string } | null };

export const metadata = { title: "Agenda" };

export default async function AgendaPage() {
  await requireModule("agenda");
  const supabase = await createClient();
  const { data } = await supabase
    .from("meetings")
    .select("*, lead:leads(id,name)")
    .order("starts_at", { ascending: true });

  const meetings: CalMeeting[] = ((data ?? []) as MeetingRow[]).map((m) => ({
    id: m.id,
    title: m.title,
    starts_at: m.starts_at,
    ends_at: m.ends_at,
    location: m.location,
    lead: m.lead,
  }));

  return (
    <>
      <Topbar title="Agenda" subtitle="Reuniões e compromissos no calendário" />
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-5xl">
          <AgendaWrapper meetings={meetings} />
        </div>
      </div>
    </>
  );
}
