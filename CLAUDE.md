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
- **Alvo de arquitetura:** `docs/ADR-001-refactor-roadmap.md` — Segurança → Cron fino → Actions→domínio → God-views → RLS. Referência viva: `vendas` + webhook WhatsApp. `createAdminClient` é excepcional (vault, storage privado, webhooks, RPCs `service_role`); writes cobertos por RLS usam user client. Matriz: `docs/ADMIN-CLIENT-MATRIX.md`.
- **Onde cada coisa mora:**
 - `src/app/` — rotas, Server Actions por módulo e `api/`.
 - `src/components/<módulo>/` — UI de cada tela; `components/ui/` é o design system; `components/context/` são os providers React (`role-context`, `notifications-provider`). Telas grandes partem em pasta (orquestrador + lista/dialog/painel), como `components/chat/`, `components/contratos/`, `components/vendas/`, `components/atividades/`, `components/crm/kanban/`, `components/crm/lead-detail/`.
 - `src/hooks/` — lógica de cliente reutilizável (realtime, rolagem, presença, gravador, conversas).
 - `src/lib/` — a raiz é o **núcleo** (`auth`, `access`, `permissions`, `integrations`, `types`, `contract-pdf`, `meeting-sync`, `automations/`), e o resto é separado por natureza:
    - `lib/services/` — integrações externas (`asaas`, `autentique`, `google-calendar`, `ai`, `whatsapp/`).
    - `lib/utils/` — helpers puros (`dates`, `masks`, `slug`, `extenso`, `media`, `ui` — este último tem `cn`, `formatPhone`, `currencyBRL`, `readableInk`).
    - `lib/data/` — conteúdo estático: `labels.ts` (rótulos e cores de `SECTOR`, `SOURCE_LABEL`, `TASK_*`, `AUTOMATION_*`), `modules.ts`, `contract-templates/`. Mudar coisa aqui não muda comportamento.
 - `lib/jobs/` — jobs do tick do cron (`dispatch-scheduled-messages`, `run-sweeps`, `run-guardian`); a rota `/api/cron/dispatch` só orquestra.
 - `lib/settings/` — equipe, sessão WhatsApp (settings) e metas (`team`, `wa-session`, `goals`).
 - `lib/crm/` — casos de uso CRM (`pipeline-placement`, `leads/*`, `action-guard`); funil padrão compartilhado entre webhook, chat e contatos. Entrada em `app/(dashboard)/crm/` partida em `lead-actions`, `pipeline-actions`, `activity-actions`, `automation-actions` (barrel em `actions.ts`). WhatsApp do CRM: `whatsapp-send-actions`, `whatsapp-inbox-actions`, `whatsapp-settings-actions` (barrel em `whatsapp-actions.ts`).
 - `lib/whatsapp/` — domínio WhatsApp (ingest live/history, parse, jid, leads, media-store, receipts/presence/reactions, signature, persist-outbound, chat-settings, **inbox**, **send-media**, **message-ops**). Provider HTTP fica em `lib/services/whatsapp/`. Webhook `/api/whatsapp/webhook` é borda fina.
 - `lib/chat-sessions/` — sessões de atendimento (híbrido CRM + helpdesk): `ensure-active-session`, lifecycle (claim/pause/resume/close), ACD, business-hours/SLA, settings flag, `format` (duração legível). Migrações `0051_chat_sessions.sql` + `0052_inbox_session_tabs.sql`. Actions em `app/(dashboard)/crm/session-actions.ts`. Flag `org_settings.chat.sessions_enabled` (default off).
 - `lib/contratos/` — domínio de contratos (`storage`, `from-template`, `sync-signature`, `send-for-signature`, `form-requests`, `delete-contract`, **create**); `lib/contracts.ts` é re-export estável. WhatsApp de contratos usa `lib/whatsapp/send-text-to-lead` (não importa Server Actions do CRM).
 - `lib/vendas/` — domínio de vendas (`from-contract`, `charges`, `from-asaas-webhook`); `lib/sales.ts` re-exporta `createSaleFromContract`.
 - `lib/supabase/` — clients.
  - `src/lib/types.ts` guarda **só tipos** — nenhuma constante. Rótulo/cor vai pra `lib/data/labels.ts`.
  - `src/types/` — `.d.ts` de libs sem tipagem.
  - `scripts/` — manutenção (`db-run.mjs`, `db-query.mjs`, `migrate.mjs`, `importa-asaas.mjs`); `scripts/checks/` — verificações pontuais de navegador; `tests/e2e/` — Playwright versionado. A raiz do repo só guarda config.
