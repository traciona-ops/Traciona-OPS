import { PermissionsMatrix } from "@/components/settings/permissions-matrix";
import { getRoleDenials } from "@/app/(dashboard)/settings/permissions-actions";

export const metadata = { title: "Permissões de acesso" };

export default async function PermissoesPage() {
  const denials = await getRoleDenials();
  return <PermissionsMatrix initialDenials={denials} />;
}
