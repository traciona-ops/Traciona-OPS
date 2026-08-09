import { createClient } from "@/lib/supabase/server";
import { autentiqueConfigured } from "@/lib/services/autentique";
import { requireModule } from "@/lib/access";
import {
  ContractsView,
  type ContractRow,
  type LeadOption,
  type FormRequestRow,
} from "@/components/contratos/contracts-view";

export const metadata = { title: "Contratos" };

export default async function ContratosPage() {
  await requireModule("contratos");
  const supabase = await createClient();
  const [contractsRes, leadsRes, formsRes] = await Promise.all([
    supabase
      .from("contracts")
      .select(
        "id, title, value, starts_at, ends_at, status, sign_link, signer_email, sent_at, signed_at, created_at, lead:leads(id, code, name, phone, avatar_url)"
      )
      .order("created_at", { ascending: false }),
    // TODOS os contatos — com ou sem card no funil (contato ≠ negócio)
    supabase
      .from("leads")
      .select("id, name, email, phone, pipeline_id")
      .order("name"),
    supabase
      .from("form_requests")
      .select("id, token, status, created_at, answered_at, lead:leads(name)")
      .neq("status", "cancelado")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <ContractsView
      contracts={(contractsRes.data ?? []) as unknown as ContractRow[]}
      leads={(leadsRes.data ?? []) as LeadOption[]}
      formRequests={(formsRes.data ?? []) as unknown as FormRequestRow[]}
      integrationReady={await autentiqueConfigured()}
    />
  );
}
