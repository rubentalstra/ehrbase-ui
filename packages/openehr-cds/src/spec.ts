// openEHR CDS coordinates this package targets. GDL2 in the latest CDS 2.0.1.
// Our rule-authoring shape never crosses the EHRbase wire, so CDS tracks the
// newest stable spec (ADR-0032 addendum). A `const` literal infers the literal type.

export const SPEC_COMPONENT = "CDS";
export const SPEC_VERSION = "2.0.1";
