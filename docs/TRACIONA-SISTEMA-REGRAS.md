# Traciona Eco Sistema — Regras, Padrões e Armadilhas (base para Skill)

> Conhecimento acumulado construindo o sistema. Foco no que **funciona** e nas
> **armadilhas já resolvidas**. Serve de fonte para montar uma Skill de
> "construir/operar um CRM Next.js + Supabase + WhatsApp (DinastiAPI)".

---

## 1. Stack

- **Next.js 16** (App Router, Server Components, Server Actions, Turbopack)
- **React 19**, **TypeScript strict**, **Tailwind v4** (`@theme inline` com CSS vars)
- **Supabase**: Postgres + Auth + Storage + Realtime + **RLS**
  - `@supabase/ssr` → cliente de browser e de servidor (sessão do usuário, sujeito a RLS)
  - cliente **admin** (service role) → **bypassa RLS** (usar só no servidor: webhook, cron, settings)
- **WhatsApp**: DinastiAPI (baseada em **wuzapi/whatsmeow**)
- **Deploy**: Vercel
- **Agendamento**: `pg_cron` + `pg_net` no Supabase
- **Migrations**: runner próprio `scripts/db-run.mjs` (lê `.env.local`, roda SQL via `pg`, session pooler)

---

## 2. Convenções de código

