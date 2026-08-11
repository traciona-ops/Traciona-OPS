export type ContractRow = {
  id: string;
  title: string;
  value: number | null;
  starts_at: string | null;
  ends_at: string | null;
  status: "rascunho" | "enviado" | "assinado" | "recusado" | "encerrado";
  sign_link: string | null;
  signer_email: string | null;
  sent_at: string | null;
  signed_at: string | null;
  created_at: string;
  lead: {
    id: string;
    code: number | null;
    name: string;
    phone: string | null;
    avatar_url: string | null;
  } | null;
};

export type LeadOption = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  pipeline_id: string | null;
};

export type FormRequestRow = {
  id: string;
  token: string;
  status: "pendente" | "respondido";
  created_at: string;
  answered_at: string | null;
  lead: { name: string } | null;
};

export type Filter = "todos" | ContractRow["status"];
export type Mode = "opsform" | "modelo" | "upload";

export type ContractsViewProps = {
  contracts: ContractRow[];
  leads: LeadOption[];
  formRequests: FormRequestRow[];
  integrationReady: boolean;
};

export type RunFn = (
  id: string,
  fn: () => Promise<{ error?: string } | void>
) => void;
