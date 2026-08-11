# Quando `createAdminClient` é obrigatório

A porta real de autorização é a **RLS** com o user client (`createClient` de `@/lib/supabase/server`). O service role só entra quando o user client **não consegue** fazer o trabalho — vault, storage privado, webhooks sem sessão, ou RPCs concedidas só a `service_role`.

## Matriz

| Caso | Client | Motivo |
|------|--------|--------|
| CRUD de leads, mensagens, notas, tags, tarefas, reuniões (com usuário logado) | **user** | RLS (`can_see_lead` / papel) |
| `scheduled_messages` insert/cancel pelo chat | **user** | RLS lead-scoped |
| `sales` / `sale_payments` (após migração 0050) | **user** | Escopo via `can_see_lead` no lead da venda |
| Listar `wa_numbers` **sem** token (filtro do chat) | **admin** | Tabela com token; select amplo só via service role (nunca devolver token ao client) |
| Ler/escrever token de `wa_numbers`, criar sessão DinastiAPI | **admin** | Segredo de integração |
| Upload/list/delete em bucket `whatsapp-media` / `contracts` | **admin** | Storage privado; signed URL gerada no server |
| Webhook WhatsApp / Asaas / cron tick | **admin** | Sem cookie de usuário; job de sistema |
| RPC `wa_find_or_create_lead` | **admin** | `GRANT` só a `service_role` (dedup atômico cross-setor) |
| Depois do RPC: select/update do lead pra devolver ao UI | **user** | RLS decide se o lead é visível; erro genérico se não |
| Sync Autentique no cron / comprovante pós-assinatura | **admin** | Cron sem sessão |
| Cobrança Asaas espelhando webhook | **admin** | Webhook sem sessão |

## Anti-padrões (não fazer)

1. **Select/update/delete de lead ou mensagens com admin só porque a action é “sensível”.** Use user client; se RLS bloquear, o acesso era indevido.
2. **Re-apontar webhook WhatsApp a partir de `localhost`.** Guardião exige `hostIsPublic` (`lib/jobs/run-guardian.ts`).
3. **Importar `admin.ts` em Client Components.** Pacote `server-only` quebra o bundle se vazar.

## Referência no código

- User server: `src/lib/supabase/server.ts`
- User browser (realtime/presence): `src/lib/supabase/client.ts`
- Admin: `src/lib/supabase/admin.ts` (`import "server-only"`)
- Roadmap: `docs/ADR-001-refactor-roadmap.md`
