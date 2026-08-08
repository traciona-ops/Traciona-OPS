-- =============================================================
-- 0048 — Leads: denormalized columns para busca rápida
-- Adiciona name_normalized (lowercase sem acentos) e search_text (tsvector)
-- Trigger function popula automaticamente em INSERT/UPDATE
-- GIN index em search_text para full-text-search sem ILIKE
-- =============================================================

-- Ensure unaccent extension is available
create extension if not exists "unaccent";

-- Add denormalized columns to leads
alter table public.leads
  add column if not exists name_normalized text,
  add column if not exists search_text tsvector;

-- Trigger function to populate denormalized columns on INSERT/UPDATE
create or replace function public.update_leads_search_text()
returns trigger as $$
declare
  v_normalized_name text;
  v_search_text tsvector;
begin
  -- Normalize name: lowercase + remove accents
  v_normalized_name := unaccent(lower(coalesce(new.name, '')));

  -- Build tsvector from name, phone, email, company, and instagram
  -- Name gets highest weight (A), phone/email get medium weight (B), rest get low weight (D)
  v_search_text := setweight(to_tsvector('portuguese', v_normalized_name), 'A')
                || setweight(to_tsvector('portuguese', coalesce(regexp_replace(new.phone, '\D', '', 'g'), '')), 'B')
                || setweight(to_tsvector('portuguese', coalesce(new.email, '')), 'B')
                || setweight(to_tsvector('portuguese', coalesce(new.company, '')), 'D')
                || setweight(to_tsvector('portuguese', coalesce(new.instagram, '')), 'D');

  new.name_normalized := v_normalized_name;
  new.search_text := v_search_text;

  return new;
end;
$$ language plpgsql;

-- Drop and recreate trigger to ensure it's current
drop trigger if exists trg_leads_search_text on public.leads;
create trigger trg_leads_search_text
  before insert or update on public.leads
  for each row execute function public.update_leads_search_text();

-- Create GIN index for fast full-text search
create index if not exists idx_leads_search_text
  on public.leads using gin(search_text);

-- Backfill existing records
update public.leads
set search_text = NULL, name_normalized = NULL
where search_text is not null or name_normalized is not null;

-- This will trigger the function for all existing rows
update public.leads
set updated_at = updated_at;
