// @ehrbase-ui/openehr-rm — openEHR Reference Model 1.1.0
//
// EHR IM (COMPOSITION / OBSERVATION / EVALUATION / INSTRUCTION / ACTION /
// SECTION) + Demographic IM (PARTY / PERSON / PARTY_IDENTITY / CONTACT /
// ADDRESS / ROLE / PARTY_RELATIONSHIP) + Common + Data Types (DV_TEXT,
// DV_QUANTITY, DV_CODED_TEXT, …) + Data Structures.
//
// Source of truth: https://specifications.openehr.org/releases/RM/Release-1.1.0
// Specifications
// Specification	Description
// STABLE EHR	The information model of the openEHR EHR.
// STABLE Demographic	The openEHR demographics information model.
// STABLE Common	Information model containing common concepts, including the archetype-enabling `LOCATABLE` class, party references, audits and attestations, change control, and authored resources.
// STABLE Data Structures	Information model of data structures, including a powerful model of time-series data.
// STABLE Data Types	Information model of data types, including quantities, date/times, plain and coded text, time specification, multimedia and URIs.
// STABLE Support	Support model defining identifiers, assumed types, and terminology interface specification used in the rest of the IMs.
// STABLE Integration	Information model for representing legacy data is a free-form Entry type for implementing integration solutions.
// STABLE EHR Extract	The information model of the EHR Extract, which is a serialisation of content from an EHR.
// Type-generation strategy: ADR-0032. Populated by M6 + M7. Empty in v1.0 foundation.
export {}
