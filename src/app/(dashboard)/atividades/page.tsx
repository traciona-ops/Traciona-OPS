import { getProfile } from "@/lib/auth";
import { requireModule } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { TasksView, type ViewTask } from "@/components/atividades/tasks-view";
import type { Profile } from "@/lib/types";

export const metadata = { title: "Tarefas" };

export default async function AtividadesPage() {
  await requireModule("atividades");
  const profile = await getProfile();
  const supabase = await createClient();

  const [tasksRes, teamRes, leadsRes] = await Promise.all([
    supabase
      .from("lead_tasks")
      .select(
        "*, lead:leads(id,name), assignee:profiles!lead_tasks_assignee_id_fkey(id,name,avatar_url)"
      )
      .order("due_date", { nullsFirst: false }),
    supabase.from("profiles").select("*").eq("active", true),
    // Só negócios com card no funil — contato que vive só no chat não entra
    // aqui (a tarefa dele se cria por dentro do próprio chat).
    supabase
      .from("leads")
      .select("id,name")
      .not("pipeline_id", "is", null)
      .order("name"),
  ]);

  return (
    <TasksView
      tasks={(tasksRes.data ?? []) as ViewTask[]}
      team={(teamRes.data ?? []) as Profile[]}
      leads={(leadsRes.data ?? []) as { id: string; name: string }[]}
      currentUserId={profile.id}
      userName={profile.name}
    />
  );
}
