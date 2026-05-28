# ADR-0026 — Scheduling pattern: Nitro scheduled tasks + Valkey leader-elect lock

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

M4 introduces two recurring server-side jobs that need to run on a fixed cadence:

- `audit:integrity` — runs `verifyAuditChain()` nightly and alerts the DPO on a chain break (architecture.md §14.5).
- `audit:purge` — archives + deletes audit events past their per-policy retention (§14.7).

Two open questions: what scheduler runs them, and how do we keep them safe in multi-instance deployments where the same cron expression fires on every replica?

Options considered:

- **`node-cron`.** Light, well-known. But it requires us to bolt scheduling onto the running app, write our own once-per-cluster guard, and own the manual-trigger surface.
- **A separate scheduler container (Kubernetes CronJob, systemd timer).** Cleanest separation of concerns, but adds an ops dependency outside the Docker-compose dev default and forces the job to run in a context that doesn't share the app's import graph (we'd duplicate the Valkey / Drizzle bootstrap).
- **Nitro's native scheduled tasks** (`scheduledTasks` config on the Nitro Vite plugin, `defineTask` files under `tasks/`, https://nitro.build/docs/tasks#scheduled-tasks). Nitro is already in our dep tree because TanStack Start uses it as its server runtime — adding `node-cron` would mean two cron implementations in the same process. Nitro tasks share the app's import graph, get a `/_nitro/tasks/:name` HTTP endpoint for manual triggering, and Nitro's built-in once-running guard covers the **single-process** case.
- **Multi-instance guard.** Nitro's once-running guard is per-process; it does not coordinate across replicas. We layer a Valkey `SET <key> <token> NX EX <ttl>` lock around the task body so the first replica to acquire the lock runs; the others log and skip.

## Decision

**Use Nitro's native scheduled tasks for `audit:integrity` and `audit:purge`. Wrap each task body in a Valkey leader-elect lock for multi-instance safety. Do not add `node-cron` (Nitro already bundles `croner` under the hood and supports cron expressions natively).**

**Task files** live under `tasks/<group>/<name>.ts`:

- `tasks/audit/integrity.ts` — exports `default defineTask({ meta: { name: 'audit:integrity', description: '…' }, async run() { … } })`. Calls into `src/lib/audit/integrity-job.server.ts`.
- `tasks/audit/purge.ts` — wraps `src/lib/audit/retention.server.ts::purgeExpiredAuditEvents()`.

**Cron expressions** are registered in `vite.config.ts` via the `scheduledTasks` option on the Nitro plugin, env-overridable:

```ts
nitro({
  scheduledTasks: {
    [process.env.AUDIT_INTEGRITY_CRON ?? '0 3 * * *']: ['audit:integrity'],
    [process.env.AUDIT_PURGE_CRON ?? '0 4 * * *']: ['audit:purge'],
  },
})
```

**Multi-instance lock** — `src/lib/audit/task-lock.server.ts` exposes `withTaskLock(name, ttlSeconds, fn)`:

- `SET audit:task:<name> <random-token> NX EX <ttl>` — atomic acquire.
- On success, run `fn`. On `fn` settle (success or failure), release the lock with a Lua script that deletes the key **only if it still holds our token** (so a long-running job whose lock expired doesn't accidentally delete a successor's lock).
- On acquire-failure, log and return without running. Another replica is the leader for this firing.
- TTL is set to job-timeout × 1.5 — long enough to survive normal completion, short enough that a wedged replica's lock self-clears before the next nightly firing.

**Manual trigger** — Nitro's `/_nitro/tasks/:name` endpoint is **dev-server-only** (per the Nitro docs); it does not exist in production builds. Instead we ship a first-class `POST /api/admin/audit/tasks/:name` route at `src/routes/api/admin/audit/tasks/$.ts` that wraps `runTask()` from `nitro/task`. The route requires the `audit-reviewer` role, Origin-checks, takes a single-use CSRF token, restricts the `:name` parameter to the M4-allowed task names only (never expose generic `runTask()` to network traffic), and emits an `ADMIN_CHANGE` audit event so the sample-of-60 review (§14.13) sees who fired what.

**Kill switch** — `AUDIT_TASKS_DISABLED=true` env reads at the top of each task body; when set, the task logs "kill-switch on, skipping" and returns. Used to disarm scheduled writes during an incident without redeploying.

**Nitro features deliberately NOT used in M4** — to keep the M2 stack coherent:

- `useStorage` (Nitro's storage abstraction). We already use `src/lib/valkey.server.ts` (raw `ioredis`) for sessions, audit chain head, CSRF tokens, and rate-limit counters. Introducing a second Valkey access pattern only for the task lock would fragment the M2 code. The lock helper uses `ioredis` directly.
- `defineCachedFunction` / `defineCachedEventHandler`. Audit-log data must be fresh — staleness is a clinical-safety hazard.
- `useDatabase` (Nitro's DB layer). We use Drizzle against Postgres per ADR-0012.

## Consequences

**Positive.** No new dep (Nitro is already pinned). Tasks share the app's import graph (Drizzle, ioredis, Pino, request-context primitives). Cron expressions live next to the plugin config in `vite.config.ts` so the schedule is auditable in code review. The manual-trigger HTTP endpoint comes for free.

**Negative.** Nitro tasks run inside the app process — a runaway task can starve request handling. Mitigation: the lock TTL bounds the worst-case duration; for the purge job we keep batch size bounded; for the integrity job the verifier already runs in a single Drizzle round-trip with a small in-memory walk. If we ever need genuine isolation (a separate process) the same `tasks/` files would lift cleanly into a separate Nitro entry — the abstraction doesn't change.

**Tradeoff vs. a separate scheduler container.** A Kubernetes-native deployment can layer a CronJob on top of `runTask()` if it wants the isolation; the `tasks/` files don't care. This ADR commits us to the in-process default; deployments that want the isolated-process variant document it in their deployment runbook without changing code.

## Verification

- The `tasks/audit/*.ts` files compile and `pnpm typecheck` passes — Nitro `defineTask` types are picked up from the dep tree.
- `pnpm build` emits the task entry-points in `.output/server/tasks/`.
- Two-instance smoke (M4 verification §5): bring up two app instances against the same Valkey; trigger the integrity task; exactly one reports running.
- `AUDIT_TASKS_DISABLED=true` causes both tasks to log "kill-switch on, skipping" and return without doing work.
