# syntax=docker/dockerfile:1
# Multi-stage build for the ehrbase-ui TanStack Start app.
# docs/architecture.md §18.

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

# Manifests first for a cacheable install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# Then the source + the production build. TanStack Start's Nitro output in
# .output/ is self-contained (bundles its own runtime deps), so the runner
# stage copies only .output + package.json — no node_modules pruning needed.
COPY . .
RUN pnpm run build

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

# Copy build output + manifest.
COPY --from=builder --chown=ehrbase-ui:nodejs /app/.output ./.output
COPY --from=builder --chown=ehrbase-ui:nodejs /app/package.json ./

USER ehrbase-ui
EXPOSE 3000
ENV PORT=3000 HOST=0.0.0.0

# Probes the root route for now. Switch to /api/ready once that readiness
# endpoint lands in Milestone 7 (it checks Valkey + EHRbase + Keycloak).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/ || exit 1

ENTRYPOINT ["/sbin/tini","--"]
CMD ["node", ".output/server/index.mjs"]
