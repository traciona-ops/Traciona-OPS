-- Ops Apps: o dashboard montável deixa de ser um por pessoa e vira uma coleção.
--
-- A tabela `dashboards` (0046) já guardava filtros e widgets. Faltavam a
-- descrição e o índice pra listar rápido. Nada de tabela nova: o construtor, a
-- spec fechada e a tradução por RLS continuam os mesmos.

alter table public.dashboards
  add column if not exists description text;

-- Lista ordenada por posição e, no empate, pelo mais recente.
drop index if exists public.dashboards_owner_idx;
create index if not exists dashboards_owner_idx
  on public.dashboards (owner_id, position, created_at desc);

comment on column public.dashboards.description is
  'Linha de contexto do painel — o que ele responde. Aparece na lista e no cabeçalho.';
