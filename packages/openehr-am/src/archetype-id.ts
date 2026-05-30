// ADL 1.4 archetype + node identifier parsing.
//
// EHRbase serves ADL 1.4 operational templates, so identifiers follow the 1.4
// grammar (not the ADL2 HRID with namespace + build count). An archetype id is
//   <rm_publisher>-<rm_package>-<rm_class>.<concept>.v<version>
// e.g. `openEHR-EHR-OBSERVATION.blood_pressure.v2`. These helpers back the
// ADR-0016 archetype catalogue and the clinical-UI archetype citations.

export interface ArchetypeId {
  /** the full id string, e.g. "openEHR-EHR-OBSERVATION.blood_pressure.v2" */
  value: string;
  /** publishing organisation, e.g. "openEHR" */
  rmPublisher: string;
  /** RM package, e.g. "EHR" */
  rmPackage: string;
  /** RM class, e.g. "OBSERVATION", "ADMIN_ENTRY" */
  rmClass: string;
  /** domain concept (may carry a specialisation suffix), e.g. "blood_pressure" */
  conceptId: string;
  /** major version integer (the `vN`) */
  versionMajor: number;
}

// rm_entity = publisher-package-class (class is uppercase + underscores, never a
// hyphen — so the entity is exactly three `-`-separated parts), then
// `.concept.vN`.
const ARCHETYPE_ID_RE =
  /^([A-Za-z0-9]+)-([A-Za-z0-9]+)-([A-Z][A-Z0-9_]*)\.([A-Za-z0-9_-]+)\.v(\d+)$/;

/** Parse an ADL 1.4 archetype id, or return null if it is not well-formed. */
export function parseArchetypeId(value: string): ArchetypeId | null {
  const m = ARCHETYPE_ID_RE.exec(value);
  if (!m) return null;
  const [, rmPublisher, rmPackage, rmClass, conceptId, version] = m;
  if (
    rmPublisher === undefined ||
    rmPackage === undefined ||
    rmClass === undefined ||
    conceptId === undefined ||
    version === undefined
  ) {
    return null;
  }
  return { value, rmPublisher, rmPackage, rmClass, conceptId, versionMajor: Number(version) };
}

/** Whether a string is a well-formed ADL 1.4 archetype id. */
export function isArchetypeId(value: string): boolean {
  return ARCHETYPE_ID_RE.test(value);
}

/** Reassemble an archetype id from its parts (inverse of parseArchetypeId). */
export function formatArchetypeId(id: Omit<ArchetypeId, "value">): string {
  return `${id.rmPublisher}-${id.rmPackage}-${id.rmClass}.${id.conceptId}.v${id.versionMajor}`;
}
