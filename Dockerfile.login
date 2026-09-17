# Multi-stage build for the forked Zitadel Login UI (apps/login) — Railway-ready.
# Context: repository root (monorepo). Deploy when the backend is on Zitadel v4.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
ENV NEXT_PUBLIC_BASE_PATH="/ui/v2/login" \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm install --frozen-lockfile
RUN pnpm nx run @zitadel/login:build

FROM node:24-alpine
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
RUN mkdir -p /.env-file && touch /.env-file/.env && chown -R nextjs:nodejs /.env-file
COPY --chown=nextjs:nodejs --from=build /repo/apps/login/.next/standalone ./
USER nextjs
ENV HOSTNAME="::" \
    PORT="3000" \
    NODE_ENV="production" \
    NODE_OPTIONS="--use-openssl-ca --require /app/load-ssl-cert-dir.cjs" \
    SSL_CERT_FILE="/etc/ssl/certs/ca-certificates.crt" \
    ZITADEL_TLS_ENABLED="false" \
    NEXT_PUBLIC_BASE_PATH="/ui/v2/login" \
    OTEL_SERVICE_NAME="zitadel-login" \
    OTEL_EXPORTER_OTLP_PROTOCOL="http/protobuf"
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD ["/usr/local/bin/node", "/app/healthcheck.mjs", "/ui/v2/login/ready"]
ENTRYPOINT ["/app/entrypoint.sh", "node", "apps/login/server.js"]
