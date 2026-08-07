-- =============================================================
-- Seed — pipelines, estágios e leads de exemplo
-- Roda só se ainda não houver pipelines (idempotente para dev).
-- =============================================================

do $$
declare
  p_vendas uuid;
  p_followup uuid;
  p_instagram uuid;
  p_social uuid;
  s_novo uuid;
  s_qualif uuid;
  s_reuniao uuid;
  s_proposta uuid;
begin
  if exists (select 1 from pipelines) then
    raise notice 'Pipelines já existem — seed ignorado.';
    return;
  end if;

  -- Pipelines
  insert into pipelines (name, type, color, position)
    values ('Vendas', 'sales', '#6d5efc', 0) returning id into p_vendas;
  insert into pipelines (name, type, color, position)
    values ('Follow-up', 'followup', '#38bdf8', 1) returning id into p_followup;
  insert into pipelines (name, type, color, position)
    values ('Instagram', 'instagram', '#f472b6', 2) returning id into p_instagram;
  insert into pipelines (name, type, color, position)
    values ('Social', 'social', '#34d399', 3) returning id into p_social;

  -- Estágios — Vendas
  insert into pipeline_stages (pipeline_id, name, position, color) values
    (p_vendas, 'Novo Lead', 0, '#8a93a6') returning id into s_novo;
  insert into pipeline_stages (pipeline_id, name, position, color) values
    (p_vendas, 'Qualificação', 1, '#38bdf8') returning id into s_qualif;
  insert into pipeline_stages (pipeline_id, name, position, color) values
    (p_vendas, 'Reunião Agendada', 2, '#6d5efc') returning id into s_reuniao;
  insert into pipeline_stages (pipeline_id, name, position, color) values
    (p_vendas, 'Proposta', 3, '#fbbf24') returning id into s_proposta;
  insert into pipeline_stages (pipeline_id, name, position, color) values
    (p_vendas, 'Negociação', 4, '#f59e0b');
  insert into pipeline_stages (pipeline_id, name, position, color, is_won) values
    (p_vendas, 'Ganho', 5, '#34d399', true);
  insert into pipeline_stages (pipeline_id, name, position, color, is_lost) values
    (p_vendas, 'Perdido', 6, '#f87171', true);

  -- Estágios — Follow-up
  insert into pipeline_stages (pipeline_id, name, position, color) values
    (p_followup, 'Aguardando Retorno', 0, '#8a93a6'),
    (p_followup, 'Reengajar', 1, '#fbbf24'),
    (p_followup, 'Reativado', 2, '#34d399');
  insert into pipeline_stages (pipeline_id, name, position, color, is_lost) values
    (p_followup, 'Descartado', 3, '#f87171', true);

  -- Estágios — Instagram
  insert into pipeline_stages (pipeline_id, name, position, color) values
    (p_instagram, 'DM Recebida', 0, '#8a93a6'),
    (p_instagram, 'Em Conversa', 1, '#38bdf8'),
    (p_instagram, 'Qualificado', 2, '#6d5efc');
  insert into pipeline_stages (pipeline_id, name, position, color, is_won) values
    (p_instagram, 'Enviado p/ Vendas', 3, '#34d399', true);

  -- Estágios — Social
  insert into pipeline_stages (pipeline_id, name, position, color) values
    (p_social, 'Comentário', 0, '#8a93a6'),
    (p_social, 'DM', 1, '#38bdf8'),
    (p_social, 'Interessado', 2, '#6d5efc');
  insert into pipeline_stages (pipeline_id, name, position, color, is_won) values
    (p_social, 'Convertido', 3, '#34d399', true);

  -- Leads de exemplo (pipeline Vendas)
  insert into leads (name, phone, email, company, source, pipeline_id, stage_id, value, position) values
    ('Ana Beatriz Souza', '5511991234567', 'ana@lojadaana.com', 'Loja da Ana', 'meta_ads', p_vendas, s_novo, 4500, 0),
    ('Carlos Menezes', '5511987654321', 'carlos@menezesadv.com', 'Menezes Advocacia', 'instagram', p_vendas, s_novo, 8000, 1),
    ('Juliana Prado', '5521996541230', 'ju@pradoestetica.com', 'Prado Estética', 'meta_ads', p_vendas, s_qualif, 6200, 0),
    ('Rafael Lima', '5511970001122', 'rafa@limafit.com', 'Lima Fit', 'referral', p_vendas, s_reuniao, 12000, 0),
    ('Marina Costa', '5511960002233', 'marina@costadoces.com', 'Costa Doces', 'organic', p_vendas, s_proposta, 3500, 0);

  raise notice 'Seed concluído.';
end $$;
