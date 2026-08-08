# APIs — Fundamentos

- **API** = contrato de como um software pede dados/ações a outro sem conhecer seu interior. Analogia: garçom entre cliente e cozinha.
- Fluxo: Cliente → request → API (contrato) → Servidor (lógica) → Banco → resposta.
- Utilidade: reúso · integração · abstração · evolução independente · escala (1 API, N clientes).

## Anatomia da requisição

```
GET https://api.site.com/v1/users/42?ativo=true
```

- **método** (GET, POST...) · **endpoint** (recurso) · **query** (filtros após `?`) · **headers** (auth, content-type) · **body** (POST/PUT) · **versão** (`/v1` evita quebrar clientes)

## Métodos HTTP

- **GET** — ler (não altera nada)
- **POST** — criar recurso
- **PUT** — substituir recurso inteiro
- **PATCH** — atualizar parte
- **DELETE** — remover
- **Idempotência**: GET, PUT, DELETE podem repetir sem efeito extra. POST não.

## Status codes

| Faixa | Significado | Principais |
|---|---|---|
| 2xx | sucesso | 200 OK · 201 Criado · 204 Sem conteúdo |
| 3xx | redireção | 301 Movido · 304 Não modificado |
| 4xx | erro do cliente | 400 Inválida · 401 Não autenticado · 403 Sem permissão · 404 Não encontrado · 429 Excesso |
| 5xx | erro do servidor | 500 Interno · 503 Indisponível |

## Tipos de API

- **REST** — recursos via HTTP, padrão da web
- **GraphQL** — peça só os campos que precisa (evita over-fetching)
- **gRPC** — binário e veloz, entre serviços
- **WebSocket** — tempo real, bidirecional
- **SOAP** — legado corporativo, XML

## Autenticação de APIs

- **API Key** — chave no header; uso interno / server-to-server
- **Bearer / JWT** — token assinado por requisição; carrega identidade
- **OAuth2** — login delegado ("entrar com Google")
- [veja Autenticação x Autorização em seguranca.md]

## Boas práticas gerais

- HTTPS sempre · versione (`/v1`) · rate limit + 429 · paginação · Idempotency-Key em POST · erros claros em JSON · cache no que repete · documente (OpenAPI)

# Consumir API como sênior

Regra mental: rede e API dos outros **vão falhar** — seu app não pode cair junto.

- **Confiabilidade**: timeout sempre (1–5s) · retry só no transiente (5xx, 429, timeout — nunca 4xx) · backoff exponencial + jitter (1s, 2s, 4s...) · circuit breaker + fallback (sirva cache)
- **Segurança**: key no `.env` [veja Segredos em seguranca.md] · HTTPS · valide a resposta · Idempotency-Key em POST (retry não vira cobrança dupla)
- **Eficiência**: respeite 429 (`Retry-After`) · cache de GET [veja Cache em dados-performance.md] · pagine · leia a doc / use SDK

# Criar API como sênior

Regra mental: o contrato é para os outros — previsível, documentado, seguro.

- **Design**: recurso = substantivo plural (`/users`, não `/getUser`) · método = verbo HTTP · versione desde v1 · paginação + filtros
- **Contrato**: status codes corretos (nunca 200 para erro) · erro padronizado `{ code, message, requestId }` · OpenAPI gera doc/testes/SDKs · depreciação com header `Sunset`
- **Segurança**: valide todo input no servidor · auth + rate limit (`X-RateLimit-*`) · não vaze campos desnecessários · aceite Idempotency-Key e deduplique

## Erros que gritam "júnior"

- ✗ Só tratar 200 (ignorar 4xx/5xx)
- ✗ Sem timeout nem retry
- ✗ Retry sem backoff/idempotência (tempestade + cobrança dupla)
- ✗ Chave no código · 200 para erro

# API Gateway

Problema: múltiplas APIs, auth repetida, excesso de requisições, observabilidade dispersa.

