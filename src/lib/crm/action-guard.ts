import { getProfile } from "@/lib/auth";
import { NOT_ALLOWED } from "@/lib/permissions";
import type { UserRole } from "@/lib/types";

/** Trava amigável por papel (RLS no banco é a trava real). */
export async function denyUnlessRole(check: (r: UserRole) => boolean) {
  const { role } = await getProfile();
  return check(role) ? null : { error: NOT_ALLOWED };
}
