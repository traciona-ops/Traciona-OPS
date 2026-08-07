import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/access";
import {
  ContactsView,
  type ContactRow,
} from "@/components/contatos/contacts-view";

export const metadata = { title: "Contatos" };

// Base COMPLETA de contatos — inclui quem vive só no chat (sem card no
// funil). Contato ≠ negócio: aqui é o catálogo de pessoas, não o funil.
export default async function ContatosPage() {
  await requireModule("contatos");
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select(
      "id, code, name, phone, email, company, avatar_url, pipeline_id, created_at, owner:profiles!leads_owner_id_fkey(name)"
    )
    .order("name");

  // o hint de FK devolve owner como OBJETO em runtime (o tipo gerado erra)
  return <ContactsView contacts={(data ?? []) as unknown as ContactRow[]} />;
}
