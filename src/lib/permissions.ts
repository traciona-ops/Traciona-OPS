import type { UserRole } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";

// Fonte única de verdade dos papéis. A trava real é a RLS no banco;
// estas funções espelham as regras pra esconder UI e dar erro amigável nas actions.

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  gestor: "Gestor",
  vendedor: "Vendedor",
};

const ADMIN_GESTOR: UserRole[] = ["admin", "gestor"];

export const can = {
  // Conta, equipe e papéis
  manageTeam: (r: UserRole) => r === "admin",
  // Configurar pipelines, etapas e SLA
  configurePipelines: (r: UserRole) => ADMIN_GESTOR.includes(r),
  // Excluir e transferir leads
  deleteLead: (r: UserRole) => ADMIN_GESTOR.includes(r),
  transferLead: (r: UserRole) => ADMIN_GESTOR.includes(r),
  // Relatórios do comercial
  viewReports: (r: UserRole) => ADMIN_GESTOR.includes(r),
  // Ver todos os leads (vendedor só vê os próprios — reforçado por RLS)
  viewAllLeads: (r: UserRole) => ADMIN_GESTOR.includes(r),
};

// ABAC: Attribute-Based Access Control for resource + action checks
export type AbacContext = Record<string, any>;

/**
 * Evaluate ABAC rule via database check_permission() function.
 * Returns true if permitted, false otherwise.
 * Admin always permitted; no rule = deny by default.
 * @param role User role (admin, gestor, vendedor)
 * @param resource Resource type (lead, contract, task, etc.)
 * @param action Action name (delete, transfer, edit, etc.)
 * @param context Optional runtime context (value, userRole, sector, etc.)
 */
export async function checkAbac(
  role: UserRole,
  resource: string,
  action: string,
  context?: AbacContext
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "check_permission",
    {
      p_role: role,
      p_resource: resource,
      p_action: action,
      p_context: context ?? null,
    }
  );

  if (error) {
    console.error("ABAC check error:", error);
    return false; // Deny on error
  }

  return data === true;
}

export const NOT_ALLOWED = "Você não tem permissão para esta ação.";
