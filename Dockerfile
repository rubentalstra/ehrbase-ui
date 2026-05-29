# syntax=docker/dockerfile:1
# Multi-stage build for the ehrbase-ui TanStack Start app.
# docs/architecture.md §18; monorepo layout per ADR-0030.

ARG NODE_VERSION=24

# ─── builder ──────────────────────────────────────────────────────────────
# CI=true makes pnpm non-interactive: its pre-run deps-status-check won't try
# to interactively purge node_modules (which aborts in a TTY-less Docker
# build with ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY). Install happens in
# this same stage with the source present, so the state the build step sees
# is already consistent.
FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app
ENV CI=true
RUN corepack enable && corepack prepare pnpm@11.3.0 --activate

# Manifests first for a cacheable install layer. In the monorepo every
# package.json is needed for the workspace graph to resolve correctly —
# COPY pulls them all in, plus pnpm-lock.yaml + pnpm-workspace.yaml.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages ./packages
RUN pnpm install --frozen-lockfile

# Then the rest of the source + the production build. TanStack Start's
# Nitro output lands at apps/web/.output/ and is self-contained (bundles
# its own runtime deps), so the runner stage copies only that + the app
# manifest — no node_modules pruning needed.
COPY . .
RUN pnpm run build

# ─── migrator ─────────────────────────────────────────────────────────────
# Lightweight stage that reuses the builder's installed deps + source so a
# compose-side one-shot service can run the drizzle-kit migrations against
# the platform Postgres before the ui starts. Keeps the runner image lean
# (the runner has neither pnpm nor the drizzle source, by design — only the
# Nitro bundle).
FROM builder AS migrator
WORKDIR /app/apps/web
# Both migrations run sequentially; either failing aborts the up.
CMD ["sh", "-c", "pnpm run db:migrate && pnpm run db:auth:migrate"]

# ─── runner ───────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# tini for proper signal forwarding to Node; curl for the readiness check.
RUN apk add --no-cache curl tini && \
    addgroup -S -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs ehrbase-ui

# Pre-create the audit-log mount point owned by the app user. The audit_logs
# named volume mounts here; an empty named volume inherits the ownership of the
# image directory it covers, so this is what makes the volume writable by the
# non-root ehrbase-ui user (otherwise Docker creates it root-owned → EACCES on
# the NDJSON audit sink). docs/architecture.md §14.3.
RUN mkdir -p /var/log/ehrbase-ui && chown -R ehrbase-ui:nodejs /var/log/ehrbase-ui

# Copy the Nitro build output + app manifest. Both live under apps/web/ in
# the monorepo layout (ADR-0030).
COPY --from=builder --chown=ehrbase-ui:nodejs /app/apps/web/.output ./.output
COPY --from=builder --chown=ehrbase-ui:nodejs /app/apps/web/package.json ./

USER ehrbase-ui
EXPOSE 3000
ENV PORT=3000 HOST=0.0.0.0

# Probes the root route for now. Switch to /api/ready once that readiness
# endpoint lands in Milestone 5 (it checks Valkey + EHRbase + Keycloak).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/ || exit 1

ENTRYPOINT ["/sbin/tini","--"]
CMD ["node", ".output/server/index.mjs"]
