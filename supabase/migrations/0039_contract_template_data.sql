-- Dados preenchidos no contrato gerado do modelo (CPF, endereço, prazo...)
-- ficam junto do contrato — o cadastro de leads não precisa desses campos.
alter table contracts add column if not exists template_data jsonb;
