# ADR-001 — Roadmap de refatoração (Controller → Service + RLS)

**Status:** Aceito — Fases 0–3 feitas; Fase 4 iniciada (migração 0050 + matriz admin) (2026-08-10)  
**Data:** 2026-08-10  
**Contexto:** Auditoria de dívida técnica. Referência viva no repo: `vendas/actions.ts` + webhook WhatsApp.

## Decisão

Refatorar em fatias, sem big-bang, nesta ordem:

1. **Fase 0 — Segurança** ✅: fechar bypass de admin no inbox (`deleteConversation`, `startConversation`); `import "server-only"` em `admin.ts`; gate `getProfile` / `can.*` nas actions sensíveis.
2. **Fase 1 — Cron fino** ✅: extrair jobs de `api/cron/dispatch` para `lib/jobs/`; rota só valida secret e orquestra (`Promise.allSettled`).
3. **Fase 2 — Actions → domínio** ✅ (P1+P2): WhatsApp (`inbox`, `send-media`, `message-ops`), CRM (`lib/crm/leads/*`), contratos (`create` + schemas), settings (`team`, `wa-session`, `goals`) + Zod nas actions.
4. **Fase 3 — God-views** ✅ (núcleo): contratos, vendas, tarefas, kanban, lead-detail partidos; `/chat` semeado no server (`initialConversations` / `initialThread`). Restam telas secundárias >400 (contacts, sidebar, etc.).
5. **Fase 4 — Dados/RLS (contínuo):** ✅ migração `0050_sales_rls_can_see_lead.sql`; ✅ matriz em `docs/ADMIN-CLIENT-MATRIX.md`. Continuar preferindo user client onde RLS cobre.

## Estrutura-alvo (por feature)

```
page.tsx (RSC) → fetch inicial / requireModule
└─ View (ilhas client) → UI + chama actions
actions.ts → auth + Zod + revalidate + chama domínio
lib/<domínio>/use-case.ts → regras + supabase (user) + admin só se justificado
supabase RLS → porta real de autorização
```

## Critérios de done (resumo)

| Fase | Done quando |
|------|-------------|
| 0 | Gestor do setor A não apaga/lê conversa do setor B por UUID |
| 1 | Route do cron < ~80 linhas; cada job testável isolado |
| 2 | Action típica ≤ ~40 linhas; zero FormData/SQL de negócio na action |
| 3 | Nenhum view de tela > ~400 linhas; `/chat` sem RPC vazio no mount |
| 4 | Matriz “quando admin é obrigatório” documentada; writes cobertos por RLS usam user client |

## Consequências

- Admin (`createAdminClient`) fica excepcional: vault `wa_numbers`, storage privado, webhooks, RPCs só `service_role`.
- Tudo que divergir de vendas + webhook WhatsApp continua dívida até migrar.
- Este ADR versiona o alvo; o progresso concreto vive nos PRs por fase.
