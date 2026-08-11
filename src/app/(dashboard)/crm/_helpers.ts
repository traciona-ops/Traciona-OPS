import { createClient } from "@/lib/supabase/server";
import { denyUnlessRole } from "@/lib/crm/action-guard";
import type { UserRole } from "@/lib/types";

export async function db() {
  return await createClient();
}

export async function ensure(check: (r: UserRole) => boolean) {
  return denyUnlessRole(check);
}
