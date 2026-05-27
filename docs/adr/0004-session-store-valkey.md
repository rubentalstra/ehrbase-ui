# ADR-0004 — Session store: Valkey, not iron-session

- **Status:** Accepted
- **Date:** 2026-05-27
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

Architecture-doc reference: §5.3. Ratified during Milestone 2.

A clinical app needs **immediate** server-side session revocation (logout,
break-glass ceiling, idle/absolute timeout). Encrypted-cookie sessions
(iron-session) cannot be revoked before they expire — the token lives in the
browser. The audit hash chain (§14.5) and the rate limiter (§5.9) already
require a fast key-value store.

## Decision

Use Valkey from day one as the server-side session store, via `ioredis`
(wire-compatible). One Valkey instance backs: sessions (`sess:*`), the audit
chain head (`audit:lastHash`), the rate-limit windows (`rl:*`), the per-form
CSRF tokens (`csrf:*`), and break-glass grants (`breakglass:*`).

Sessions carry two timeout anchors (`createdAt`, `lastSeenAt`) enforced by
`requireAuth` — idle 15 min, absolute 12 h (§5.10) — and an 8 h sliding Valkey
TTL so abandoned sessions are reaped.

## Consequences

**Positive:** instant revocation; one store for all ephemeral server state;
sub-millisecond reads on the auth hot path. **Negative:** the app is now
stateful and Valkey is a hard dependency (the client refuses to start without
`VALKEY_URL`). Accepted — it was already required for the audit chain.