- **Teto de tamanho de arquivo:** componente de tela acima de ~400 linhas vira pasta (subcomponentes + hooks), como já foi feito no chat. Não deixe crescer um arquivo com todos os estados da tela dentro.
- **Módulos (rotas em `src/app/(dashboard)/`):** Início, Agenda, Disponibilidade, Playbooks; setor Comercial: Contatos, Negócios (CRM), Tarefas Comerciais, Contratos, Vendas; Settings (equipe, permissões, integrações, WhatsApp).
- **Removidos em 07/08/2026** (a pedido, código apagado; commit anterior à remoção guardado no git): Dashboards, Ops Apps, Onboarding, Briefings, Prompts & IA, e com eles o setor "Operações & Projetos" e o link público `/o/[token]`. As tabelas `onboarding_requests`, `briefings`, `briefing_comments`, `prompts`, `prompt_versions`, `prompt_folders` e `dashboards` seguem no banco, órfãs e vazias. A meta do mês, que era editada em Dashboards, passou a ser editável no Início (`GoalBar`, admin/gestor).
- **Links públicos:** `/f/[token]` (OPS Form) — usa `createAdminClient()` (service role).
- **WhatsApp:** DinastiAPI (wuzapi) — envio, webhook em `/api/whatsapp/webhook`, sessão/QR, áudio convertido antes do envio. OPS Chat em `/chat` + chat dock.
  - **O webhook é o único caminho de recebimento.** Ele resolve o lead (`wa_find_or_create_lead`), grava em `whatsapp_messages`, aprende o `wa_lid`, baixa mídia, trata `ReadReceipt`/`ChatPresence`/reação e HistorySync. Sem ele, nada entra — e nada avisa: a wuzapi só olha o status HTTP, então um handler que devolve 200 e descarta o payload parece saudável por fora (sessão conectada, webhook apontado certo, cron verde).
  - **Incidente 08–10/08/2026:** o commit `133bdb6` ("cleanup: remove generated files with breaking dependencies") trocou o handler por um stub de 15 linhas que respondia `{ok:true}`. O recebimento ficou morto por ~2 dias, sem nenhum sinal de erro; o sintoma que apareceu pro usuário foi "mensagem não chega em tempo real" — mas o realtime estava íntegro o tempo todo. Restaurado em `fa94fef` a partir de `8a32bb4` (versão inline pré-scheduler; a de `ce8c0ad` depende do Upstash abandonado). **Ao diagnosticar "mensagem não chega", cheque primeiro se a mensagem existe no banco** (`select max(created_at) from whatsapp_messages where direction='in'`) — se não existe, o problema é ingestão, não realtime.
  - Recuperar mensagens perdidas: `requestFullHistorySync({ days })` em `src/lib/services/whatsapp/dinastia.ts` pede o histórico, que chega assíncrono no próprio webhook como eventos HistorySync. O upsert é idempotente (`onConflict: provider_msg_id`), mas cria lead pra toda conversa 1:1 da janela — use o menor `days` que cubra o buraco.
