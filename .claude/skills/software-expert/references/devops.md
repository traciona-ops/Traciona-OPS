# Do Protótipo à Produção — DevOps & QA

App "vibe-coded" roda na demo. **Produção é engenharia**: processo, portões, observabilidade.

- **Protótipo**: código → deploy → 💥 prod (zero portões: sem review, teste, rollback)
- **Produção**: código → review + CI → testes QA → deploy → monitor

## O pipeline

Cada etapa é um **portão** — falhou num check, não avança:

```
PRD → código → Pull Request → CI (verde ✓) → staging → deploy prod → observabilidade
                 (falhou? volta pro dev)
```

## As 4 disciplinas

**① Planejar** — PRD claro · critérios de aceite · ADR (Architecture Decision Records)

**② Revisar** — PR pequeno · branch protegida · lint + format

**③ Testar · QA** — pirâmide: muitos unit, alguns integração, poucos e2e · coverage · smoke test em staging (com dados realistas — [veja N+1 em dados-performance.md])

**④ Entregar · Operar** — CI/CD · dev → staging → prod · rollback · secrets [veja Segredos em seguranca.md] · IaC · observability + backup

## Cada etapa com IA (Claude Code)

- ✳ PRD — escreve PRD e critérios de aceite
- ✳ Review — subagente revisor só-leitura audita o diff [veja Subagentes em ia-aplicada.md]
- ✳ QA — gera testes unit/integração/e2e
- ✳ CI/CD — monta pipeline: lint, testes, build, deploy com rollback
- ✳ Segurança — auditoria: RLS, segredos no .env, rota sem login
- 🗺 Plan mode primeiro · 🧩 uma frente por vez

A IA escreveu rápido; agora deixe a IA te auditar devagar.

# Infraestrutura — VPS ou Vercel

## Os dois modelos

- **VPS**: fatia isolada de servidor físico com acesso root — você controla 100%. Alugar → instalar → Nginx + SSL → deploy → monitorar.
- **Vercel (PaaS/serverless)**: plataforma esconde o servidor. git push → build + deploy + CDN + escala.

## Quem cuida de quê

| Responsabilidade | VPS | Vercel |
|---|---|---|
| OS & patches | você | gerenciado |
| Deploy & build | você configura (CI, scripts) | git push automático |
| Escalabilidade | manual | automática |
| HTTPS / SSL / CDN | você (Certbot, Nginx) | incluso + edge global |
| Segurança & firewall | por sua conta | plataforma + você |
| Backup & monitoramento | você monta | parcial / add-ons |

## Trade-offs

**VPS** — ✓ controle total (root, qualquer stack) · processos persistentes (WebSocket, filas, cron) · custo fixo previsível, barato em escala · sem lock-in. ✗ você administra tudo · exige DevOps · escala manual · erro de config vira brecha.

**Vercel** — ✓ deploy em segundos · zero infra · escala automática + CDN/edge · HTTPS, CI, preview deploys · imbatível para front/Next.js. ✗ custo dispara com tráfego · lock-in · timeout de função, sem processo longo · cold start.

## Como decidir

- **VPS se**: backend pesado, banco próprio, jobs · WebSocket/cron/processo sempre ligado · custo previsível 24/7 · sem lock-in
- **Vercel se**: front-end / Next.js + APIs leves · time pequeno sem infra · velocidade e escala sem gerenciar · tráfego variável, começar de graça

## Custo

- **VPS**: US$ 4–40/mês fixo; paga o mesmo com 10 ou 10 mil acessos (paga até ocioso)
- **Vercel**: grátis no início; cobra banda e execuções — pode explodir se viralizar

## Stack típica

- **VPS**: Ubuntu · Nginx · Docker · PM2/systemd · PostgreSQL · Certbot · Hetzner · DigitalOcean · Contabo
- **Vercel & similares**: Next.js · Serverless/Edge · Vercel Postgres/KV · Netlify · Cloudflare Pages · Railway · Render · Fly.io

# Cheat Sheet — Comandos Diários de DevOps

## Linux

```
ls -lah                  # lista arquivos (detalhes)
cd /path/to/dir          # muda diretório
pwd                      # diretório atual
cat file.txt             # conteúdo do arquivo
less file.txt            # visualiza com rolagem
cp src dest              # copia
mv src dest              # move/renomeia
rm -rf dir               # remove diretório
df -h                    # uso de disco
du -sh *                 # tamanho da pasta
top / htop               # processos
grep "text" file         # busca texto
chmod 755 file           # permissões
chown user:group file    # proprietário
```

## Git

```
git status
git add .
git commit -m "msg"
git push origin branch
git pull origin branch
git checkout branch
git branch / git branch -d branch
git log --oneline --graph
git stash / git stash pop
git merge branch
git rebase branch
git tag -a v1.0 -m "msg" ; git push --tags
```

## Docker

```
docker ps / docker ps -a
docker images
docker pull image:tag
docker build -t app:tag .
docker run -d --name c1 -p 8080:8080 app:tag
docker logs -f c1
docker exec -it c1 sh
docker stop c1 / docker rm c1
docker rmi image:tag
docker system prune -a
```

## Kubernetes (kubectl)

```
kubectl get nodes
kubectl get pods -A / get svc -A / get deploy -A
kubectl describe pod <pod>
kubectl logs -f <pod>
kubectl exec -it <pod> -- sh
kubectl apply -f file.yaml / delete -f file.yaml
kubectl rollout status deploy/<name>
kubectl scale deploy/<name> --replicas=3
```

## AWS CLI

```
aws configure
aws s3 ls / aws s3 cp file s3://bucket/ / aws s3 sync . s3://bucket/
aws ec2 describe-instances
aws ec2 start-instances --instance-ids i-123
aws ec2 stop-instances --instance-ids i-123
aws iam list-users
aws cloudwatch get-metric-statistics --namespace AWS/EC2 \
  --metric-name CPUUtilization --start-time <start> \
  --end-time <end> --period 300 --statistics Average
```

## Terraform

```
terraform init / plan / apply / destroy
terraform fmt / validate
terraform show / output
```

## CI/CD

```
jenkins-cli -s http://jenkins/ build job-name
jenkins-cli -s http://jenkins/ list-jobs
curl --header "PRIVATE-TOKEN: <token>" \
  "https://gitlab.com/api/v4/projects/<id>/pipelines"
curl -I https://your-app-url     # app no ar?
```

## Monitoramento e logs

```
journalctl -u service -f
tail -f /var/log/syslog
docker logs -f container_name
kubectl logs -f <pod> -c <container>
aws cloudwatch logs tail /aws/lambda/fn-name --follow
```

## Rede

```
ping google.com
curl -I https://example.com
nslookup example.com
netstat -tulnp / ss -tulnp
```

## Transferência de arquivos

```
scp file user@host:/path
scp user@host:/path/file .
rsync -avz src/ user@host:/dest/
```

## Manutenção do sistema

```
systemctl status service / restart service / enable service
free -h
uname -a
```

## One-liners

```
find / -type f -size +100M
grep -rnw . "text"
ps -eo pid,ppid,cmd,%mem,%cpu --sort=-%mem | head
docker system prune -af
```

## Fluxo diário típico

CÓDIGO (`git pull`) → BUILD (`docker build -t app:latest .`) → PUSH (`docker push app:latest`) → DEPLOY (`kubectl apply -f k8s/`) → VERIFICAR (`kubectl get pods` / `kubectl logs -f <pod>`) → MONITORAR.

**Automatize tudo. Documente tudo. O que é repetível é escalável.**
