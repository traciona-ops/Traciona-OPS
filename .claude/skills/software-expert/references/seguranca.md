# Segurança de Backend

Um query concatenado ou senha no código já é vazamento. Defesa **em camadas**: código + banco + rede.

## Do inseguro ao seguro

- **Sem segurança**: SQL concatenado (injection) · senha no git · app como root (DROP TABLE) · query lenta = DoS
- **Com segurança**: valida (allow-list) → query parametrizada → banco com menor privilégio · TLS · índices · segredos no .env

## Defesas por camada

**No código**
- **Queries parametrizadas** — a defesa nº 1
- Validação server-side (tipo, tamanho, formato)
- Erros genéricos (não exponha detalhes)
- ORM sem `.raw()`

**No banco**
- **Menor privilégio** — app nunca como root
- Índices (performance + menos superfície de DoS)
- Criptografia em repouso (base + backups)
- Backups encriptados, off-host, com logs

**Rede & segredos**
- Segredos no `.env` [veja Segredos abaixo]
- TLS em trânsito
- Firewall / allowlist de IP no banco
- Rate limit + timeout [veja Rate Limiting abaixo]

## Exemplos

✗ Injeção:
```
db.query("SELECT * FROM users WHERE email = '" + input + "'")
```

✓ Parametrizada (input vira valor, nunca código):
```
db.query("SELECT * FROM users WHERE email = $1", [input])
```

Menor privilégio:
```sql
CREATE USER app_user WITH PASSWORD '****';
GRANT SELECT, INSERT, UPDATE ON app.* TO app_user;
CREATE INDEX idx_users_email ON users(email);
```

## Cuidados

- ⚠ `.env` no git = vazamento clássico
- ⚠ ORM não é bala de prata
- ⚠ Usuário over-privileged = app como root
- ⚠ Validação só no client = burlável

## Ao trabalhar com IA (Claude Code)

Peça explicitamente: queries parametrizadas · credenciais do `.env` · usuário do banco mínimo · índice na coluna de busca.

`.claude/settings.json` (guardrail):
```json
{
  "permissions": {
    "deny": ["Read/.env*", "Read/.secrets/*"],
    "allow": ["Bash(run)", "Bash(git push:*)"]
  }
}
```
Explore schema em plan mode; MCP de banco só com tools read-only [veja MCP em ia-aplicada.md].

# Autenticação x Autorização

- **Autenticação** = quem você é (senha · passkey · MFA · SSO)
- **Autorização** = o que pode fazer (papéis · escopos · políticas)
- Autentica primeiro, autoriza depois. Portaria valida identidade; crachá define onde entra.

## Padrões e tokens

- **OIDC / ID token** — produto da autenticação (quem é)
- **OAuth 2.1 / access token** — produto da autorização (o que pode)
- **FIDO2 / WebAuthn** — base das passkeys
- **SAML 2.0** — SSO corporativo legado
- **MFA** — 2º fator, obrigatório hoje
- **SCIM** — provisiona usuários

**OIDC autentica. OAuth autoriza.**

## Modelos de autorização

| Modelo | Como funciona | Característica |
|---|---|---|
| ACL | lista por recurso | simples, escala mal |
| RBAC | permissões por papel | o padrão mais comum |
| ABAC | atributos + contexto | mais flexível |
| ReBAC | relações e hierarquia | times e multi-tenant |

Granularidade: ACL → RBAC → ABAC → ReBAC.

## Onde quebra

- ✗ Checar só no front → rota aberta → IDOR / acesso indevido
- ✓ Token válido? → este usuário pode acessar ESTE recurso? → só então executa

## Boas práticas

- OIDC para login, OAuth para acesso à API
- **Menor privilégio por padrão**
- **Revalide permissão no servidor, em toda ação**
- **Step-up** (reautenticação) para ações críticas
- Logue quem acessou o quê, quando, por qual política
- **Agentes de IA: identidade própria + escopos limitados** [veja Guardrails em ia-aplicada.md]

⚡ Teste rápido: chame a API com usuário sem permissão. Voltou dado? Autorização é fachada.

# Segredos e o Arquivo .env

Chaves, senhas e config **fora do código**: API keys, senhas de banco, tokens. Mais de 12 milhões de segredos já vazaram em repositórios públicos.

