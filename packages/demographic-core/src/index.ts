// @ehrbase-ui/demographic-core — DemographicProvider interface + built-in Postgres adapter
// Per ADR-0031 (supersedes ADR-0023 in shape). Empty in v1.0 foundation; populated by M7.
//
// Exports planned (M7):
//   - DemographicProvider interface
//   - BuiltinDemographicProvider (Postgres VERSIONED_PARTY)
//   - Identifier-namespace registry (NL BSN, BE NISS, FR NIR, DE KVNR, IT CF, ES TIS, PT NUTS, AT bPK, PL PESEL, MRN)
//   - pseudonymize() helper (HMAC-SHA256 with shared AUDIT_PSEUDONYM_SECRET — §14.4)
export {}
