# Runbook — Audit-log integrity check

> Architecture-doc cross-references: [`architecture.md §14.5`](../architecture.md#145-tamper-evidence--hash-chain), [`§14.6`](../architecture.md#146-storage-architecture), [`§14.13`](../architecture.md#1413-audit-log-review-dashboard); [`ADR-0013`](../adr/0013-audit-db-append-only.md) (append-only DB).
>
> This runbook covers the **manual** integrity check (on-demand by an `audit-reviewer` or by the DPO during an incident) and the **interpretation** of a failed nightly job. The nightly job itself ships in M4 — when M4 is shipped, the cron-driven path runs automatically.

---

## What this checks

Two distinct integrity properties.

| Property              | Failure mode                                                                                 | What proves the failure                                                       |
| --------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Content integrity** | A single row's `hash` does not match `SHA-256(canonicalize(row-without-hash, previousHash))` | The verifier computed-vs-recorded hash diff is non-empty for at least one row |
| **Link integrity**    | A row's `previousHash` does not match the previous row's `hash` (chain broken)               | The verifier reports a link break between event N and event N+1               |

Either failure means an event was inserted, edited, deleted, or the canonical-JSON encoding changed without a coordinated rehash. The hash chain ([`§14.5`](../architecture.md#145-tamper-evidence--hash-chain)) is the second of two layers — the first is the append-only enforcement at the storage layer ([`ADR-0013`](../adr/0013-audit-db-append-only.md)). Both layers failing simultaneously means something bypassed the application entirely (e.g. raw file-level edits during a restore).

---

## When to run

| Trigger                                                         | Severity                           | Who runs it                  |
| --------------------------------------------------------------- | ---------------------------------- | ---------------------------- |
| Nightly cron `audit:integrity` (M4)                             | Routine                            | Automatic — alert on failure |
| Manual on incident (breach-response §3 step 4 query 7)          | Active investigation               | On-call / DPO                |
| Pre-restore from backup                                         | Confirms restore matched live      | Restore operator             |
| Quarterly sample-of-60 review prep                              | Routine prep before the M15 review | Audit reviewer               |
| `[Deployment-specific: regulator request, M&A diligence, etc.]` | —                                  | —                            |

---

## Pre-conditions

- You are operating under a role with `audit-reviewer` privileges, OR have direct DB access via the `audit_owner` role for the offline path below.
- The application is running (online path) or you have a recent `pg_dump` snapshot of the `audit` schema (offline path).
- The `AUDIT_PSEUDONYM_SECRET` is **not** needed for integrity verification (the hash chain is computed over the pseudonymised-already canonical form).

---

## Online path — manual trigger via the application

When M4 lands, the Nitro task `audit:integrity` can be triggered manually on a running instance:

```bash
# Authenticated as audit-reviewer, with a CSRF token issued for the call
curl -X POST 'https://<deployment>/_nitro/tasks/audit:integrity' \
  -H 'Cookie: <session cookie>' \
  -H 'X-CSRF-Token: <token>'
```

Until M4 ships, the manual path is to exec into the app container and run the verifier directly:

```bash
docker compose exec app pnpm tsx src/lib/audit/integrity.server.ts
```

Expected good output (shape — actual report extends this):

```json
{
  "ok": true,
  "events": 12453,
  "head": "8c4f...3a21",
  "from": "2026-01-01T00:00:00Z",
  "to": "2026-05-28T13:45:12Z"
}
```

Failure shape (one example — the verifier may surface more detail):

```json
{
  "ok": false,
  "failure": "content",
  "eventId": "9f72...c1d8",
  "expectedHash": "3a2b...",
  "actualHash": "8c4f...",
  "from": "2026-01-01T00:00:00Z",
  "to": "2026-05-28T13:45:12Z"
}
```

```json
{
  "ok": false,
  "failure": "link",
  "between": ["9f72...c1d8", "a13c...77ee"],
  "expectedPrev": "3a2b...",
  "actualPrev": "deadbeef..."
}
```

If `ok: false`, jump to §"Interpreting a failure" below — do not retry the job, the failure is the signal.

---

## Offline path — running the verifier against a snapshot

For a snapshot taken under the breach-response runbook (step 3) or for a pre-restore comparison:

1. Spin up a throwaway Postgres alongside the breach evidence bundle:
   ```bash
   docker run --rm -d --name audit-replay -e POSTGRES_PASSWORD=replay -p 55432:5432 postgres:18.4-alpine
   ```
2. Restore the audit schema:
   ```bash
   PGPASSWORD=replay psql -h localhost -p 55432 -U postgres -c 'CREATE DATABASE audit_replay'
   PGPASSWORD=replay psql -h localhost -p 55432 -U postgres -d audit_replay -f breach-<id>-audit-<timestamp>.sql
   ```
3. Run the verifier against this replay DB (set `AUDIT_DB_URL` to point at it):
   ```bash
   AUDIT_DB_URL='postgres://postgres:replay@localhost:55432/audit_replay' pnpm tsx src/lib/audit/integrity.server.ts
   ```
4. Capture the verifier output; tear down the replay DB.

---

## Interpreting a failure

### Failure type "content"

A single row's `hash` no longer matches its content. **The row was mutated** (or the canonical-JSON serialisation changed without a coordinated rehash). The verifier names the row by `eventId`.

| Likely cause                           | Confirm with                                                                                          | What to do                                                                                                                                                                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage-layer corruption (rare)        | Compare to the most recent backup of the same row                                                     | Restore the row from backup; investigate the storage stack                                                                                                                                                                                                 |
| Backup-restore inconsistency           | Diff against the source DB                                                                            | Use the source's row; investigate the restore process                                                                                                                                                                                                      |
| Code change altered the canonical form | `git log` on `src/lib/audit/hash-chain.server.ts` + verifier code; check for `canonicalize()` changes | If the change was intentional and the codebase rehashed the chain, the failure is expected and the verifier needs to know the cutoff — open a P0 ticket. If the change was unintentional, revert + re-deploy + restart the chain (irreversible — escalate) |
| Direct DB tamper                       | Compare to backup; the storage-layer audit (DB role grants) shouldn't permit this — check the trigger | Treat as a confirmed integrity breach — escalate to DPO per [`./breach-response.md`](./breach-response.md)                                                                                                                                                 |

### Failure type "link"

Two consecutive rows N and N+1 break the chain — row N+1's `previousHash` ≠ row N's `hash`. **Either row N was mutated** (which would also show up as a "content" failure on N), **or row N+1 was inserted out of order** (audit DB writes happen with append-only enforcement, so this should be impossible — confirm trigger is still installed), **or a row between N and N+1 was deleted** (also blocked by the trigger — confirm).

| Likely cause                                | Confirm with                                                 | What to do                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Restored audit DB lost the head hash        | Compare `audit:lastHash` in Valkey to the latest row's hash  | If Valkey lost state and a restored DB is correct, re-seed `audit:lastHash` from the latest row before resuming writes   |
| Concurrent writes raced on `audit:lastHash` | Look at timestamps + correlation IDs                         | This indicates a bug in the M2 `logAudit()` lock pattern — open a P0 ticket; do not paper over by rehashing the chain    |
| Append-only trigger missing or bypassed     | `SELECT * FROM pg_trigger WHERE tgname LIKE 'audit_events%'` | Restore the trigger; treat as a confirmed integrity breach — escalate per [`./breach-response.md`](./breach-response.md) |

### Both content and link failing

Almost certainly **deliberate tampering** — the actor edited a row and either missed rehashing the chain or didn't have the secret to rehash convincingly. **Treat as a confirmed integrity breach** and follow [`./breach-response.md`](./breach-response.md) from Step 1.

---

## Escalation

| Severity  | When                                                                                             | Action                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **SEV-1** | Confirmed integrity breach (deliberate tamper); chain break of unknown cause within the last 24h | Page DPO + CISO immediately. Freeze writes (`BFF_READ_ONLY=true` or equivalent) until the cause is identified. Open the breach-response runbook. |
| **SEV-2** | Chain break with a plausible benign cause (restore, code change) under active confirmation       | DPO informed within the hour. Writes continue if benign cause is confirmed; otherwise freeze.                                                    |
| **SEV-3** | Verifier soft-fails because of a transient DB connectivity issue mid-scan                        | Re-run; if reproducible, treat as SEV-2.                                                                                                         |

---

## Freezing writes

The audit DB's append-only enforcement makes deliberate tampering hard, but if the verifier is failing and the cause isn't known, the **safest** posture is to freeze writes from the application until the cause is identified — otherwise more events accumulate on a broken chain.

To freeze:

- Set `BFF_READ_ONLY=true` on the running deployment and roll. `[Deployment notes: how the env propagates — env-secret-manager-name and rollout command per the deployment.]`
- The BFF rejects every non-GET upstream request to EHRbase with 503.
- Auth keeps working (LOGIN/LOGOUT events still need to write); the auth-only writes go to the audit DB normally — but if integrity is broken globally, also disable the deployment per the on-call CISO's call.

To resume after the cause is identified and remediated:

- Run the verifier again and confirm `ok: true`.
- Roll the deployment with `BFF_READ_ONLY` unset / `false`.
- File the incident record per the breach runbook (even if the integrity issue turned out to be benign — there is a record to keep).

---

## Operational hygiene

- The verifier output is **never** logged with PHI. The `eventId` + the structural shape above are safe to publish in the war-room channel.
- Verifier runs are themselves audit events of type `META_AUDIT_ACCESS` — they will show up on the next sample-of-60 review.
- Keep the runbook updated when the verifier output shape changes — the JSON shapes above must match what `src/lib/audit/integrity.server.ts` actually returns.
