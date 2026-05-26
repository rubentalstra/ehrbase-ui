# ADR-0011 — GitHub Actions: v-tag pinning (not full commit SHAs)

- **Status:** Accepted
- **Date:** 2026-05-26
- **Deciders:** Initial maintainer (@rubentalstra)
- **Supersedes:** —
- **Superseded by:** —

## Context

`docs/architecture.md` §20.1 specifies:

> "Pin every third-party action to a full commit SHA, not a tag. Tags are
> mutable and have been exploited in real-world attacks (tj-actions/changed-files,
> Mar 2025; Laravel-Lang, May 2026). A pinned SHA is immutable. Dependabot
> (configured for `github-actions`) opens PRs with reviewed SHA updates."

That is the strongest supply-chain posture available for GitHub Actions
consumers — Sigstore-verified at install time, immutable by definition.

The maintainer has elected to pin to **semver tags** (`@v6`, `@v5`, `@v4`,
`@v3`, etc.) rather than full commit SHAs.

## Decision

Pin every third-party action used in `.github/workflows/*.yml` to its major
semver tag (`@v6`, `@v5`, …). Allow patch updates within the major to flow
without an explicit PR.

Reasons stated by the maintainer:

1. Readability — a workflow YAML peppered with `@abc123def456…` SHAs is
   harder to scan during a code review than `@v6`.
2. Lower maintenance overhead — Dependabot proposes one PR per major bump
   instead of one PR per patch bump.

### Pinning convention (two cases)

- **Actions at v1.0+** pin to the moving major tag: `@v6`, `@v7`, `@v4`, …
  (gets patch/minor automatically; Dependabot bumps the major).
- **Actions still at 0.x** have no stable major tag, so they pin to the
  exact version and Dependabot bumps them: `aquasecurity/trivy-action@v0.36.0`,
  `anchore/sbom-action@v0.24.0`. (A bare `@v0` floats across every 0.x
  release — too loose for a 0.x project that may ship breaking changes in a
  minor.)

### Node-20 runtime audit (2026-05-27)

GitHub deprecates the Node-20 actions runtime (forced Node 24 from
2026-06-02, Node 20 removed 2026-09-16). Audited every action; the
runtime of each pinned version was checked against its `action.yml`
`runs.using`. Result:

- Bumped to current Node-24 majors: `actions/upload-artifact@v4 → v7`,
  `docker/setup-buildx-action@v3 → v4`, `docker/build-push-action@v6 → v7`,
  `docker/login-action@v3 → v4`, `sigstore/cosign-installer@v3 → v4`,
  `softprops/action-gh-release@v2 → v3`.
- Pinned off a floating ref: `aquasecurity/trivy-action@master → v0.36.0`
  (a `@master` ref is the exact supply-chain hole this ADR exists to avoid —
  it should never have been there).
- Already Node-24 / composite, left as-is: `actions/checkout@v6`,
  `actions/setup-node@v6`, `pnpm/action-setup@v6`, `step-security/harden-runner@v2`,
  `github/codeql-action/*@v4`, `actions/dependency-review-action@v5`,
  `anchore/sbom-action@v0.24.0`.
- **`gitleaks/gitleaks-action@v2`** is the one unavoidable Node-20 holdout
  (latest is v2.3.9; no v3 exists). Its job sets
  `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'` — the GitHub-sanctioned opt-in
  — so it runs on Node 24 today. Remove that env flag once gitleaks ships a
  Node-24 release.

## Risks accepted

This trades two specific safety properties for the readability + maintenance
gains:

1. **Tag mutability.** A semver tag can be moved to a new commit by the
   action's owner (or by an attacker who compromises the owner). Real
   incidents:
   - `tj-actions/changed-files` (Mar 2025) — tag re-pointed to malicious
     commit, exfiltrated secrets from every repo using it.
   - `Laravel-Lang/translations` (May 2026) — similar pattern, broader
     blast radius.
2. **Patch-version drift.** A new patch within a pinned major can change
   behavior or introduce regressions without an explicit PR.

## Mitigations we keep in place

- **`step-security/harden-runner`** in every workflow job blocks unexpected
  egress (set to `audit` for v1.0, will tighten to `block` after one full
  green CI cycle). If a compromised action tries to phone home, the runner
  logs it.
- **Dependabot for `github-actions`** (weekly schedule in
  `.github/dependabot.yml`) opens PRs for every major-version bump. A
  human reviews each one.
- **Minimum-privilege `GITHUB_TOKEN`** — default permissions are
  `contents: read`; jobs that need write request it explicitly (e.g.
  `packages: write` for GHCR publishes, `id-token: write` for keyless
  signing).
- **No `pull_request_target`** trigger — workflows never run untrusted
  fork code with secrets.
- **Branch protection on `main`** — workflow files cannot be modified
  without review.

## Path to SHA-pin (if we change our mind later)

The ADR is reversible. To switch to SHA pinning:

1. Run a helper script that walks every `@v*` reference in
   `.github/workflows/*.yml` and resolves it to the current commit SHA of
   that tag via the GitHub API.
2. Update Dependabot config to use commit-SHA updates for `github-actions`
   (already the default behavior — no config change required).
3. Update this ADR to status `Superseded by ADR-####` (new ADR explains
   the rationale for the switch).

## Consequences

**Positive:** Cleaner workflow YAML; fewer PRs for the maintainer to
review; faster iteration on CI tweaks.

**Negative:** Increased exposure to upstream tag-mutation attacks;
patch-version regressions can land silently.

**Net:** Acceptable given the runner-hardening + Dependabot + branch
protection layers, but this ADR makes the tradeoff explicit. Re-evaluate
after the next high-profile GitHub Actions supply-chain incident.

## Links

- [Architecture doc § 20.1 (Principles)](../architecture.md#201-principles)
- [`step-security/harden-runner`](https://github.com/step-security/harden-runner)
- [GitHub: Security hardening for actions](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
