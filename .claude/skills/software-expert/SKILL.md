---
name: software-expert
description: Base de conhecimento consolidada de engenharia de software — APIs, arquitetura, dados/performance, segurança, IA aplicada e DevOps. Use quando o usuário perguntar sobre design de API, REST/gRPC/webhooks, microserviços vs monólito, load balancer, cache/Redis, SQL vs NoSQL, N+1, SQL injection, auth, rate limiting, .env/segredos, RAG, embeddings, MCP, multiagente, guardrails, CI/CD, VPS vs Vercel, ou comandos DevOps. Também para revisar código/arquitetura com essas melhores práticas.
---

# Software Expert

Base de conhecimento consolidada (80 imagens técnicas) sobre engenharia de software moderna. Consulte o arquivo de referência do tema relevante — não carregue todos de uma vez.

## Como usar

1. Identifique o tema da pergunta/tarefa
2. Leia APENAS o(s) arquivo(s) de referência relevante(s) em `references/`
3. Aplique os conceitos, trade-offs e checklists ao contexto do usuário
4. Siga os links internos (`[veja X em arquivo.md]`) quando o tema cruzar módulos

## Índice de referências

| Arquivo | Cobre |
|---|---|
| `references/apis-integracao.md` | HTTP, REST, gRPC, GraphQL, WebSocket, webhooks vs polling, API Gateway, BFF, message queues, event streaming (Kafka), consumir/criar API como sênior |
| `references/arquitetura.md` | MVC, Master-Slave, monolítica, microserviços, monólito modular, event-driven, SOA, layered, load balancer, health checks, L4 vs L7, master/réplicas, alta disponibilidade |
| `references/dados-performance.md` | Cache (estratégias, invalidação, stampede), Redis (estruturas, casos de uso, HA), SQL vs NoSQL, ACID vs BASE, polyglot persistence, problema N+1 e eager loading |
| `references/seguranca.md` | SQL injection, queries parametrizadas, menor privilégio, autenticação vs autorização (OIDC/OAuth, RBAC/ABAC/ReBAC), segredos/.env, rate limiting (4 algoritmos), proxy vs VPN |
| `references/ia-aplicada.md` | RAG (chunking, embeddings, busca híbrida, rerank), MCP, arquitetura multiagente, subagentes, dynamic workflows, guardrails, engenharia de contexto |
| `references/devops.md` | Pipeline protótipo→produção, 4 disciplinas (PRD, review, QA, operação), VPS vs Vercel, cheat sheets (Linux, Git, Docker, kubectl, AWS, Terraform, CI/CD) |

## Princípios transversais

- Tudo pode falhar: timeout, retry com backoff, circuit breaker, fallback
- Idempotência em toda escrita repetível (POST, webhooks, filas)
- Menor privilégio em todo lugar: banco, tokens, tools de agentes
- Fonte da verdade é o banco; cache e Redis são aceleradores
- Portões antes de produção: review, CI, staging, observabilidade
- Contexto/config como código: versionado, validado, com manutenção
