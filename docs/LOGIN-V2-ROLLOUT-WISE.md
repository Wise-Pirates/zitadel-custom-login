# Custom Login (Login V2 Fork) — Rollout Wise Pirates

> Repo: `Wise-Pirates/zitadel-custom-login` (fork de `zitadel/zitadel`)
> Branch de trabalho: `custom-login` (base: upstream tag `v4.17.3`)
> Instância atual: **v2.63.9** (Railway `zitadel-iam`, Login V1 embedded)
> Serviço Railway criado: **`zitadel-login`** no projeto `zitadel-iam`
> (a build corre, mas o cutover está bloqueado até o backend estar em v4)

## Porquê

- No Login V1, os ecrãs de MFA caem no branding default da instância quando o
  orgId não é resolvido naquele passo (CSS dinâmico com `default-policy=true`).
- **Mitigação já confirmada em produção (Clínica Tear, código da Nathielle)**:
  scope `urn:zitadel:iam:org:id:<orgId>` no authorization request do provider
  NextAuth pin-a cada login à org certa, saltando o domain discovery.
  Confirmado live a 26/08/2026 — sem ele vê-se o branding WisePirates/generic.
  Replicado no iCS Inventário: Control-Safe-iCS PR #8 (merged → staging).
- O fork (Next.js, MIT) dá controlo total para o que a consola não cobre:
  MFA whitelabeled por código, onboarding screens (já temos em Next.js)
  integradas no fluxo de auth, mapa `orgId → tema` para clientes enterprise.
- Futuro: V1 é legacy, V2 é default desde v4 — upgrade forçado mais cedo ou
  mais tarde; melhor controlado agora.

## ⚠️ PRE-REQUISITO BLOQUEANTE: upgrade do backend v2.63.9 → v4 (Robson)

A Zitadel não suporta cutover para Login V2 em v2/v3 ("If you are still on
v3, upgrade to v4 first"). Ação: **notificar e pedir ao Robson**.

Plano do upgrade:

1. Guias oficiais: v2 → v3 → v4, provavelmente sequencial; ler as breaking
   changes de cada major.
2. Backup da BD (snapshot Postgres Railway) + testar restore **antes**.
3. Ensaiar num staging (cópia da BD) primeiro.
4. Janela de manutenção acordada; `zitadel setup` entre majors conforme docs.
5. Validar: console OK, login funcional nas 6 orgs, iCS + ClínicaTear OK.

### NOTAS CRÍTICAS A TER EM CONTA NO UPGRADE / PRÉ-CUTOVER

- **Break-glass machine user**: antes de qualquer cutover de login, criar um
  machine user com `IAM_OWNER` + PAT e guardá-lo no cofre (ver
  `Wise-Pirates-zitadel-railway` → break-glass doc). Se o Login V2 ficar
  mal configurado e bloquear o acesso interativo, é este PAT que reverte o
  feature flag. Sem isto, lockout é real.
- **Routing**: `/ui/v2/login` tem de chegar ao serviço `zitadel-login` e o
  resto à API Zitadel. No Railway, avaliar: (a) nginx/proxy à frente com as
  duas rotas, ou (b) domínio separado (ex. `login-<algo>.up.railway.app`) com
  base URI configurado por app no console. Decidir durante o upgrade, antes
  do smoke test.

## Estado do serviço `zitadel-login` (Railway, ambiente production)

- Repo: `Wise-Pirates/zitadel-custom-login`, branch `custom-login`
- Dockerfile: `Dockerfile.login` (raiz do monorepo; set via
  `RAILWAY_DOCKERFILE_PATH`)
- Env vars já configuradas:
  - `ZITADEL_API_URL=https://zitadel-production-22ac.up.railway.app`
  - `NEXT_PUBLIC_BASE_PATH=/ui/v2/login`
  - `ZITADEL_SERVICE_USER_TOKEN=PENDING-machine-user-IAM_LOGIN_CLIENT`
    ⚠️ **placeholder** — criar machine user "login-client" no console Zitadel
    com role Instance Login Client (`IAM_LOGIN_CLIENT`), gerar PAT, substituir
    a variável. (Guia oficial: "Create a Login Client".)

## Sequência pós-upgrade (cutover)

1. Substituir o PAT placeholder e confirmar deploy verde
   (healthcheck `/ui/v2/login/ready`).
2. Smoke test com feature OFF: abrir `https://<host>/ui/v2/login`.
3. Cutover **por aplicação**: Console → app **iCS Inventário** →
   "Use new login UI" (+ base URL do fork se domínio separado).
4. Testar no iCS: password, MFA/TOTP, passkey, Google, reset password,
   registo, logout, mobile.
5. Callbacks de IdP externos (Google): atualizar redirect URLs para paths V2
   se aplicável.
6. Repetir por app/org ao ritmo da equipa — apps OIDC não mudam código.
7. Rollback por app: desligar o toggle. Rollback global: break-glass PAT.

## Customizações Wise no fork

- Mapa `orgId → tema` em código para clientes enterprise (onde o label policy
  da consola não chega).
- Screens de onboarding integradas pós-first-login.
- Manutenção: upstream sync regular contra tags; imagem com tag imutável
  `v<upstream>-wp.<n>`; nunca `latest` em produção.

## Referências

- Fork guide: zitadel.com/docs/guides/integrate/login-ui/fork-and-deploy-login-app
- Adoção V2: zitadel.com/docs/self-hosting/manage/adopt-login-v2
- Evidência Clínica Tear: Clinica-Tear-App-Cliente/src/lib/auth.ts +
  docs/auth-zitadel-plano-2026-08-25.md