### Server Actions
- Retorno padrão: `{ ok: true }` **ou** `{ error: string }` (e variações como `{ id }`).
- **Armadilha de narrowing (TS strict):** quando a action retorna uma união
  "estrita" (ex.: por causa de um `return guard` cujo tipo é `{ error: string }`),
  `if (r?.error)` **não compila** ("Property 'error' does not exist on { ok: boolean }").
  - Use `if (r && "error" in r)` para estreitar.
  - Quando a união é "unificada" (todos os branches são literais inline), `r?.error`
    funciona e `"error" in r" pode deixar `r.error` como `string | undefined`.
  - Regra prática: se quebrar no build, troca pra `"error" in r`.
- O build incremental do TS pode **mascarar erros latentes**; ao editar um arquivo,
  o TS recheca e erros antigos aparecem. Sempre rode `npm run build` após mexidas amplas.

### Estrutura de actions
- Guard de papel no topo da action (ver Permissões). Helper:
  ```ts
  async function ensure(check: (r: UserRole) => boolean) {
    const { role } = await getProfile();
    return check(role) ? null : { error: NOT_ALLOWED };
  }
  // uso: const denied = await ensure(can.deleteLead); if (denied) return denied;
  ```

---

## 3. Supabase: clientes e RLS

### Qual cliente usar
- **`createClient` (server, sessão do usuário)** → páginas e actions normais.
  **É submetido à RLS** — é assim que a visibilidade por papel/dono "simplesmente funciona".
- **`createAdminClient` (service role)** → **bypassa RLS**. Usar em: webhook do WhatsApp,
  cron/dispatch, ações de equipe (settings), upload no Storage. Nunca importar no client.

### RLS por papel/dono (padrão validado)
- Helpers `SECURITY DEFINER STABLE` (evita recursão e é eficiente em policy):
  ```sql
  create or replace function public.my_role() returns text
    language sql stable security definer set search_path = public
    as $$ select role::text from public.profiles where id = auth.uid() $$;

  create or replace function public.is_manager() returns boolean
    language sql stable security definer set search_path = public
    as $$ select public.my_role() in ('admin','gestor') $$;
  ```
- **Leads por dono:** `using (public.is_manager() or owner_id = auth.uid())` em
  select/insert/update; delete só `is_manager()`.
- **Tabelas ligadas ao lead** (mensagens, notas, tarefas, tags, reuniões, agendadas):
  `is_manager() or exists (select 1 from leads l where l.id = <tbl>.lead_id and l.owner_id = auth.uid())`.
- **Config (pipelines, etapas, quick_replies):** leitura `true`; escrita só `is_manager()`.
- **profiles:** leitura `true` (precisa pra exibir nomes/responsáveis); escrita só via
  service role (sem policy de escrita p/ authenticated).
- **Ao ligar RLS por dono:** garantir que o `createLead` seta `owner_id` corretamente —
  vendedor **só cria pra si** (senão o `WITH CHECK` barra o insert).

### Migrations
- Aplicar com `node scripts/db-run.mjs supabase/migrations/000X_nome.sql`.
- **Enum (`ALTER TYPE ... ADD VALUE`)**: o valor novo **não pode ser usado na mesma
  transação**. Separe em DOIS arquivos/execuções: 1) adiciona valores ao enum; 2) usa.
- `drop policy if exists` antes de recriar (idempotência).

---

## 4. Permissões / Papéis

- Papéis: **admin**, **gestor**, **vendedor** (enum `user_role`).
- Fonte única em `src/lib/permissions.ts` (`can.manageTeam`, `can.configurePipelines`,
  `can.deleteLead`, `can.transferLead`, `can.viewReports`, `can.viewAllLeads`).
- **Duas camadas:** RLS no banco (trava real) **+** gating de UI/actions (UX).
- **Gating de UI sem prop drilling:** `RoleProvider` no layout do dashboard + hook
  `useRole()` nos client components (sidebar, header, kanban, cards, inbox).
- Página sensível: `getProfile()` no server + `redirect()` se papel não permite
  (ex.: `/settings` e `/crm/relatorios` só admin/gestor).
- **Settings actions usam service role → o guard de papel na action é a ÚNICA trava.**
  Nunca esquecer o `requireAdmin` nelas.
- Visibilidade do vendedor = só os leads onde é `owner_id` (resolvido por RLS;
  páginas/queries com `createClient` filtram sozinhas).

### Setores (Vendas / Suporte / Financeiro) — partição de visibilidade
- Coluna `sector` (texto) em `leads` e `profiles` (default `vendas`). Fixos no app (`SECTOR` em types.ts).
- Regra combinada com papel: **admin** vê tudo; **gestor** vê tudo do seu setor; **vendedor** vê os leads DELE no seu setor.
- Helpers: `my_sector()` e `can_see_lead(lid)` (SECURITY DEFINER). Tabelas ligadas ao lead usam `public.my_role()='admin' OR public.can_see_lead(lead_id)`.
- `createLead`: só admin escolhe setor livre; demais criam no próprio setor (senão a RLS barra). Trocar o setor (rotear) é efetivamente **admin** (WITH CHECK exige sector=my_sector pros não-admin).
- UI: setor por membro em Configurações (admin), badge/seletor no painel do lead do inbox, filtro + bolinha de cor na lista de conversas.

---

## 5. DinastiAPI (WhatsApp) — contrato e armadilhas

### Básico
- **Auth:** header `token: <TOKEN_DA_INSTANCIA>` em toda chamada.
- **A URL do Manager ≠ URL da API.** A API wuzapi roda em outro serviço/URL.
- Swagger da instância: `GET {base}/api/swagger.json` (146 rotas; body nem sempre documentado).

### Envio
- Texto: `POST /chat/send/text` `{ Phone, Body }`.
- Mídia: `/chat/send/{image,audio,video,document}`. Campos: `Image|Audio|Video|Document`
  (base64 data URI **ou** URL http(s)), `Caption`, `FileName`, `MimeType`.
- **9º dígito brasileiro:** resolver o JID antes de enviar via `POST /user/check`
  `{ Phone: ["55..."] }` → usa `data.Users[0].JID` (sem `@s.whatsapp.net`).

### Webhook (recebimento)
- Configurar em `POST {base}/webhook` `{ webhookurl, events: ["Message","ReadReceipt","Connected"] }`.
- Tornar a rota **pública** no middleware (não redirecionar pra /login).
- **Payload:** evento em `payload.data.event` (não `payload.event`).
- **Telefone real** em `Info.SenderAlt` (o `Info.Chat`/`Sender` vem como LID `@lid`).
- Mídia recebida em `Message.imageMessage/audioMessage/...` (camelCase) → baixar com
  `/chat/download{image,audio,...}` (usa url/directPath/mediaKey/etc).
- Matching de lead por telefone: igualdade, depois últimos 8/9 dígitos (9º dígito).

### Conexão / QR (feito dentro do app, em Configurações)
- `POST /session/connect` (sobe o client; pode assinar eventos).
- **QR:** ler de **`/session/status` campo `qrcode`** (data URI). O `GET /session/qr`
  **dá HTTP 500 quando não há client** ("no session"). 
- **`connected` vs `loggedIn`:** `connected` = websocket; `loggedIn` = WhatsApp vinculado.
  **"Conectado de verdade" = `connected && loggedIn`.** O Manager mostra "Conectado"
  só pelo websocket → engana.
- Fluxo robusto no front: clicou "Conectar" → `connect` → poll do status a cada 3s;
  se não logado e **sem QR**, re-emitir `connect` (regenera o client/QR); some o "loop".
- `POST /session/disconnect` (mantém auth) · `POST /session/logout` (desvincula, exige novo QR).

### S3 (storage de mídia da instância)
- `GET/POST /session/s3/config`, `POST /session/s3/test`.
- Para **Supabase Storage** (compatível com S3):
  - Endpoint: `https://<ref>.storage.supabase.co/storage/v1/s3`
  - Região: a do projeto (ex.: `sa-east-1`)
  - Bucket: o existente (ex.: `whatsapp-media`)
  - **Usar Path Style: SIM** (obrigatório; sem isso dá `tls: handshake failure` porque
    tenta `bucket.subdominio...`)
  - Access/Secret: **chaves S3 dedicadas** geradas no Supabase (Project Settings → Storage),
    **não** a service role/anon.
  - URL pública: `https://<ref>.supabase.co/storage/v1/object/public/<bucket>`
