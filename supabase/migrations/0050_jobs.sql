-- =============================================================
-- 0050 — Job Scheduler (replaces pg_cron with logged history)
-- =============================================================

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  cron text not null,
  payload jsonb,
  last_run_at timestamptz,
  next_run_at timestamptz not null,
  status text not null default 'active', -- active | paused | error
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_jobs_next_run
  on jobs (next_run_at) where status = 'active';
create index if not exists idx_jobs_name
  on jobs (name);

-- Track job execution history for debugging
create table if not exists job_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  started_at timestamptz not null,
  completed_at timestamptz,
  duration_ms int,
  status text not null, -- success | failed | timeout
  error text,
  result jsonb
);

create index if not exists idx_job_runs_job_id
  on job_runs (job_id);
create index if not exists idx_job_runs_started_at
  on job_runs (started_at desc);
