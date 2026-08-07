import { Topbar } from "@/components/topbar";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/access";
import {
  OnboardingView,
  type ObRow,
  type LeadOpt,
} from "@/components/onboarding/onboarding-view";

export const metadata = { title: "Onboarding" };

export default async function OnboardingModulePage() {
  await requireModule("onboarding");
  const supabase = await createClient();
  const [reqsRes, leadsRes] = await Promise.all([
    supabase
      .from("onboarding_requests")
      .select(
        "id, token, client_name, status, answers, assets, created_at, answered_at, lead:leads(id, name, phone, avatar_url)"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("leads")
      .select("id, name, phone")
      .order("name")
      .limit(500),
  ]);

  return (
    <>
      <Topbar
        title="Onboarding"
        subtitle="OPS Forms de entrada de clientes — link público com autosave"
      />
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-4xl">
          <OnboardingView
            rows={(reqsRes.data ?? []) as unknown as ObRow[]}
            leads={(leadsRes.data ?? []) as LeadOpt[]}
          />
        </div>
      </div>
    </>
  );
}
