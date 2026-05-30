// @ehrbase-ui/openehr-am — openEHR AM, targeting ADL 1.4 / OPT 1.4
//
// PIN: ADL 1.4 / OPT 1.4 to match EHRbase 2.31.0 (which emits ADL 1.4
// operational templates), NOT AOM2 2.3.0 — see the ADR-0032 addendum
// (2026-05-30). Scope is the minimal OPT subset needed for web-template
// hydration; the actual form consumption format (the EHRbase web template)
// is parsed by @ehrbase-ui/openehr-web-template, not here.
//
// Source: https://specifications.openehr.org/releases/AM/Release-2.3.0 (latest AM spec; see ADL 1.4 / OPT 1.4 rows below)
// Specifications
// Specification	Description	Notes
// STABLE Archetype Technology	Overview of archetype technology, basic semantics, types of artefact, parsing, compiling etc.
// STABLE ADL 2	Archetype Definition Language 2 (ADL2): includes differential specialisation, terminology integration.	ADL2 wiki page
// STABLE AOM 2	Archetype Object Model 2 (AOM2) - full computable model of Archetypes and Templates. Includes uniquely identified formally testable validity conditions (suitable for output by compilers), revised primitive types, improved terminology section, and constraint model extended to represent differential archetypes. (ISO 13606-2:2019)
// DEVELOPMENT OPT 2	Specification of the Operational Template 2 (OPT2) format.	ADL2 OPT wiki page
// STABLE Identification	Formal model of identifiers, versioning and lifecycle for archetypes, templates and terminology subsets.	Identification wiki page
// STABLE ADL 1.4	Abstract syntax specification for Archetype Definition Language (ADL), 1.4 edition of language (ISO 13606-2:2008).	ADL 1.4 migration page
// STABLE AOM 1.4	Archetype Object Model (AOM) 1.4 - syntax-independent model of archetypes corresponding to ADL 1.4.
// STABLE OPT 1.4	Specification of the Operational Template 1.4 (OPT) format.
// STABLE Archetype Profile	Legacy specification of plug-in semantics for AOM 1.4 (replaced by standard semantics in AOM 2).
// Populated by M6 (web-template parser). Empty in v1.0 foundation.
export {}
