# RAG — Retrieval-Augmented Generation

Em vez de treinar o modelo nos seus dados, **busca trechos relevantes no momento da pergunta** e entrega como contexto. Memória externa consultável: responde sobre seus documentos, citando fonte — menos alucinação.

- **Indexação (1x, offline)**: docs → chunks → vetores → Vector DB
- **Consulta (por pergunta)**: pergunta → vetor → busca por similaridade → top-k → rerank → LLM → resposta com fontes

## As 5 peças do pipeline

1. **Chunking** — quebra documentos em pedaços. *Onde 80% dos RAGs falham.*
2. **Embeddings** — chunk vira **vetor** que captura significado
3. **Busca** — Vector DB acha chunks próximos (semântica) + BM25 (palavras exatas)
4. **Rerank** — reordena candidatos, passa só os 3–5 melhores. *Maior ganho de precisão.*
5. **Geração** — LLM responde só com esse contexto, citando fontes

## Embeddings

- Texto → vetor (768, 1024, 3072... dimensões); sentidos parecidos = vetores próximos
- Acha o trecho certo **mesmo sem as mesmas palavras** ("gatinho" ≈ "felino" ≈ "gato")
- Motores (2026): **Gemini Embedding** (topo MTEB, multimodal) · **Voyage 3.x** (código/técnico) · **Cohere v4** (multilíngue) · **OpenAI 3** (padrão seguro; small ~$0,02/M) · **BGE-M3** (open-source, self-host)

## Chunking — onde 80% falha

- Semântico > cortar a cada N caracteres
- Cada chunk deve se sustentar sozinho
- Nunca corte no meio de frase, tabela ou função
- Use **sobreposição** entre chunks
- Pouco e bom > muito: contexto demais dilui o sinal

## Busca híbrida + Rerank

- Denso (vetores) acha significado; BM25 acha termos exatos/siglas — **híbrido bate só-vetor**
- 2 estágios: ~50–100 candidatos → rerank → top 3–5
- Rerank: +10 a 25% de precisão, corta alucinação
- Rerankers: Cohere Rerank 3.5, Voyage, Jina, ColBERT

## Boas práticas

- **80% dos problemas são de recuperação, não de geração** — depure o retrieve primeiro
- Sempre rerank · reescreva a query (vocabulário do usuário ≠ do documento)
- **Avalie desde o dia 1**: RAGAS, DeepEval, Langfuse — meça recall/precisão
- Guarde metadados e **cite as fontes**

## Stack (2026)

LangChain · LlamaIndex · Qdrant · Pinecone · pgvector · Cohere Rerank · RAGAS · Langfuse

## Níveis de RAG

**Naive → Avançado (híbrido + rerank) → Agentic (agente decide o que/quando buscar) → GraphRAG (grafo de conhecimento)**

Em uma frase: **o modelo é o último passo, não o primeiro. Acerte o que entra.**

# MCP — Model Context Protocol

Tradutor universal entre IA e seus sistemas — padrão aberto (Anthropic, hoje Linux Foundation). "USB-C da IA".

- **Sem MCP — caos N×M**: cada app de IA × cada ferramenta = integração sob medida
- **Com MCP — N+M**: apps (Claude, Cursor) → protocolo → ferramentas (GitHub, Postgres, Slack). Servidor 1×, todo cliente usa.

## Arquitetura

```
HOST (Claude Code · Desktop · Cursor)
 └ MCP Client (1 por servidor)
 ↕ JSON-RPC · stdio / HTTP
MCP SERVER — Tools · Resources · Prompts
 → banco · arquivos · APIs
```

MCP **não substitui suas APIs** [veja APIs em apis-integracao.md] — dá à IA um jeito padrão de usar o que já existe.

## As 3 primitivas

- **Tools** — a IA **faz** ("abra um PR", "rode esta query") — com sua aprovação
- **Resources** — a IA **lê** (arquivos, tabela, doc)
- **Prompts** — atalhos prontos do servidor ("/revisar-pr")

## Transporte

- **stdio** — servidor local, subprocesso (filesystem, banco local, CLIs)
- **HTTP** — remoto/hospedado (Streamable HTTP substitui SSE)
- Base: JSON-RPC 2.0 + descoberta automática (`tools/list`)

## Segurança

- Aprove cada ação · banco **read-only** · escope pastas (nunca `/`)
- Só servidores **confiáveis** (risco de prompt injection) [veja Guardrails abaixo]

## Por que importa

- Servidor 1×, qualquer cliente MCP usa · ~2.000 servidores no registry · OpenAI, Google, Microsoft adotaram

```
claude mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem ~/meu-projeto
/mcp   # deve aparecer "filesystem: conectado"
```

# Arquitetura Multiagente

**Orquestrador (maestro)** divide o trabalho entre **especialistas em paralelo**, em vez de 1 IA fazendo tudo num contexto só.

## Os 3 papéis

- **Orquestrador** — planeja, quebra a tarefa, roteia, sintetiza. *Rege, não executa.*
- **Especialista** — UMA tarefa bem definida, contexto próprio
- **Avaliador** — confere resultados antes de entregar (consistência, citações)

## Modos de execução

- **Paralelo** — fan-out/fan-in; tempo total = a tarefa mais longa, não a soma. Tarefas independentes.
- **Sequencial** — pipeline; cada um usa o resultado do anterior. Dependências.

## Números de referência

- +90,2% de performance vs. agente único (Anthropic: Opus orquestra, Sonnet no time)
- Token explica ~80% da variância de performance
- ⚠ Multiagente usa **~15x mais tokens** que um chat — use quando o valor paga a conta