- **Sem gateway**: cliente fala direto com cada serviço, auth duplicada = acoplamento
- **Com gateway**: Cliente → Gateway → fan-out → serviços. No gateway: cache, rate limit, retry, logs/métricas/traces.

## Como funciona

1. Cliente envia request
2. Gateway valida JWT / API key
3. Aplica predicates e filters
4. Escolhe upstream (users, orders, payments)
5. Transforma request/response e retorna

Funções: auth JWT/API key · rate limiting · roteamento por path/header/método · cache · monitoramento. Recursos avançados: circuit breaker, service discovery, load balancing.

Ferramentas: Kong, KrakenD, Spring Gateway. Padrão relacionado: Aggregation / BFF (Backend For Frontend).

# Comunicação entre Sistemas — 7 formas

## REST

- Métodos HTTP sobre recursos; **síncrono** (cliente bloqueado até resposta)
- Simples e universal; acopla serviços, sem streaming nativo

## gRPC

- Contrato forte em `.proto` (Protocol Buffers); binário sobre HTTP/2
- Muito mais rápido/leve que JSON; streaming bidirecional; ideal entre microserviços internos

## GraphQL

- Peça só os campos que precisa (evita over-fetching)

## WebSocket

- Conexão única aberta (**full-duplex**); os dois lados enviam quando quiserem
- Tempo real: chat, jogos, cotações, feeds

## Webhook

- Inverso do REST: quando algo acontece, o servidor chama a SUA URL via POST
- Assíncrono e desacoplado; comum em pagamentos ("pagamento aprovado")

## Message Queue

- Produtor deixa mensagem na fila e segue; consumidor processa depois
- **Ponto-a-ponto**: 1 mensagem → 1 consumidor; resiste a picos (RabbitMQ, SQS)

## Event Streaming

- **Um-para-muitos**: N consumidores leem o mesmo evento
- **Log durável**: replay do histórico; alta vazão (Kafka)

# Webhook x Polling

- Polling **puxa** (você pergunta no seu relógio; latência = intervalo; a cada 5s ≈ 17.000 chamadas/dia, 99% vazias)
- Webhook **empurra** (avisa quando acontece; latência ~instantânea; "API reversa")

**Use webhook**: reação na hora (pagamento, deploy) · o outro app suporta (Stripe, GitHub, Shopify) · quer cortar chamadas. Exige endpoint público + assinatura + retry.

**Use polling**: sem webhook disponível · não expõe endpoint (firewall) · tempo real não crítico · evento de altíssima frequência.

- 🔒 Webhook = POST na sua porta: **valide assinatura, trate retry, seja idempotente** (pode chegar 2×)
- 🤝 Padrão de produção: **híbrido** — webhook para velocidade + polling de reconciliação

# Filas & Mensageria

Problema: despachar trabalho pesado sem travar. Solução: app aceita, responde na hora, joga tarefa na **fila**; **worker** processa no seu tempo.

```
Você --pedido--> APP (produtor) --enfileira--> FILA (broker) --entrega--> WORKER
Você <--"ok, tô cuidando"-- APP
```

Produtor e consumidor não se conhecem — fila **desacopla**. Mais workers = mais escala.

## Conceitos essenciais

- **Work queue** — 1 mensagem → 1 worker (e-mail, vídeo, cobrança)
- **Pub/Sub** — 1 evento → N assinantes (cada um recebe cópia)
- **Ack** — worker confirma; só então a fila apaga
- **Retry + DLQ** — falhou N vezes → dead-letter queue, não trava a fila
- **Idempotência** — entrega "ao menos 1 vez"; trate duplicata para não cobrar 2x

## Quando usar

- 🐢 Tarefa lenta (e-mail, imagem/vídeo, relatório, API externa)
- 📈 Pico de tráfego (fila segura a onda)
- 🔗 Integrar serviços sem acoplar [veja Event-Driven em arquitetura.md]

Ferramentas: **RabbitMQ** (rotas) · **Kafka** (streaming) · **SQS** (zero-ops) · **Redis** (leve) [veja Redis em dados-performance.md]
