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
- **Onde cada coisa mora:**
  - `src/app/` — rotas, Server Actions por módulo e `api/`.
  - `src/components/<módulo>/` — UI de cada tela; `components/ui/` é o design system; `components/context/` são os providers React (`role-context`, `notifications-provider`).
  - `src/hooks/` — lógica de cliente reutilizável (realtime, rolagem, presença, gravador, conversas).
  - `src/lib/` — a raiz é o **núcleo e o domínio** (`auth`, `access`, `permissions`, `integrations`, `types`, `contracts`, `contract-pdf`, `sales`, `meeting-sync`, `automations/`), e o resto é separado por natureza:
    - `lib/services/` — integrações externas (`asaas`, `autentique`, `google-calendar`, `ai`, `whatsapp/`).
    - `lib/utils/` — helpers puros (`dates`, `masks`, `slug`, `extenso`, `media`, `ui` — este último tem `cn`, `formatPhone`, `currencyBRL`, `readableInk`).
    - `lib/data/` — conteúdo estático: `labels.ts` (rótulos e cores de `SECTOR`, `SOURCE_LABEL`, `TASK_*`, `AUTOMATION_*`), `modules.ts`, `contract-templates/`. Mudar coisa aqui não muda comportamento.
    - `lib/supabase/` — clients.
    - `lib/chat-sessions/` — sessões de atendimento (híbrido CRM + helpdesk): ensure/lifecycle/ACD/SLA; migrações `0050_chat_sessions.sql` + `0051_inbox_session_tabs.sql`; actions em `crm/session-actions.ts`; flag `org_settings.chat.sessions_enabled` (default off).
  - `src/lib/types.ts` guarda **só tipos** — nenhuma constante. Rótulo/cor vai pra `lib/data/labels.ts`.
  - `src/types/` — `.d.ts` de libs sem tipagem.
  - `scripts/` — manutenção (`db-run.mjs`, `db-query.mjs`, `migrate.mjs`, `importa-asaas.mjs`); `scripts/checks/` — verificações pontuais de navegador; `tests/e2e/` — Playwright versionado. A raiz do repo só guarda config.
- **Teto de tamanho de arquivo:** componente de tela acima de ~400 linhas vira pasta (subcomponentes + hooks), como já foi feito no chat. Não deixe crescer um arquivo com todos os estados da tela dentro.
- **Módulos (rotas em `src/app/(dashboard)/`):** Início, Agenda, Disponibilidade, Playbooks; setor Comercial: Contatos, Negócios (CRM), Tarefas Comerciais, Contratos, Vendas; Settings (equipe, permissões, integrações, WhatsApp).
- **Removidos em 07/08/2026** (a pedido, código apagado; commit anterior à remoção guardado no git): Dashboards, Ops Apps, Onboarding, Briefings, Prompts & IA, e com eles o setor "Operações & Projetos" e o link público `/o/[token]`. As tabelas `onboarding_requests`, `briefings`, `briefing_comments`, `prompts`, `prompt_versions`, `prompt_folders` e `dashboards` seguem no banco, órfãs e vazias. A meta do mês, que era editada em Dashboards, passou a ser editável no Início (`GoalBar`, admin/gestor).
- **Links públicos:** `/f/[token]` (OPS Form) — usa `createAdminClient()` (service role).
- **WhatsApp:** DinastiAPI (wuzapi) — envio, webhook em `/api/whatsapp/webhook` (ingest live + HistorySync; stub de `133bdb6` restaurado), sessão/QR, áudio convertido antes do envio. OPS Chat em `/chat` + chat dock.
- **Chat (`src/components/chat/`):** módulo único do OPS Chat — dock e `/chat` compartilham a mesma árvore.
  - **Shell (estilo GronerZap):** `workspace/shell/` (`ChatRail`, `NumberHeader`) + `view` em `chat-workspace.tsx`: `inbox` | `my-dash` | `ops-dash` | `queues` | `settings`. Tokens Traciona (`var(--color-*)`, `--chat-accent`).
  - `conversation/` — `chat-panel` = header + `session-actions` + message-list + composer; `lead-panel/`.
  - `workspace/conversation-list/` — pills **Aguardando | Em atendimento | Encerradas | Minhas | Todas** (`queue-pills-list`) quando `sessions_enabled`; sem flag, Minhas/Todas sobre CRM.
  - `workspace/dashboards/` — Minha dashboard + Dashboard de atendimentos (`getSessionMetrics`).
  - `workspace/queues/queues-admin.tsx` — CRUD de `chat_queues` (modo pull/ACD, SLA, expediente, CSAT).
  - Settings: números + toggles (assinatura, auto card, sessions_enabled, CSAT da fila) + atalho expediente/SLA.
  - Hooks: `useChatMessages`, `useChatScroll`, `useTypingPresence`, `useAudioRecorder`, `useConversations`, `useUnreadCount`, `useChatAccent`, `useActiveSession`, `useQueueSessions`.
  - **Sessões (híbrido):** `lib/chat-sessions/` + migrações `0050_chat_sessions.sql` / `0051_inbox_session_tabs.sql`. Timeline por `lead_id`; overlay waiting/active/paused/closed. Flag `org_settings.chat.sessions_enabled` (default off). CSAT agenda `csat_due_at` no close — job de envio ainda não.
  - Verificação: `node scripts/checks/chat-refactor-check.mjs http://localhost:3000`.
