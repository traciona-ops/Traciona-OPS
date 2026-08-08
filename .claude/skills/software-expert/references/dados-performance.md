# Cache

- **Cópia temporária** dos dados: 1ª leitura lenta, as próximas instantâneas
- HIT = cache tem (memória, ms) · MISS = busca no banco (disco), guarda no cache

## Camadas

browser (sessão) → CDN (borda) → API gateway → app + Redis → **BANCO (fonte da verdade)**

Sistemas modernos cacheiam em várias camadas ao mesmo tempo. O banco é sempre a fonte da verdade.

## Estratégias de leitura/escrita

- **Cache-aside** — app checa cache; miss = busca no banco, salva, devolve. *O padrão comum, mais flexível.*
- **Read-through** — o cache/lib resolve a leitura. *Código do app mais simples.*
- **Write-through** — escrita atualiza banco + cache juntos. *Cache sempre atual.*
- **Write-behind** — escreve só no cache; persiste assíncrono depois. *Rápido; risco de inconsistência.*
- **Write-around** — escreve só no banco; não polui cache com dado pouco lido.

☆ Regra: comece com **cache-aside + TTL**; some write-through onde precisar.

## Invalidação — o problema difícil

- **TTL**: prazo de validade por chave · **jitter**: variação no prazo evita expiração em lote
- **Evicção**: LRU (menos usada recentemente) ou LFU (menos frequente)
- Na escrita: **DELETE, não SET** (apague a chave, não atualize) · event-driven (fila dispara invalidação) · tag-based (invalidar em lote)

## Cache stampede

Cache expira → todos batem no banco ao mesmo tempo. Defesas:
- **Single-flight** (lock de requisição única)
- **Refresh antecipado**
- **Stale-while-revalidate** (sirva o velho enquanto atualiza)

## Boas práticas

- Cache é performance, **não fonte da verdade** — fallback para o banco
- Só cacheie o que dói (latência, custo, volume)
- **Sempre TTL** — chave sem prazo = veneno de memória
- Monitore **hit ratio** (meta > 80%)

Prompt pronto:
> "Ache as queries mais lentas e repetidas; proponha cache-aside com Redis (TTL + jitter), invalidação por DELETE na escrita e fallback pro banco."

# Redis

Armazém **em memória** (sub-ms): cache + sessão + fila + mensageria. Em sistema com réplicas, é o **estado único compartilhado** [veja Stateless em arquitetura.md]. O banco continua fonte da verdade.

## Casos de uso

- **Cache** — resultados caros [veja Cache acima]
- **Sessão** — login compartilhado entre réplicas; mata sticky session
- **Rate limit** — INCR + TTL [veja Rate Limiting em seguranca.md]
- **Pub/Sub** — broadcast entre instâncias
- **Filas/jobs** — LPUSH / RPOP [veja Filas em apis-integracao.md]
- **Streams** — log append-only tipo Kafka, mais simples
- **Leaderboard** — Sorted Set, ranking em tempo real

## Estruturas de dados

- **String** (cache, INCR) · **Hash** (objetos/sessões) · **List** (filas) · **Set** (únicos/tags) · **Sorted Set** (ranking, janela deslizante) · **Stream** (log de eventos, XADD)

## Por que é rápido

- Tudo em RAM (sub-ms) · single-thread + event loop (sem locks) · operações atômicas quase todas O(1) · protocolo enxuto + pipelining

## Padrão nº 1 — cache-aside

Hit = devolve na hora. Miss = busca no banco, grava com TTL, devolve. Meta: **hit rate > 80%**.

## Quando usar / não usar

- ✓ Velocidade sub-ms · estado compartilhado entre réplicas · tempo real · dados efêmeros com TTL
- ✗ Fonte da verdade de dado crítico (é memória) · dados > RAM · queries complexas/relações (SQL) · quando não precisa de velocidade

## Na prática (redis-cli)

```
SET user:42 "{...}" EX 3600      # cache com TTL
GET user:42
INCR rl:ip:1.2.3.4               # rate limit
EXPIRE rl:ip:1.2.3.4 60
LPUSH fila:emails "job1"         # fila
RPOP fila:emails
ZADD rank 1500 "p7"              # leaderboard
ZREVRANGE rank 0 9
```

