# Traciona Refactor — Robustez & Performance (2026-08)

> Implementação completa de melhorias críticas. 15 agentes em paralelo.

---

## Fases

### ✅ Fase 1: Webhook Resilience (4/4 agentes completos)
- [ ] **N+1 queries** → batch select + related (placeInDefaultPipeline)
- [ ] **Redis cache** → org_settings via Upstash (TTL 3600s)
- [ ] **Retry + Timeout** → wrapper exponential backoff, 5s timeout, idempotency key
- [ ] **Zod validation** → webhook payload schema, 400 on invalid

**Status:** Aguardando conclusão de agentes a1dbaa6, adf7834, ad62745, a53af3c  
**Impacto:** -60% latência webhook, -50% DB load

---

### ✅ Fase 2: Observability & Security (4/4 agentes)
- [ ] **Structured logging** → JSON stdout, webhook/cron/integrations
- [ ] **Rate limiting** → 10 leads/h, 30 msgs/lead/h, 5 API calls/min (Upstash)
- [ ] **Migrations CI/CD** → auto-apply on Vercel deploy (vercel-build.sh or CLI v2)
- [ ] **Audit log** → trigger SQL on INSERT/UPDATE/DELETE leads, deals, contracts

**Status:** Aguardando conclusão de agentes ac9d0de, ad1bcc5, a2b0e7a, a4f0be8  
**Impacto:** +compliance, -silent failures

---

### ✅ Fase 3: Scalability & Architecture (6/6 agentes)
- [ ] **ABAC permissions** → role_permissions table + context-aware checks
- [ ] **Lazy loading** → selectLead(fields) helper, avoid eager-load
- [ ] **Denormalization** → name_normalized, search_text tsvector, GIN index
- [ ] **Job scheduler** → jobs table + worker polling, replaces pg_cron
- [ ] **E2E tests** → auth, lead, whatsapp flows (Playwright)
- [ ] **Circuit breaker** → DinastiAPI, Autentique, Asaas failfast + recovery

**Status:** Aguardando conclusão de agentes acb7aef, ae0b566, a0c217d, a60187b, a36fbf7, aa95f73  
**Impacto:** +40% resilience, -cascade failures

---

## Arquitetura Antes/Depois

### ANTES (Problemas)
```
WhatsApp webhook
  ↓
  ├─ Query 1: fetch lead
  ├─ Query 2: fetch pipeline
  ├─ Query 3: fetch stage
  ├─ Query 4: fetch leads (again)  ← N+1
  ├─ settingsCache (manual, in-memory)  ← desync
  ├─ Sync calls to DinastiAPI/Autentique  ← block
  ├─ No retry/timeout  ← fail silent
  ├─ No idempotency  ← dup messages
  └─ No logging  ← invisible failures

pg_cron (silent, no status)
  ↓
  └─ Service role calls → no audit
```

### DEPOIS (Fixed)
```
WhatsApp webhook
  ↓
  ├─ Single batch select with relations  ← -60% latency
  ├─ Redis cache (TTL 3600s)  ← multi-instance safe
  ├─ Zod validation  ← early error catch
  ├─ Rate limiting (Upstash)  ← prevent spam
  ├─ Enqueue to message queue  ← async processing
  ├─ Circuit breaker  ← failfast on integration down
  ├─ Retry (3×, exp backoff)  ← resilient
  ├─ 5s timeout  ← bounded latency
  ├─ Idempotency check (whatsapp_message_id)  ← no dups
  └─ Structured JSON logging  ← Vercel capture

Job scheduler (jobs table)
  ↓
  ├─ Poll /api/jobs/process every 10s
  ├─ Track status (pending, running, success, error)
  └─ Audit logs on mutations
```

---

## Checklist de Validação

### Fase 1 (Webhook)
- [ ] Build passa com Zod schema
- [ ] Retry helper compila (TypeScript strict)
- [ ] Redis key format: `org:{org_id}:settings:chat`
- [ ] Timeout não quebra tipo Promise (use timeout as separate signal)
- [ ] Idempotency check: before insert note, select by (lead_id, whatsapp_message_id)

### Fase 2 (Observability)
- [ ] Logger outputs JSON: `{ts, level, msg, duration, error}`
- [ ] Rate limit keys: `rl:{user_id}:leads:2026-08-08` (sliding window)
- [ ] Migration auto-applies: test locally with `node db-run.mjs supabase/migrations/0047_*.sql`
- [ ] Audit trigger fires: UPDATE lead → INSERT audit_logs

### Fase 3 (Scalability)
- [ ] ABAC helper: `can.check('vendedor', 'lead', 'delete', {value: 1000})` → false
- [ ] selectLead('basic') returns only [id, name, phone]
- [ ] search_text GIN index: `EXPLAIN` shows index scan, not seq scan
- [ ] Jobs table polled: /api/jobs/process updates job.status
- [ ] E2E tests: `npm run test:e2e` runs 3 suites
- [ ] Circuit breaker: after 5 failures, reject fast (OPEN state)

---

## Integração com Projeto

### package.json updates
```json
{
  "dependencies": {
    "@upstash/redis": "^1.x",
    "zod": "^3.x",
    "cron-parser": "^4.x"
  },
  "scripts": {
    "migrate:up": "node db-run.mjs supabase/migrations/*.sql",
    "test:e2e": "playwright test",
    "start:jobs": "node src/workers/jobs.js"
  }
}
```

### ENV vars (add to .env.local)
```
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...
WHATSAPP_WEBHOOK_SECRET=... (já existe)
X_JOB_SECRET=... (novo, para /api/jobs/process)
X_QUEUE_SECRET=... (novo, para /api/queue/process)
```

### Deploy flow
```
git push → Vercel
  ↓
Pre-build: npm install + migrate:up
Build: next build
  ↓
Deploy to production
  ↓
Post-deploy: jobs worker starts (node-cron or serverless)
```

---

## Depois: Próximas Melhorias

1. **GraphQL layer** (Apollo Server + Supabase relay) — auto-fetch related
2. **Subscription webhooks** (Supabase Realtime) — live updates no dashboard
3. **Staging environment** em Vercel → teste antes de prod
4. **Metrics dashboard** (Grafana) — latência, taxa de erro, throughput
5. **Message queue persistente** (Postgres FIFO, não só Redis)

---

## Contacts & Rollback

If anything breaks:
1. Roll back to prior commit (git revert)
2. Test migrations locally: `node db-run.mjs supabase/migrations/0047_*.sql`
3. Check Vercel logs for errors
4. Debug via /api/jobs/process logs (structured JSON)

---

Status: **IN PROGRESS** (15 agents, ETA ~30 min)  
Last updated: 2026-08-08  
Owner: Adriano (IA + refactor)
