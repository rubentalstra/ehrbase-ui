// RM-version parse guard (Phase 1, task P1.5).
//
// Purpose: a parse-time tripwire so the UI never *silently* mis-handles a
// COMPOSITION authored against a Reference Model newer than the one this
// package generates Zod schemas + types from. EHRbase stores each composition's
// `archetype_details.rm_version`; after a server upgrade that bumps the RM, the
// stored data can carry shapes our generated schemas don't model. Rather than
// guess, we fail loudly at the boundary (read surfaces call `guardComposition`
// once after parsing).
//
// Leniency policy (documented contract — see `rmVersionMatches`):
//   • PATCH is ignored entirely (RM patch releases are non-breaking).
//   • Same MAJOR + an OLDER-or-equal MINOR is accepted. The openEHR RM is
//     backward-compatible within a major line — RM 1.1.0 is a superset of the
//     1.0.x shapes, which is why real EHRbase data carrying `rm_version` 1.0.x
//     parses cleanly against our 1.1.0 schemas. Accepting older minors lets the
//     UI read legacy compositions without a spurious mismatch.
//   • A NEWER minor (e.g. data says 1.2.x while we pin 1.1.x) or a DIFFERENT
//     major is REJECTED — that is the "upgraded server emits shapes we may not
//     model" case the guard exists to catch.
//   • A malformed / missing version string is REJECTED (cannot prove safety).
//
// No PHI: the error carries only the two RM version strings, never composition
// content, subject, or any identifier.

import { z } from "zod";

import * as rm from "../generated/current.ts";
import { SPEC_VERSION } from "../spec.ts";

/** Parsed `major.minor` pair of an RM version string. */
interface MajorMinor {
  readonly major: number;
  readonly minor: number;
}

// A dotted numeric version: at least `major.minor`, optional `.patch` (and any
// further dotted numeric segments, which we ignore). Pre-release / build
// suffixes are not expected on an openEHR `rm_version` and are not accepted.
const VERSION_RE = /^(\d+)\.(\d+)(?:\.\d+)*$/;

/** Parse `major.minor` from a dotted version string, or `null` if malformed. */
function parseMajorMinor(version: string): MajorMinor | null {
  const match = VERSION_RE.exec(version.trim());
  if (match === null) return null;
  // Capture groups 1 and 2 are guaranteed present when the regex matches.
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
  return { major, minor };
}

/** The RM version this package's generated schemas model (from `spec.ts`). */
const PINNED = parseMajorMinor(SPEC_VERSION);

/**
 * Thrown when a composition's RM version is not safely handleable by this
 * package's generated schemas. Carries only the two version strings — never PHI.
 */
export class RmVersionMismatchError extends Error {
  /** The `rm_version` read from the data (or `"<missing>"` / `"<malformed>"`). */
  readonly actualRmVersion: string;
  /** The RM version this package pins (its generated schemas model this). */
  readonly expectedRmVersion: string;

  constructor(actualRmVersion: string, expectedRmVersion: string) {
    super(
      `openEHR RM version mismatch: data is "${actualRmVersion}", ` +
        `this build supports RM ${expectedRmVersion} (same major, minor ≤ ${expectedRmVersion}). ` +
        `Refusing to silently mis-handle data from a newer Reference Model.`,
    );
    this.name = "RmVersionMismatchError";
    this.actualRmVersion = actualRmVersion;
    this.expectedRmVersion = expectedRmVersion;
  }
}

/**
 * Whether `rmVersion` is safely handleable by this package's generated schemas.
 *
 * Lenient on patch; accepts the same major with an older-or-equal minor; rejects
 * a newer minor, a different major, or a malformed string. See the module header
 * for the full policy and rationale.
 */
export function rmVersionMatches(rmVersion: string): boolean {
  if (PINNED === null) return false; // unreachable in practice — SPEC_VERSION is well-formed
  const actual = parseMajorMinor(rmVersion);
  if (actual === null) return false;
  return actual.major === PINNED.major && actual.minor <= PINNED.minor;
}

/**
 * Assert that `rmVersion` is safely handleable, throwing
 * {@link RmVersionMismatchError} otherwise. No PHI in the thrown error.
 */
export function assertRmVersion(rmVersion: string): void {
  if (!rmVersionMatches(rmVersion)) {
    const trimmed = rmVersion.trim();
    const actual = trimmed.length === 0 ? "<missing>" : trimmed;
    throw new RmVersionMismatchError(actual, SPEC_VERSION);
  }
}

// The narrow shape we read off a parsed COMPOSITION: only `archetype_details`,
// only its `rm_version`. Validated with a lenient Zod schema (no `as`, per
// CLAUDE.md rule 3) so the guard accepts any object carrying that field — it
// does not re-validate the whole composition (that is the COMPOSITION schema's
// job at parse time).
const RmVersionCarrier = z.object({
  archetype_details: z.object({ rm_version: z.string() }).optional(),
});

/**
 * Read `archetype_details.rm_version` from a parsed COMPOSITION and assert it is
 * safely handleable. A composition with no `archetype_details` (and thus no
 * `rm_version`) is treated as a mismatch — the version is unprovable, so we fail
 * closed rather than risk silently mis-handling the data.
 *
 * @param composition a parsed `COMPOSITION` (or any object carrying
 *   `archetype_details.rm_version`).
 * @throws {RmVersionMismatchError} when the version is missing, malformed, or
 *   outside the supported range.
 */
export function guardComposition(composition: rm.COMPOSITION): void {
  const carrier = RmVersionCarrier.safeParse(composition);
  const rmVersion = carrier.success ? carrier.data.archetype_details?.rm_version : undefined;
  if (rmVersion === undefined) {
    throw new RmVersionMismatchError("<missing>", SPEC_VERSION);
  }
  assertRmVersion(rmVersion);
}