- **Chat (`src/components/chat/`):** módulo único do OPS Chat — antes eram `inbox-view.tsx` (2,2k linhas) e `chat-dock.tsx` (2k). Divide-se em:
  - `conversation/` — a conversa de um lead. `chat-panel.tsx` monta `chat-header` + `session-actions` + `message-list` + `composer/message-composer` (com `attach-menu`, `schedule-popover`, `media-preview-dialog`, `quick-reply-picker`); `message-bubble.tsx` desenha a bolha; `lead-panel/` é o painel lateral em seções (`lead-fields`, `tags`, `tasks`, `meetings`, `notes`).
  - `workspace/` — a casca do app, estilo GronerZap. `shell/` traz o `ChatRail` (rail de ícones) e o `NumberHeader` (header preto do número + menu); `chat-workspace.tsx` guarda o `view` (`inbox` | `my-dash` | `ops-dash` | `queues` | `settings`) e orquestra `conversation-list/` (`list-header`, `list-filters`, `conversation-row`, `new-conversation`, **`queue-pills-list`**), `dashboards/` (`my-dashboard`, `ops-dashboard`), `queues/queues-admin.tsx` (CRUD de `chat_queues`: modo pull/ACD, SLA, expediente, CSAT), `settings/` (`chat-settings` → `numbers-section`, `quick-replies-section`, `appearance-section`) e `empty-state`. O antigo `metrics-panel` saiu — quem mostra número agora são os dois dashboards.
  - Pills da lista: **Aguardando · Em atendimento · Encerradas** saem de `inbox_sessions` e só aparecem com `sessions_enabled`; **Minhas · Todas** saem SEMPRE do CRM (`inbox_conversations`) e são a aba inicial. Isso não é detalhe de UI: se as cinco pills dependessem de sessão, ligar a flag esconderia todas as conversas até chegar mensagem nova — a sessão é episódio, a timeline do lead é contínua.
  - Settings do chat: números + toggles (assinatura, criar card automático, `sessions_enabled`, CSAT da fila) + atalho pro admin de filas (expediente/SLA).
  - `chat-dock.tsx` (botão flutuante + modal) e `chat-dock-lazy.tsx` (chunk separado, fora do bundle inicial). `/chat` renderiza o `ChatWorkspace` direto.
  - `types.ts` guarda `LeadContext`, `ChatMessage`, `ChatLead`, `Conv`, `ConvFilters`, `WaNumberRow`, `ChatNumber`.
  - Lógica viva nos hooks (`src/hooks/`): `useChatMessages` (histórico + bolha otimista + realtime + envio), `useChatScroll`, `useTypingPresence` (canal próprio de `chat_presence` + polling de 4s), `useAudioRecorder`, `useConversations` (lista + realtime + "digitando" + redes de segurança), `useUnreadCount`, `useChatAccent`, **`useActiveSession`**, **`useQueueSessions`**.
  - **Sessões (híbrido):** timeline continua por `lead_id`; `chat_sessions` é overlay (waiting/active/paused/closed). Inbound abre sessão se flag ligada; outbound só anexa se já houver aberta; HistorySync não cria sessão. VIP: etapa em `vip_stage_names` (default `Proposta`) → assignee = `leads.owner_id`. ACD: `agent_presence` + menor carga. CSAT agenda `csat_due_at` no encerramento — o job de envio ainda não existe.
  - O dock e a página `/chat` são a MESMA árvore — mudança no chat entra no módulo, nunca duplicada nos dois.
  - Verificação de navegador do módulo: `node scripts/checks/chat-refactor-check.mjs http://localhost:3000` (só leitura; não envia nem agenda nada).
- **Cron (`/api/cron/dispatch` — orquestrador fino):** pg_cron (jobid 1, `* * * * *`) chama a rota com header `x-cron-secret`; sem o secret certo, 401. A rota valida o secret e dispara jobs em `src/lib/jobs/` (`dispatchScheduledMessages`, `runSweeps`, `runGuardian`) + `runTimeAutomations` + `syncPendingContractSignatures` (`lib/contratos`). Agendadas rodam primeiro; o resto em `Promise.allSettled` (uma falha não derruba as outras). Guardião: presença global (`available` só com alguém no OPS Chat nos últimos 5 min) e re-aponta webhook/assinatura. Env vars: `CRON_SECRET`, `WHATSAPP_WEBHOOK_SECRET`.
 - **Trava do guardião:** o webhook só é re-apontado quando o host é público (`hostIsPublic` em `lib/jobs/run-guardian.ts`). Rodar o dispatcher em `localhost` apontaria o webhook de PRODUÇÃO pra um endereço que a DinastiAPI não alcança, e o recebimento pararia calado. Não remova esse `hostIsPublic`.
 - **Histórico:** em 08/08/2026 isso foi trocado por um job scheduler com tabelas `jobs`/`job_runs` + fila Upstash (`/api/jobs/poll`, `/api/queue/process`, `src/lib/jobs.ts`, `src/lib/queue.ts`). A troca foi revertida pela metade e ficou **tudo parado por um dia**: o dispatcher fazia `fetch` de rotas que não existiam mais. Em 09/08/2026 o dispatcher inline foi restaurado do git (commit `1878de5^`) e as pastas vazias apagadas. Em 10/08/2026 a lógica foi fatiada pra `lib/jobs/` (módulos de tick — não confundir com o scheduler Upstash abandonado). As tabelas `jobs`/`job_runs` nunca chegaram a existir no banco. Se um dia quiser voltar pro scheduler com histórico, comece de `1878de5` — mas só depois de aplicar a migração e configurar o Upstash.
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
