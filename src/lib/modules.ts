// Catálogo de módulos do ecossistema (usado pela matriz de Permissões e
// pelo menu). SEM imports de servidor — client components importam daqui.

export type ModuleKey =
  | "contatos"
  | "crm"
  | "atividades"
  | "contratos"
  | "vendas"
  | "onboarding"
  | "briefings"
  | "prompts"
  | "dashboards"
  | "agenda"
  | "disponibilidade"
  | "chat"
  | "playbooks";

export const MODULES: { key: ModuleKey; label: string; group: string }[] = [
  { key: "contatos", label: "Contatos", group: "Comercial" },
  { key: "crm", label: "Negócios", group: "Comercial" },
  { key: "atividades", label: "Tarefas Comerciais", group: "Comercial" },
  { key: "contratos", label: "Contratos", group: "Comercial" },
  { key: "vendas", label: "Vendas", group: "Comercial" },
  { key: "onboarding", label: "Onboarding", group: "Operações & Projetos" },
  { key: "briefings", label: "Briefings & Solicitações", group: "Operações & Projetos" },
  { key: "prompts", label: "Biblioteca de Prompts & IA", group: "Operações & Projetos" },
  { key: "dashboards", label: "Dashboards", group: "Geral" },
  { key: "agenda", label: "Agenda", group: "Geral" },
  { key: "disponibilidade", label: "Disponibilidade", group: "Geral" },
  { key: "chat", label: "OPS Chat (WhatsApp)", group: "Geral" },
  { key: "playbooks", label: "Playbooks", group: "Geral" },
];
