-- Cofre de credenciais de integrações (DinastiAPI, Autentique, Asaas).
-- RLS ligado SEM policies: só o service role lê/escreve — o navegador
-- nunca enxerga (mesmo padrão do wa_numbers). O .env segue como reserva.
create table if not exists integration_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table integration_settings enable row level security;
