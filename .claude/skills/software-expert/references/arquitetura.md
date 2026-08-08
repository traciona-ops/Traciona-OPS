# Padrões de Arquitetura de Software

Guia: MVC · Master-Slave · Monolítica · Microservices · Event-Driven · SOA · Layered.

## MVC (Model · View · Controller)

- **Controller** — recebe entrada do usuário e coordena o fluxo
- **Model** — gerencia dados e lógica da aplicação
- **View** — apresenta informações ao usuário
- Fluxo: entrada → Controller → Model (notifica mudanças) → View

## Master-Slave (Replicação)

- **Master** recebe escritas e coordena; **slaves** replicam para leitura e disponibilidade
- Escala leitura e reduz carga no nó principal
- [veja Master/Réplicas em Load Balancer, abaixo]

## Monolítica

- Toda a aplicação em uma base e uma implantação
- Estrutura: UI → Business Logic → Data Access → Database
- Simples para começar; pode ficar difícil de escalar/evoluir

## Microservices

- Serviços pequenos e independentes, cada um com sua responsabilidade
- **Gateway** centraliza entrada [veja API Gateway em apis-integracao.md]
- Cada serviço escala/evolui separado; normalmente banco próprio por serviço

## Event-Driven

- Eventos desacoplam produtores de consumidores
- **Broker** distribui eventos aos assinantes [veja Filas & Mensageria em apis-integracao.md]
- Ideal para fluxos assíncronos, integrações, alta escala

## SOA (Service-Oriented Architecture)

- Orquestra aplicações via barramento corporativo (**ESB**)
- Reutilização e integração entre sistemas enterprise/legados

## Layered (Camadas)

- **Presentation** (interface/entrada) → **Business** (regras) → **Persistence** → **Database**
- Responsabilidades bem definidas por camada

# Monólito x Microserviços

## A diferença

- **Monólito**: 1 processo, 1 codebase, 1 banco, deploy único; chamada de função (rápida)
- **Microserviços**: N processos, N repositórios, N bancos, N deploys; conversam pela rede (HTTP/fila) — lenta, pode falhar

## Trade-offs

**Monólito**
- ✓ Simples de rodar/debugar · deploy único, transação fácil · barato no começo
- ✗ 1 bug pode derrubar tudo · time grande trava no deploy

**Microserviços**
- ✓ Times e deploys independentes · escala só a parte que precisa · falha isolada
- ✗ Rede, tracing, transação distribuída · custa 5–10x mais para operar

Referências: debugar ~35% mais lento em microserviços; caso 2026: 13x menos latência e 87% menos custo voltando a monólito.

## Monólito Modular — a resposta de 2026

**Uma caixa só, com paredes fortes por dentro.**

- 1 aplicação · 1 deploy; módulos por domínio (login | pedidos | pagamento)
- Módulos falam por **interfaces explícitas** — não espiam o banco um do outro
- 80% da clareza dos microserviços, 0% da dor distribuída
- CNCF 2025: 42% das empresas consolidando de volta
- **Strangler Fig**: extraia um serviço só quando doer

## Quando quebrar em serviços

- Só com **dor real**: times demais travando no mesmo deploy
- Parte precisa de escala/hardware próprio (IA/GPU)
- Isolamento por regulação (PCI, HIPAA)
- ⚠ Evite o **monólito distribuído** (microserviços acoplados por banco compartilhado) — pior dos mundos
- Bônus: serviço pequeno e bem definido é mais fácil para IA manter

Prompt pronto:
> "Estruture como monólito modular, com módulos por domínio, interfaces explícitas e sem acesso cruzado ao banco; prepare as fronteiras pra virar serviço depois."

# Arquitetura Distribuída — Load Balancer

## O problema

- 1 servidor só = sobrecarga + ponto único de falha
- Com LB: usuários → LB → servidor 1/2/3. Um cai, os outros seguem.

## Como funciona

- Cliente fala só com o LB (1 endereço); LB escolhe servidor **saudável**
- Servidores **idênticos** e **stateless**; estado (sessão) em banco/cache compartilhado [veja Redis em dados-performance.md]
- Health check tira o doente do rodízio

## Algoritmos

| Algoritmo | Uso |
|---|---|
| Round Robin | reveza em ordem; servidores iguais, pedidos uniformes |
| Least Connections | menos conexões abertas; ótimo default para web |
| Weighted | por capacidade; máquinas fortes recebem mais |
| IP Hash (sticky) | mesmo cliente, mesmo servidor; sessão/carrinho |

## Health checks

- **Ativo**: LB sonda `GET /health` periodicamente
- **Passivo**: observa erros reais das respostas
- Pré-requisito: rotear para servidor morto é pior que qualquer algoritmo

## Camada 4 × Camada 7

- **L4** (transporte): roteia por IP:porta — rápido, escala mais
- **L7** (aplicação): enxerga HTTP — roteia por caminho/header/cookie (`/api` → backend A, `/img` → backend B); decide melhor

## Master/Réplicas (banco)

- Escritas no **master**; ele replica; **leituras** distribuídas nas réplicas
- Master cai → réplica **promovida** (failover)

## Stateless & sessão

- Sem estado local: qualquer servidor atende qualquer pedido
- Sessão em cache/banco compartilhado (Redis); sem isso, sticky sessions (perde flexibilidade)

## Alta disponibilidade do próprio LB

- LB vira novo ponto único de falha → **dois LBs + IP flutuante (VIP)**
- Heartbeats; ativo cai, standby assume o IP em segundos (ativo-passivo)
- Em escala: vários ativos via DNS/anycast

## Ferramentas

NGINX · HAProxy · Traefik · Envoy · AWS ALB/NLB · Cloudflare. Para começar: NGINX/HAProxy.

## Exemplo (HAProxy)

```
backend app_servers
  balance leastconn
  option httpchk GET /health
  server srv1 10.0.1.1:8080 check inter 5s fall 3 rise 2
  server srv2 10.0.1.2:8080 check inter 5s fall 3 rise 2
```

`balance leastconn` = menos ocupado; `check inter 5s fall 3 rise 2` = sonda a cada 5s, fora após 3 falhas, volta após 2 sucessos.

## Por que importa

- Alta disponibilidade · escala horizontal (soma máquinas) · deploy sem downtime (um por vez) · failover em qualquer peça