## Cuidados e custo

- Nem tudo paraleliza (tarefas acopladas = 1 agente)
- Loops: subagente que gera subagente explode custo — ponha limites
- Erro propaga: subtarefa mal descrita = trabalho duplicado ou buracos
- **Model tiering**: modelo forte orquestra, leves trabalham · cache o contexto compartilhado · escope pequeno

## Quando NÃO usar

- Tarefas sequenciais ou pequenas (overhead não compensa)
- Resultados que dependem um do outro o tempo todo
- Sem verificação, paralelizar erro multiplica o erro

## Subagentes (Claude Code)

Problema: sessão longa entope a janela de contexto. Solução: delegar a tarefa barulhenta a subagente com janela **própria**; só o **resumo** volta.

```
# .claude/agents/revisor.md
---
name: revisor
description: revisa código e aponta bugs
tools: Read, Grep # só leitura!
---

Você é um revisor sênior. Devolva os
problemas com o nº da linha e a correção.
```

- 3–5 em paralelo é o ponto ideal
- 🔒 Tools mínimas (revisor só Read/Grep)
- 🎯 Um job por agente; a descrição é o gatilho
- 💰 Cada subagente é uma janela inteira (~7x mais tokens em fluxo pesado)
- 🧭 Regra de ouro: **Skill ensina o "como"; Subagente isola o trabalho barulhento**

## Dynamic Workflows

Agente líder escreve um script (JavaScript) que orquestra agentes num runtime à parte. **O plano vive no script, não no contexto** — só a resposta final volta. Ciclo: planeja → dispara em paralelo → refuta e verifica → converge.

Limites de referência: 16 simultâneos, até 1.000 por execução. Casos: migração de 750 mil linhas em ~11 dias, análise de 500 documentos, revisão de repositório inteiro.

# Guardrails — Segurança de Agentes de IA

Camadas de **validação e controle** nas entradas, ferramentas e saídas. Cada guardrail = **regra** (regex, blocklist) ou **classificador** (modelo que julga).

Sem guardrails: vaza PII/segredos · prompt injection · off-topic · alucina com confiança.

## Pontos de checagem

```
Você → GUARDRAIL DE ENTRADA → AGENTE → GUARDRAIL DE SAÍDA → Resposta
Do agente: GUARDRAIL DE FERRAMENTA → ferramentas & dados
Ação de risco → HUMANO NO CIRCUITO (pagar · apagar · enviar)
```

## Tipos

- **Entrada**: relevância (off-topic) · jailbreak/injeção · PII (mascara) · moderação · blocklist
- **Ferramenta**: permissões · validação de argumentos · rate limit por execução · sandbox (read-only, escopo de pastas) · aprovação humana
- **Saída**: PII · factualidade/fontes · conformidade (LGPD, HIPAA) · marca & tom · formato (JSON válido)

## Execução otimista + tripwire

Agente **gera** enquanto guardrail **checa em paralelo** (sem latência extra). Violou regra → **tripwire** corta a resposta antes de sair.

## Cuidados

- ⚠ Não são infalíveis — probabilísticos e burláveis. 1ª camada, nunca a única.
- ⚠ Defesa em profundidade: várias camadas simples > uma "super-checagem"
- ⚠ Segurança demais = fricção e latência; ajuste com falhas reais
- ⚠ Cadeia de agentes: proteja cada handoff, não só o agente final

## Por onde começar (o mais barato primeiro)

1. **Aprovação humana nas ações irreversíveis**
2. Guardrail de entrada (jailbreak / fora de escopo)
3. Guardrail de saída (PII)

# Engenharia de Contexto

A maioria das falhas não é do modelo — **é do contexto que você deu**.

## Anatomia de um bom contexto

1. **OBJETIVO** — o que precisa acontecer + como saber que ficou pronto
2. **CONTEXTO** — só arquivos/dados/decisões relevantes para este passo
3. **RESTRIÇÕES** — stack, padrões, o que não pode mudar
4. **EXEMPLO** — trecho do padrão a imitar
5. **FORMATO** — arquivo, diff, tabela, passo a passo

✳ Sem definição de pronto, a IA acerta o alvo errado.

Exemplo: ✗ "cria um endpoint de cadastro" (inventa stack e padrão) · ✓ "cria POST /users seguindo routes/orders.ts; valida com zod; erro no formato do projeto; pronto = rota + teste + validação de e-mail duplicado"

## A ferramenta certa

- ✳ **Skill** — conhecimento de "como fazer"
- ⚙ **MCP** — acesso a sistema externo [veja MCP acima]
- 👤 **Subagente** — delegar com janela limpa [veja Multiagente acima]
- 📄 **CLAUDE.md** — as regras da casa

## Skills — divulgação progressiva

1. Início da sessão: só nome + descrição
2. Deu match: carrega SKILL.md inteiro
3. Se precisar: abre arquivos/scripts extras
4. Custo: zero até usar — 50 skills não pesam; um CLAUDE.md gigante pesa

- Descrição é **gatilho**, não documentação · uma skill = **um** procedimento · scripts na skill rodam sem gastar contexto

## Regras de ouro

- ▶ Curadoria, não acúmulo — cada token disputa espaço
- ▶ Contexto fresco por task — terminou, abra outra conversa
- ▶ Falhou? Mexa no contexto antes do prompt
- ▶ Peça o plano antes do código
- ▶ Trate contexto como código — CLAUDE.md, skills e docs precisam de manutenção
