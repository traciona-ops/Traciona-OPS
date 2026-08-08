# Traciona Eco Sistema — instruções para o Claude

## graphify (grafo de conhecimento do código)

Este projeto tem um grafo de conhecimento em `graphify-out/` (god nodes, comunidades, relações entre arquivos).

Regras obrigatórias:

1. **Antes de responder qualquer pergunta sobre o código, ou de fazer qualquer alteração**, consulte o grafo primeiro:
   - `graphify query "<pergunta>"` — subgrafo focado na dúvida (bem menor que grep ou leitura crua).
   - `graphify path "<A>" "<B>"` — relação/caminho entre dois conceitos.
   - `graphify explain "<conceito>"` — explicação de um nó e seus vizinhos.
   - `graphify affected "<X>"` — o que é impactado se X mudar (use antes de refatorar).
   - Só leia arquivos crus depois que o grafo tiver orientado onde mexer, ou para editar/depurar linhas específicas.
2. **Depois de qualquer alteração de código, o grafo é atualizado automaticamente** por um hook PostToolUse (Edit/Write em `.ts .tsx .js .jsx .mjs .sql .py` dispara `graphify update` em background — AST, sem custo de API). Não precisa rodar manualmente; se suspeitar que o grafo está defasado (ex.: hook desativado ou muitos arquivos mudados fora do Claude), rode `graphify update .`.
3. **Leia `graphify-out/GRAPH_REPORT.md` só para visão ampla de arquitetura**, quando query/path/explain não bastarem.

## Manter este CLAUDE.md atualizado

Sempre que uma alteração mudar a **estrutura** do projeto — módulo novo, rota nova, tabela/migração nova, integração nova, decisão de arquitetura — atualize a seção "Mapa do sistema" abaixo na mesma tarefa. Alterações pequenas (estilo, texto, fix pontual) não precisam.

## Mapa do sistema (resumo — detalhes em docs/TRACIONA-SISTEMA-REGRAS.md)

- **Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + RLS + Auth + Storage), Tailwind, deploy na Vercel (`traciona-eco-sistema.vercel.app`, deploy via `npx vercel deploy --prod --yes --scope adriano-advanceds-projects`).
- **Módulos (rotas em `src/app/(dashboard)/`):** Início, Agenda, Disponibilidade, Playbooks; setor Comercial: Contatos, Negócios (CRM), Tarefas Comerciais, Contratos, Vendas; Settings (equipe, permissões, integrações, WhatsApp).
- **Removidos em 07/08/2026** (a pedido, código apagado; commit anterior à remoção guardado no git): Dashboards, Ops Apps, Onboarding, Briefings, Prompts & IA, e com eles o setor "Operações & Projetos" e o link público `/o/[token]`. As tabelas `onboarding_requests`, `briefings`, `briefing_comments`, `prompts`, `prompt_versions`, `prompt_folders` e `dashboards` seguem no banco, órfãs e vazias. A meta do mês, que era editada em Dashboards, passou a ser editável no Início (`GoalBar`, admin/gestor).
- **Links públicos:** `/f/[token]` (OPS Form) — usa `createAdminClient()` (service role).
- **WhatsApp:** DinastiAPI (wuzapi) — envio, webhook em `/api/whatsapp/webhook`, sessão/QR, áudio convertido antes do envio. OPS Chat em `/chat` + chat dock.
- **Job scheduler (robusto, com histórico):** Substitui pg_cron com tabelas `jobs` + `job_runs` (migração 0050). pg_cron chama `/api/cron/dispatch` (header `x-cron-secret`) que inicializa jobs e delega a `/api/jobs/poll` (header `x-job-secret`). Cada job tem handler em `src/lib/jobs.ts`, cron parser integrado, retries, logs de execução. Tarefas: scheduled_messages_dispatch, automations_run, sync_avatars, sync_names, sync_lids, sync_contracts, whatsapp_guardian.
- **Message queue (Upstash Redis FIFO):** Desacopla webhook de tarefas pesadas (`src/lib/queue.ts`, tipos: `reply_automations`, `download_media`, `avatar_sync`). Webhook enfileira, `/api/queue/process` (header `x-queue-secret`) dequeue + executa handlers, com retry automático e DLQ. Env vars: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `QUEUE_WORKER_SECRET`. Processado via `/api/cron/dispatch` (chama `/api/queue/process` a cada minuto; para 10s, configure pg_cron separado com `SELECT cron.schedule('process_queue', '*/10 seconds', ...)` se o servidor suportar).
- **Integrações:** Autentique (contratos, GraphQL v2), Asaas (cobranças/assinaturas, webhook em `/api/asaas/webhook`), Anthropic SDK (análise de lead em `src/lib/ai.ts`).
- **Banco:** migrações em `supabase/migrations/` (aplicar com `node db-run.mjs <arquivo.sql>`). RLS por papel/dono/setor via helpers SECURITY DEFINER (`my_role`, `is_manager`, `my_sector`, `can_see_lead`).
- **Núcleo (god nodes do grafo):** `createClient()` (`src/lib/supabase/server.ts`), `createAdminClient()`, `getProfile` (`src/lib/auth.ts`), `requireModule()`, `can`/permissões (`src/lib/permissions.ts`).
- **Design system (`src/components/ui/`):** `Button`, `Input`/`Textarea`, `Avatar`, `Toast`, `RichText`, `Skeleton`, `Badge`, e `Dialog`/`Drawer`. Todo modal e todo painel lateral passa por `Dialog`/`Drawer` — eles carregam `role="dialog"`, foco preso, Escape, retorno de foco e trava de rolagem; não reimplemente `fixed inset-0 bg-black/50` na mão.
- **Tokens de cor (`src/app/globals.css`):** só `var(--color-*)`, nunca paleta crua do Tailwind nem a variante `dark:` (o tema vem de `data-theme`, e o `@custom-variant dark` está declarado lá). Os acentos passam 4.5:1 nos dois temas; texto sobre fundo de acento usa `--color-on-accent`. Para cor escolhida pelo usuário (etapa, funil, tag), a tinta sai de `readableInk()` em `src/lib/utils.ts`.

## Disciplina de verificação

- Build passar não é prova. Teste interação real no navegador (Playwright) antes de dizer que funciona.
- Cuidado ao testar em produção: leads são reais e o pg_cron dispara sozinho — não criar automações/mensagens agendadas de teste sobre dados reais.
