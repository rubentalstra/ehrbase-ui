# Runbook — Personal-data breach response

> **GDPR Art. 33 — controller must notify the competent supervisory authority within 72 hours of becoming aware.** **Art. 34 — notify affected data subjects "without undue delay" where the breach is likely to result in a high risk to rights and freedoms.** Architecture-doc cross-references: [`architecture.md §14.9`](../architecture.md#149-breach-notification), [`§14.5`](../architecture.md#145-tamper-evidence--hash-chain), [`§5.6`](../architecture.md#56-roles-authorization--break-glass-emergency-access).
>
> This runbook is operational, not legal. It describes the **technical steps** the on-call engineer takes during a confirmed or suspected breach; the legal notification text is owned by the DPO and counsel.

---

## When this runbook applies

A "personal-data breach" under GDPR Art. 4(12) is any breach of security leading to the accidental or unlawful **destruction**, **loss**, **alteration**, **unauthorised disclosure** of, or **access to**, personal data. In practice for this application the trigger categories are:

| Trigger                    | How it surfaces                                                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Confidentiality breach** | Unauthorised access — e.g. credentials compromise; a clinician viewing records outside any care relationship without break-glass; a researcher exporting data they were not approved for. |
| **Integrity breach**       | Tampering — audit-chain integrity check fails; unexpected DB rows mutated; backup-restore inconsistency.                                                                                  |
| **Availability breach**    | Loss — data deletion / DB corruption / ransomware-style outage during clinical shift; if the loss means clinicians can't treat, it is a personal-data breach under Art. 4(12).            |
| **Suspected breach**       | Operationally treat the same; do not delay containment waiting for confirmation.                                                                                                          |

The **clock** in Art. 33 starts when the **controller** becomes aware of the breach with reasonable certainty. Inform the controller (DPO) immediately on credible suspicion — see §10 in the [DPA template](../compliance/DPA-template.md): processor → controller within 24h.

---

## Roles and contacts

| Role                          | Responsibility                                              | Contact (fill per deployment)                                                                                                      |
| ----------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **On-call engineer**          | Drives this runbook end-to-end                              | `[Pager / phone]`                                                                                                                  |
| **DPO**                       | Owns regulator + patient notification; runs the legal clock | `[Name, email, phone — primary; backup]`                                                                                           |
| **CISO / security lead**      | Owns containment + forensics                                | `[…]`                                                                                                                              |
| **Clinical lead**             | Owns operational impact + patient-safety call               | `[…]`                                                                                                                              |
| **Comms lead**                | Owns external messaging once DPO + legal approve            | `[…]`                                                                                                                              |
| **Counsel**                   | Owns the legal review of every notification draft           | `[…]`                                                                                                                              |
| **Controller representative** | Owns the regulator filing                                   | `[…]`                                                                                                                              |
| **Supervisory authority**     | Where to file Art. 33                                       | `[NL AP / DE BfDI + Landesbeauftragte / FR CNIL / IT Garante / ES AEPD / …]` — `[URL of the SA's online breach-notification form]` |

Bridge / war-room channel: `[#sec-incident-active or equivalent — keep this updated]`.

---

## Severity guide

| Severity  | Signal                                                                                                                                                                             | Initial response                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **SEV-1** | Active exfiltration in progress; confirmed unauthorised mass access; audit chain broken with evidence of writes after the break; ransomware-class availability loss during shift   | Page everyone in the table above immediately. Engage controller within minutes. |
| **SEV-2** | Confirmed unauthorised access, contained but not yet reverted; integrity-job failure with no evidence of writes after; targeted credential compromise without confirmed PHI access | Page on-call + DPO + CISO. Engage controller within the hour.                   |
| **SEV-3** | Suspected breach with insufficient evidence to confirm                                                                                                                             | Page on-call + DPO. Triage to escalate or close within the hour.                |

The DPO confirms the severity for the regulator filing; the engineering classification above only drives the technical pace.

---

## Step-by-step

### Step 1 — Acknowledge and start the clock (≤5 min)

1. Acknowledge the alert. State out loud in the bridge: "Acknowledging — possible Art. 33 trigger at `[HH:MM UTC]`. Starting the 72h clock until DPO confirms otherwise."
2. Open the war-room channel and post the alert details.
3. Page the DPO. Do not skip — even if you suspect a false positive, the DPO controls the legal clock.

### Step 2 — Contain (≤15 min for SEV-1, ≤30 min for SEV-2)

Containment **before** investigation. The forensic trail is on the audit log, not in volatile system state — destroying volatile state to stop active access is acceptable.

- **Credential compromise.** Revoke the suspect user's Keycloak session(s) (admin REST API: `DELETE /admin/realms/<realm>/sessions/<id>` and `DELETE /admin/realms/<realm>/users/<id>/sessions`). Force password reset + re-MFA. Block the IP at the WAF / edge if appropriate.
- **Application compromise.** Roll the BFF cookies signing key (`SESSION_SECRET`) — every active session terminates. Rotate the IdP client secret. If a token leak is suspected, rotate the IdP signing key.
- **Mass exfiltration in progress.** Disable the suspect role (e.g. demote `researcher` to none) via Keycloak admin; block the EHRbase backend at the BFF for the duration if needed. Disabling the deployment for clinical safety is escalated to the clinical lead — never the on-call's unilateral call.
- **Integrity breach.** Set the BFF to read-only by disabling all `POST/PUT/PATCH/DELETE` paths at the proxy (kill-switch env: `BFF_READ_ONLY=true` — `[document the exact mechanism for your deployment]`). The audit `audit_writer` role keeps writing; rewinding write traffic prevents further integrity damage.
- **Availability breach.** Trigger DR per the M18 backup/DR runbook. Do **not** restore over the warm audit DB until step 5 has captured the current state to cold storage — the breach evidence is in that warm tier.

Confirm containment in the bridge with the on-call CISO. Containment timestamp goes in the incident log.

### Step 3 — Capture forensic state (parallel with Step 4 — assign separate people)

- **Snapshot the audit DB.** `pg_dump --schema=audit > breach-<id>-audit-<UTC-timestamp>.sql` against the appliance (not the replica). Store under an evidence-handling chain that the DPO can attest to (sealed object in the cold-tier bucket with `[deployment's evidence path]`, hash recorded).
- **Snapshot the application DB.** `pg_dump --schema=app > breach-<id>-app-<UTC-timestamp>.sql`.
- **Snapshot the demographic DB.**
- **Capture Valkey state.** `redis-cli --rdb breach-<id>-valkey-<UTC-timestamp>.rdb` against the appliance.
- **Cold-tier integrity check.** Run the audit-log integrity-check runbook ([`./audit-log-integrity-check.md`](./audit-log-integrity-check.md)) and capture its report.
- **Container logs.** Capture last 24h from every service (`docker compose logs --no-color --since=24h > breach-<id>-logs-<UTC-timestamp>.txt`).
- **Tracing.** Pull the relevant Tempo trace IDs (correlation IDs from suspected sessions).
- Record hashes (`sha256sum *`) of every artefact in the war-room channel.

### Step 4 — Forensic AQL queries (parallel with Step 3)

The audit log answers most of what the DPO needs to file Art. 33. Run these via the `audit-reviewer` AQL surface — copy results into the incident log.

> Replace the bracketed variables. The HMAC pseudonymisation (`§14.4`) means raw national IDs are not in the log — query by `subjectIdHash` (compute via the auditor's reveal flow, which emits its own `META_AUDIT_ACCESS` event).

**1. Every access by the suspect user, last 30 days**

```sql
SELECT timestamp, action, target_resource_type, target_resource_id, outcome, purpose, lawful_basis, correlation_id
FROM audit_events
WHERE actor_user_id = '[suspect user id]'
  AND timestamp >= NOW() - INTERVAL '30 days'
ORDER BY timestamp DESC;
```

**2. Every access to the suspect patient's record, all time (use pseudonymised subject ID)**

```sql
SELECT timestamp, actor_user_id, action, target_resource_type, target_resource_id, outcome, purpose, lawful_basis, correlation_id
FROM audit_events
WHERE target_subject_id_hash = '[hash]'
ORDER BY timestamp ASC;
```

**3. Bulk read patterns — sessions reading > 50 patients in 1 hour**

```sql
SELECT actor_user_id, date_trunc('hour', timestamp) AS hour, COUNT(DISTINCT target_subject_id_hash) AS unique_patients
FROM audit_events
WHERE action IN ('READ', 'QUERY')
  AND target_resource_type IN ('EHR', 'COMPOSITION')
  AND timestamp >= NOW() - INTERVAL '7 days'
GROUP BY actor_user_id, hour
HAVING COUNT(DISTINCT target_subject_id_hash) > 50
ORDER BY unique_patients DESC;
```

**4. All `EXPORT` / `PRINT` events in the window**

```sql
SELECT *
FROM audit_events
WHERE action IN ('EXPORT', 'PRINT')
  AND timestamp >= '[breach window start]'
  AND timestamp <= '[breach window end]'
ORDER BY timestamp ASC;
```

**5. All `ACCESS_DENIED` events for the suspect user (probing signal)**

```sql
SELECT timestamp, target_resource_type, target_resource_id, outcome_detail
FROM audit_events
WHERE actor_user_id = '[suspect user id]'
  AND action = 'ACCESS_DENIED'
  AND timestamp >= NOW() - INTERVAL '30 days'
ORDER BY timestamp DESC;
```

**6. All `EMERGENCY_ACCESS_GRANTED` events in the window — break-glass misuse?**

```sql
SELECT timestamp, actor_user_id, target_subject_id_hash, outcome_detail
FROM audit_events
WHERE action = 'EMERGENCY_ACCESS_GRANTED'
  AND timestamp >= '[breach window start]'
ORDER BY timestamp ASC;
```

**7. Hash-chain integrity check — confirms whether log itself is trustworthy**

Run `pnpm tsx src/lib/audit/integrity.server.ts` (or hit the manual integrity endpoint described in [`./audit-log-integrity-check.md`](./audit-log-integrity-check.md)) and copy the verifier output.

Save the output of every query under the breach-`<id>` evidence bundle.

### Step 5 — Scope and impact

Determine, with the DPO:

- **Affected data subjects** — list of pseudonymised subject IDs from Step 4 queries 2, 3, 6. The DPO reveals identities for the notification list under controlled access (each reveal emits a `META_AUDIT_ACCESS` event, see [`§14.4`](../architecture.md#144-the-paradox--audit-logs-are-themselves-phi)).
- **Categories of personal data exposed** — derive from `target_resource_type` + `archetype_id` cells.
- **Approximate number of records** — `COUNT(*)` on the affected query.
- **Likely consequences for the data subjects** — DPO + clinical-lead call. "High risk" (Art. 34 patient notification trigger) means likely physical, material, or non-material damage — including discrimination, identity theft, fraud, financial loss, reputational damage, loss of confidentiality of professional secrecy, or any other significant social or economic disadvantage.
- **Measures taken and proposed** — fill from Steps 2 + 6.

### Step 6 — Eradicate and recover

Once the DPO has the data needed to file:

- Patch the root cause (credential, config, code, dependency CVE — whichever it was).
- Open a follow-up ticket with the root cause + a post-incident review date (≤14 days).
- Restore the breach kill-switch flags to normal once the patched build is deployed.
- Revoke any sessions / tokens / API keys that were issued before the patch landed.
- Re-issue credentials to the user(s) whose accounts were compromised; require fresh MFA enrolment if applicable.

### Step 7 — Notify (DPO + counsel drive; engineer supplies facts)

| Audience                   | Mechanism                                                                                     | When                                             | Owner                                     |
| -------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------- |
| Controller (if processor)  | Email + phone                                                                                 | Within 24h of awareness                          | On-call                                   |
| Supervisory authority      | The SA's online breach form                                                                   | Within 72h of controller awareness               | DPO + counsel + controller representative |
| Data subjects              | Per the deployment's patient-communications channel (letter / portal message / GP-via-system) | "Without undue delay" if high risk under Art. 34 | DPO + comms lead + clinical lead          |
| Any affected sub-processor | Email + phone                                                                                 | Without undue delay                              | On-call                                   |

The notification template lives under `compliance/<deployment-slug>/breach-notification-templates/` — fill bracketed placeholders from Steps 4 + 5.

### Step 8 — Record and close

Required record (Art. 33(5)) — even if the breach does not have to be notified:

- Facts relating to the breach.
- Effects of the breach.
- Remedial action taken.

File under `compliance/<deployment-slug>/breaches/<incident-id>.md`. Include:

- The Step-by-step timeline (acknowledgement, containment, capture, query results, scope, eradication, notification).
- Evidence-bundle hash list from Step 3.
- The notification(s) sent and the regulator response.
- The post-incident review minutes and the follow-up tickets.

Close in the war-room channel with the incident ID + the link to the closed record.

---

## Post-incident review (within 14 days)

Standing agenda:

- Root cause (the "what broke" — one sentence).
- Contributing factors (the "why we didn't catch it sooner").
- What worked (so we keep it).
- What didn't (so we change it).
- Action items with owners + due dates.
- Whether the architecture doc or any ADR needs an update (it usually does — open the ADR PR before the meeting closes).

---

## Drills

A tabletop exercise of this runbook runs at minimum **yearly** and after any material change to the audit, BFF, or backup stack. The drill is logged under `compliance/<deployment-slug>/drills/breach-<YYYY>.md`. The M18 quarterly DR drill (`§21`) overlaps with the availability-breach scenario.
