# syntax=docker/dockerfile:1
# Multi-stage build for the ehrbase-ui TanStack Start app.
# docs/architecture.md §18.

ARG NODE_VERSION=24

# ─── deps ─────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.3.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc ./
RUN pnpm install --frozen-lockfile

# ─── builder ──────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.3.0 --activate
COPY --from=deps /app/node_modules ./node_modules
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

# Copy build output + production node_modules.
COPY --from=builder --chown=ehrbase-ui:nodejs /app/.output ./.output
COPY --from=builder --chown=ehrbase-ui:nodejs /app/package.json ./

USER ehrbase-ui
EXPOSE 3000
ENV PORT=3000 HOST=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/ready || exit 1

ENTRYPOINT ["/sbin/tini","--"]
CMD ["node", ".output/server/index.mjs"]