- ✗ `key = "sk_live_9f3..."` no código — vaza no primeiro push
- ✓ `STRIPE_API_KEY=sk_...` no `.env` — app lê a variável
- ☑ Nomeie: SCREAMING_SNAKE + prefixo por serviço (`STRIPE_SECRET_KEY`)
- ☑ Valide no startup: falta variável → app quebra ao SUBIR

## Erros que vazam tudo

1. **Commitar .env no git** — `.gitignore` antes do 1º commit, incluindo `.env.*`, `*.pem`, `*.key`
2. **Chave secreta no front** — prefixo `VITE_` / `NEXT_PUBLIC_` vai para o bundle e é **público**
3. **Vazou e não trocou** — apareceu no git/log/print/prompt de IA? **Rode a chave** (nova + invalida a antiga)
4. **Chave de produção no dev** — local só com chaves de teste/sandbox
5. **Mandar .env no chat** — canal cifrado (1Password, Doppler), nunca WhatsApp/Slack/e-mail

⚠ Apagar num commit novo NÃO resolve — git guarda histórico. Rode a chave.

## Checklist

- ✅ `.env` no `.gitignore` desde o dia 1 + secret scanning (GitLeaks/TruffleHog) no pre-commit
- ✅ Commite `.env.example` vazio (documenta + valida no CI)
- ✅ Segredo só no servidor; no CI/CD use secrets do pipeline
- ✅ Menor privilégio: token read-only quando dá; escopo por ambiente
- ✅ Produção: cofre (Vault, AWS/GCP Secrets Manager, Doppler) — rotação + log

# Rate Limiting

O porteiro: conta requisições por cliente numa **janela de tempo** e rejeita o excedente (**429**). Configure **no dia 1, não sob ataque**.

Protege contra: abuso, brute force, scraping, retry storm, bug que dispara mil chamadas/s, conta de nuvem explodindo.

## Os 4 algoritmos

- **Fixed window** — N por janela fixa (100/min). Simples, mas **furo da borda**: 2x o limite na virada. *Limites internos.*
- **Sliding window** — janela desliza; sem furo, ~99,99% preciso e barato. *Melhor default distribuído.*
- **Token bucket** — fichas entram a taxa fixa; guarda fichas = **tolera rajada**. *Tráfego em picos (o mais usado).*
- **Leaky bucket** — fila que escoa a ritmo fixo; suaviza saída. *Shaping, proteger downstream.*

**Regra prática**: token bucket para picos; sliding window como default. Evite fixed window em endpoint público.

## O difícil: a chave e as camadas

**A chave** (por quem contar):
- Por usuário/API key — o ideal, quando autenticado
- Por IP — tráfego anônimo (cuidado com NAT/proxy)
- Por endpoint — login estrito, leitura generoso

**As camadas** (regras empilhadas):
- Por segundo + minuto + hora ao mesmo tempo
- Global + por IP + por user + por rota; a mais estrita vence

- 🏷 Por tier: anônimo 60/h · free 1k/h · pago 10k/h
- ⚖ Limite ≠ throttle: limite rejeita, throttle atrasa
- Implementação com Redis: INCR + TTL [veja Redis em dados-performance.md]

# Proxy vs VPN

## Proxy (camada de aplicação)

- HTTP/HTTPS; oculta IP só de sites/serviços específicos
- Você → Proxy → Internet
- Usos: filtragem web, cache de conteúdo, controle de acesso

## VPN (camada de rede)

- Oculta IP de todos os sites; todo o tráfego do sistema
- Você → Túnel criptografado → Servidor VPN → Internet
- Usos: privacidade, acesso remoto seguro, restrições geográficas

## Diferenças

| | PROXY | VPN |
|---|---|---|
| Escopo | por aplicação (ex.: só navegador) | todo o tráfego |
| Criptografia | geralmente sem (exceto HTTPS) | todo o tráfego até o servidor |
| IP oculto | só de sites específicos | de todos |
| Velocidade | mais rápido | mais lento (criptografia + roteamento) |
| Casos | scraping, filtragem, cache | privacidade, acesso remoto, geo |

**Resumo**: proxy controla acesso a aplicações específicas; VPN protege todo o tráfego.
