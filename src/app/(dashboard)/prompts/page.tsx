import { Topbar } from "@/components/topbar";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/access";
import {
  PromptsView,
  type FolderRow,
  type PromptRow,
} from "@/components/prompts/prompts-view";

export const metadata = { title: "Prompts & IA" };

export default async function PromptsPage() {
  await requireModule("prompts");
  const supabase = await createClient();
  const [foldersRes, promptsRes] = await Promise.all([
    supabase.from("prompt_folders").select("*").order("position").order("name"),
    supabase
      .from("prompts")
      .select("id, folder_id, title, content, updated_at")
      .order("updated_at", { ascending: false }),
  ]);

  return (
    <>
      <Topbar
        title="Biblioteca de Prompts & IA"
        subtitle="Estruturas validadas com variáveis preenchíveis e histórico de versões"
      />
      <PromptsView
        folders={(foldersRes.data ?? []) as FolderRow[]}
        prompts={(promptsRes.data ?? []) as PromptRow[]}
      />
    </>
  );
}
