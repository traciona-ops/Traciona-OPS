import type { UserRole } from "@/lib/types";

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

export const NOT_ALLOWED = "Você não tem permissão para esta ação.";
