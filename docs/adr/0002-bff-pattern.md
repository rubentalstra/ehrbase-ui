# ADR-0002 — BFF pattern (Keycloak inside the TanStack Start process)

- **Status:** Accepted
- **Date:** 2026-05-27
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

Architecture-doc reference: §5. Ratified during Milestone 2 (the auth + BFF +
audit-write milestone).

Browser-held OAuth tokens are unacceptable for clinical data: an XSS or a
malicious extension can exfiltrate a token and impersonate a clinician against
EHRbase. The OWASP guidance for SPAs handling sensitive data is the
Backend-for-Frontend pattern.

## Decision

The TanStack Start server process is the OAuth confidential client. The full
Authorization-Code + PKCE flow runs server-side (`arctic`); access/refresh/id
tokens never leave the server — they live in Valkey keyed by an opaque session
id (ADR-0004). The browser holds only an `httpOnly`, `Secure` (prod),
`SameSite=Lax` cookie carrying that id.

Every call to EHRbase flows through a single authenticated, rate-limited,
audited choke point — the BFF proxy at `src/routes/api/ehrbase/$.ts` — which
attaches the bearer token server-side, classifies the request for §5.9 rate
limiting, audits the PHI access (§14.3), and conflates 404/403 (§10).

## Consequences

**Positive:** Tokens are unreachable from the browser; sessions are revocable
instantly (delete one Valkey key); one place enforces auth, rate limits, audit,
and error conflation. **Negative:** the server is now stateful (needs Valkey)
and is on the hot path for every upstream call. Both are accepted — Valkey is
already required for the audit chain head, and the proxy latency budget is
dominated by EHRbase, not by sub-millisecond Valkey checks.