- **Cron (`/api/cron/dispatch`, 391 linhas — faz tudo inline):** pg_cron (jobid 1, `* * * * *`) chama a rota com header `x-cron-secret`; sem o secret certo, 401. Um tique faz, nesta ordem: (0) devolve pra fila mensagem presa em `processing` há mais de 10 min; (1) claim ATÔMICO das agendadas vencidas (`UPDATE ... WHERE status='pending' RETURNING` — dois tiques sobrepostos nunca pegam a mesma linha), envia, grava em `whatsapp_messages` e atualiza `last_contact_at`, com 3 tentativas e 5 min entre elas; (2) `runTimeAutomations`; (3) `sweepAvatars`/`sweepNumberNames`/`sweepLids`; (4) sync dos contratos "enviado" na Autentique (3 por tique, rate limit) → assinado dispara comprovante no WhatsApp e `createSaleFromContract`; (5) guardião por número: status da sessão, presença global (`available` só com alguém no OPS Chat nos últimos 5 min) e re-aponta webhook/assinatura quando saem do lugar. Cada etapa em `try` própria — uma falhando não derruba as outras. Env vars: `CRON_SECRET`, `WHATSAPP_WEBHOOK_SECRET`.
  - **Trava do guardião:** o webhook só é re-apontado quando o host é público. Rodar o dispatcher em `localhost` apontaria o webhook de PRODUÇÃO pra um endereço que a DinastiAPI não alcança, e o recebimento pararia calado. Não remova esse `hostIsPublic`.
  - **Histórico:** em 08/08/2026 isso foi trocado por um job scheduler com tabelas `jobs`/`job_runs` + fila Upstash (`/api/jobs/poll`, `/api/queue/process`, `src/lib/jobs.ts`, `src/lib/queue.ts`). A troca foi revertida pela metade e ficou **tudo parado por um dia**: o dispatcher fazia `fetch` de rotas que não existiam mais. Em 09/08/2026 o dispatcher inline foi restaurado do git (commit `1878de5^`) e as pastas vazias apagadas. As tabelas `jobs`/`job_runs` nunca chegaram a existir no banco. Se um dia quiser voltar pro scheduler com histórico, comece de `1878de5` — mas só depois de aplicar a migração e configurar o Upstash.
- **Integrações:** Autentique (contratos, GraphQL v2), Asaas (cobranças/assinaturas, webhook em `/api/asaas/webhook`), Anthropic SDK (análise de lead em `src/lib/ai.ts`).
- **Google Calendar (migração 0049):** OAuth por usuário — `/api/auth/google` inicia (com `prompt: "consent"`, senão o Google não devolve refresh token) e `/api/auth/google/callback` grava em `calendar_integrations` (tabela `company_calendars` criada para o calendário compartilhado, ainda não usada). Wrapper da API em `src/lib/google-calendar.ts`. O espelho fica em `src/lib/meeting-sync.ts` (`pushMeetingToGoogle` / `removeMeetingFromGoogle`), usado pelas **duas** telas que criam reunião — a Agenda (`src/app/(dashboard)/agenda/actions.ts`) e o painel do lead no OPS Chat (`createMeeting`/`deleteMeeting` em `src/app/(dashboard)/crm/actions.ts`). Reunião nova sai com link do Meet (`conferenceDataVersion: 1`) e o ID do evento vai pra `meetings.google_event_ids.personal`. Ao criar reunião por um caminho novo, chame o helper — não reimplemente o sync. Conectar/desconectar fica em Settings → Integrações. Env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`.
  - Falha de sync **não** desfaz a reunião: volta como `syncError` no retorno da action e vira toast. Não engula esse erro num `catch` mudo — foi assim que um `RangeError: Invalid time value` (reunião sem `ends_at`) passou despercebido.
  - Datas de `<input type="datetime-local">` nunca saem de `toISOString().slice(0,16)` — isso joga pra UTC e desloca 3h. Use `toLocalInput()` (`src/components/agenda/datetime-picker.tsx`).
- **Banco:** migrações em `supabase/migrations/` (aplicar com `node scripts/db-run.mjs <arquivo.sql>`). RLS por papel/dono/setor via helpers SECURITY DEFINER (`my_role`, `is_manager`, `my_sector`, `can_see_lead`).
- **Núcleo (god nodes do grafo):** `createClient()` (`src/lib/supabase/server.ts`), `createAdminClient()`, `getProfile` (`src/lib/auth.ts`), `requireModule()`, `can`/permissões (`src/lib/permissions.ts`).
- **Design system (`src/components/ui/`):** `Button`, `Input`/`Textarea`, `Avatar`, `Toast`, `RichText`, `Skeleton`, `Badge`, e `Dialog`/`Drawer`. Todo modal e todo painel lateral passa por `Dialog`/`Drawer` — eles carregam `role="dialog"`, foco preso, Escape, retorno de foco e trava de rolagem; não reimplemente `fixed inset-0 bg-black/50` na mão.
- **Tokens de cor (`src/app/globals.css`):** só `var(--color-*)`, nunca paleta crua do Tailwind nem a variante `dark:` (o tema vem de `data-theme`, e o `@custom-variant dark` está declarado lá). Os acentos passam 4.5:1 nos dois temas; texto sobre fundo de acento usa `--color-on-accent`. Para cor escolhida pelo usuário (etapa, funil, tag), a tinta sai de `readableInk()` em `src/lib/utils.ts`.

## Disciplina de verificação

- Build passar não é prova. Teste interação real no navegador (Playwright) antes de dizer que funciona.
- Cuidado ao testar em produção: leads são reais e o pg_cron dispara sozinho — não criar automações/mensagens agendadas de teste sobre dados reais.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
