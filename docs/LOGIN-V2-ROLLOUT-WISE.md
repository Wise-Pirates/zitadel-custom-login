# Login V2 Fork — Rollout Wise Pirates

> Branch: `custom-login` (base: upstream tag `v4.17.3`)
> Instância atual: **v2.63.9** (Railway `zitadel-iam`, Login V1 embedded)
> Estado: **bloqueado até upgrade do backend para v4**

## Porquê

- MFA e outros ecrãs do Login V1 caem no branding default da instância quando o
  orgId não é resolvido (mitigado na app iCS via scope
  `urn:zitadel:iam:org:id:<orgId>` — PR Wise-Pirates/Control-Safe-iCS#8).
- O fork (Next.js, MIT) dá controlo total: MFA whitelabeled por código,
  onboarding screens integradas no fluxo de auth, e futuro upgrade forçado
  (V1 é legacy, V2 é default desde v4).
- **Um fork serve a instância inteira** — cutover é **por aplicação**
  (Console → app → "Use new login UI"), sem mexer código nas apps dos colegas.
- Branding por org continua a vir do label policy da consola; o fork só é
  necessário para o que a consola não cobre.

## Pré-requisito bloqueante: upgrade v2.63.9 → v4

A Zitadel não suporta Login V2 como cutover em v2/v3. Caminho:

1. Estudar guias oficiais: upgrade v2 → v3 → v4 (ler notas de breaking
   changes de cada major; provavelmente sequencial).
2. Backup da BD (snapshot Railway/Postgres) + testar restore.
3. Repetir upgrade num ambiente de staging (cópia da BD).
4. Manutenção com janela acordada; atualizar imagem por etapas e correr
   `zitadel setup` entre majors conforme docs.
5. Validar: console OK, todos os logins das 6 orgs OK, iCS/ClínicaTear OK.

⚠️ Antes de qualquer cutover de login: criar **machine user break-glass com
`IAM_OWNER` + PAT** para reverter o feature flag se o login V2 falhar
(ver `break-glass-zitadel.md`).

## Deploy do fork (depois do backend em v4)

1. Railway → projeto `zitadel-iam` → novo serviço `zitadel-login`:
   - Repo: `Wise-Pirates/zitadel`, branch `custom-login`
   - Dockerfile: `Dockerfile.login` (contexto = raiz do monorepo)
   - Env vars:
     - `ZITADEL_API_URL=https://zitadel-production-22ac.up.railway.app`
       (sem trailing slash)
     - `ZITADEL_SERVICE_USER_TOKEN=<PAT>` — machine user com role
       `IAM_LOGIN_CLIENT` (criar no console, step-by-step: docs "Create a
       Login Client")
     - `NEXT_PUBLIC_BASE_PATH=/ui/v2/login`
2. Routing: Railway proxy/reverse proxy — `/ui/v2/login` → serviço
   `zitadel-login`; resto → API Zitadel. (Avaliar se o Railway precisa de
   serviço nginx à frente ou se se pode servir num domínio separado, ex.
   `login.wisepirates...`, com o base URI configurado na app.)
3. Smoke test (feature OFF): abrir `https://<host>/ui/v2/login` e verificar
   readiness + render.

## Cutover gradual (recomendado)

1. Console → aplicação **iCS Inventário** → ativar "Use new login UI"
   (opcional: base URL custom do fork).
2. Testar: password, MFA/TOTP, passkey, IdP externos (Google), reset de
   password, logout, registo.
3. Callbacks IdP: atualizar redirect URLs para os paths V2 se aplicável.
4. Repetir por app, org a org, ao ritmo da equipa. Apps já OIDC não mudam
   código.
5. Rollback por app: desligar o toggle. Rollback global: break-glass PAT.

## Customizações Wise no fork

- Mapa `orgId → tema` em código para clientes enterprise (quando o label
  policy não chega, ex.: MFA sem orgId).
- Screens de onboarding (Next.js) integradas pós-first-login.
- Regra de manutenção: upstream sync regular contra tags oficiais;
  imagem com tag imutável `v<upstream>-wp.<n>`; nunca `latest`.

## Referências

- Fork guide: zitadel.com/docs/guides/integrate/login-ui/fork-and-deploy-login-app
- Adoção V2: zitadel.com/docs/self-hosting/manage/adopt-login-v2
- Playbook offboarding: Wise-Pirates-zitadel-railway/playbook-offboarding-zitadel.md