## Persistência & HA

RDB (snapshot) · AOF (log, quase zero perda) · Sentinel (failover automático) · Cluster (sharding) · gerenciado: ElastiCache, MemoryStore, Upstash

## Boas práticas

- `maxmemory` + `allkeys-lru` · TTL em tudo + namespaces claros
- Monitore hit rate (>80%) e evictions
- **Fail open**: Redis caiu, não derrube o request
- Nunca exponha publicamente (bind local + senha)

# SQL x NoSQL

Não existe banco "melhor" — existe o que encaixa no problema.

## Diferença fundamental

- **SQL**: tabelas, colunas fixas, relações, schema fixo
- **NoSQL**: schema flexível, cada documento com sua forma (JSON)

## 4 famílias de NoSQL

- **Documento** (MongoDB) — JSON flexível, uso geral, o mais comum
- **Chave-Valor** (Redis) — o mais simples e rápido; cache e sessões
- **Colunar** (Cassandra) — escrita pesada, séries temporais, escala massiva
- **Grafo** (Neo4j) — conexões: redes sociais, recomendação, fraude

## Comparativo

| | SQL | NoSQL |
|---|---|---|
| Estrutura | tabelas + relações | doc · chave · coluna · grafo |
| Schema | fixo | flexível |
| Escala | vertical (servidor maior) | horizontal (+ servidores) |
| Consistência | ACID (forte) | BASE (eventual) |
| Query | SQL + JOINs | API própria |
| Exemplos | Postgres · MySQL | Mongo · Redis · Cassandra |

## ACID x BASE

- **ACID** (Atomicidade · Consistência · Isolamento · Durabilidade): transação tudo-ou-nada. Para dinheiro e estoque.
- **BASE** (Basically Available · Soft state · Eventually consistent): troca consistência imediata por disponibilidade/escala. Ótimo para feed e curtidas; ruim para saldo.

## Quando usar

- **SQL (o padrão)**: dados estruturados/relacionais · transações e integridade (banco, e-commerce, ERP) · JOINs e relatórios
- **NoSQL (casos específicos)**: schema muda muito · escala horizontal (volume/escrita) · tempo real e cache (feed, chat, IoT, sessões)

## Polyglot persistence

Maioria em 2026 usa os dois: Postgres no núcleo transacional, Redis no cache, grafo na recomendação. Meio-termo: **NewSQL** (Spanner, CockroachDB) — SQL + ACID com escala horizontal. Escolha pelo caso de uso, não pelo hype.

Prompt pronto:
> "Modele o schema deste domínio e recomende SQL ou NoSQL com a justificativa do trade-off (consistência x escala). Gere as tabelas/coleções e os índices nas colunas de filtro."

# O Problema N+1

O bug que passa na revisão, roda liso no dev e detona o banco em produção.

- 1 query pega N itens (`SELECT * FROM posts`) + N queries (1 por item) = **N+1 idas ao banco**
- 100 posts = 101 queries em vez de 2

## Por que é silencioso

ORM esconde as queries (lazy loading):

```
posts = Post.all
posts.each { |p| p.author.name }   # cada .author dispara query escondida
```

- Dev: 10 registros, 11 queries, 20ms — "tá rápido!"
- Produção: 50 mil registros, 50 mil queries, banco no chão
- O custo cresce com os **dados**, não com o código

## A cura: eager loading

- ✗ Lazy: `Post.all` → 101 queries
- ✓ Eager: `Post.includes(:author)` → 2 queries (IN ou JOIN)

Por stack:
- **Rails** — `.includes(:author)`
- **Django** — `select_related` / `prefetch_related`
- **Prisma** — `include: { author: true }`
- **Hibernate** — `JOIN FETCH`
- **GraphQL** — **DataLoader**: batching, 1 query em lote em vez de 1 por resolver

⚠ Eager em TUDO vira over-fetching — carregue só a relação que vai usar.

## Como caçar

- ☑ Log de queries no dev (quantas queries por tela)
- ☑ Detector automático: Bullet (Rails), Django Debug Toolbar; APM em produção
- ☑ Audite listas, relatórios e loops que acessam relação
- ☑ Teste com dados realistas no staging [veja staging em devops.md]

**Regra de ouro**: acessou relação dentro de loop? Eager loading.