- "Modo de Entrega" (Base64 / S3 / Base64+S3) é sobre mídia **recebida nos eventos**,
  não sobre envio. Manter **Base64** se o webhook do app já baixa a mídia.

### ÁUDIO — a saga e a SOLUÇÃO (importante)
- **Sintoma:** `/chat/send/audio` responde `200 "Sent"` com `Type: voice_note`,
  `Duration`, `HasWaveform`, `Id` — mas o **WhatsApp nunca recebe**. Texto/imagem/doc entregam.
- **Descartado:** formato (OGG/Opus válido), base64 cru (dá `400 could not decode` quando
  o data URI tem `; codecs`), URL direta (200 mas não entrega), S3 configurado (não muda áudio).
- **Causa real:** o **encoding do opus-recorder** (gravação no browser) — a instância
  aceita mas **não consegue subir pro WhatsApp**.
- **Solução (do template MAIA da Dinastia):** reencodar antes de enviar pelo conversor:
  ```
  POST https://backend-whats-convert-api.jnsbgu.easypanel.host/convert/audio
  body: { "data": "<url pública do .ogg>", "input_type": "ogg", "is_url": true }
  → { "data": "data:audio/ogg;codecs=opus;base64,...." }
  ```
  Mandar esse data URI em `/chat/send/audio` (PTT:true). **Aí entrega como nota de voz.**
- Implementado em `convertAudio()` (dinastia.ts), chamado no `sendWhatsappMedia` só p/ áudio.

---

## 6. Agendamento (mensagem agendada / cron)

- Tabela `scheduled_messages` (status: pending/processing/sent/failed/canceled).
- Endpoint `/api/cron/dispatch` (público no middleware, protegido por header `x-cron-secret`):
  "claima" pendentes vencidas (status→processing), envia, grava em `whatsapp_messages`,
  atualiza status. Usa **service role** (bypassa RLS).
- **Gatilho:** `pg_cron` + `pg_net` no Supabase, a cada minuto:
  ```sql
  select cron.schedule('dispatch-scheduled-msgs','* * * * *', $$
    select net.http_post(
      url := 'https://<app>/api/cron/dispatch',
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<SECRET>'),
      body := '{}'::jsonb, timeout_milliseconds := 30000);
  $$);
  ```
- **Segredo no SQL** → não commitar esse SQL (rodar via arquivo temporário e apagar).
  O `CRON_SECRET` vai no `.env.local` e nas envs da Vercel.

---

## 7. Deploy (Vercel)

- Deploy: `npx vercel --prod --yes --token=<TOKEN>`.
- **Env vars: criar via REST API**, não pela CLI (a CLI por stdin grava **vazio**):
  ```
  POST https://api.vercel.com/v10/projects/<projectId>/env?teamId=<teamId>
  Authorization: Bearer <token>
  { "key":"X","value":"...","type":"encrypted","target":["production","preview","development"] }
  ```
- `projectId`/`orgId` em `.vercel/project.json`.
- Rotas públicas (webhook, cron) precisam estar no `PUBLIC_PATHS` do middleware.

---

## 8. Disciplina de verificação (regra de ouro)

- **Testar interação no navegador (Playwright), não só o build.** Build/types ≠ feature
  funcionando.
- **RLS:** testar com **sessões reais** de cada papel (login via `@supabase/supabase-js`
  com a anon key) — admin/gestor/vendedor — e checar visibilidade + bloqueios de escrita.
- **UI por papel:** Playwright criando usuário de teste por papel; conferir presença/ausência
  de Settings, Relatórios, Configurar, botões de excluir/transferir.
- **Áudio/mídia:** confirmar **entrega no celular** (a API dizer "Sent" engana).
- Sempre **limpar** usuários/leads/arquivos de teste no fim.

---

## 9. Armadilhas resolvidas (checklist rápido)

- [ ] Vercel CLI grava env vazio → usar REST API.
- [ ] FK ambígua no Supabase (2 FKs pra profiles) → usar `assignee:profiles!fk_name(...)`.
- [ ] Webhook 307 p/ /login → adicionar rota a `PUBLIC_PATHS` no middleware.
- [ ] Webhook ignora msg → payload em `data.event`, telefone em `Info.SenderAlt`.
- [ ] Envio falha "no LID" → resolver 9º dígito com `/user/check`.
- [ ] `/session/qr` 500 → ler QR de `/session/status.qrcode`; sempre `connect` antes.
- [ ] Card "Conectado" falso → exigir `connected && loggedIn`.
- [ ] S3 Supabase `tls handshake failure` → **marcar Path Style**.
- [ ] Áudio não entrega → **reencodar pelo conversor** antes de enviar.
- [ ] `if (r?.error)` quebra no build → `if (r && "error" in r)`.
- [ ] Enum novo na mesma transação → separar em 2 migrations.
- [ ] RLS liga e vendedor não cria lead → `createLead` seta `owner_id = ele`.
