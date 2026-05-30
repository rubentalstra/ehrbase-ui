// Minimal Zod schemas for the FHIR R4 Patient resource + Bundle — the subset the
// adapter reads/writes. Responses from the FHIR server are PARSED through these
// before crossing into the app (clinical data must not cross the boundary
// unvalidated — §15). Unknown fields are stripped (default Zod behaviour); we
// never claim full FHIR conformance (ADR-0033 — IPS R4 baseline only).

import { z } from "zod";

export const FhirHumanNameSchema = z.object({
  use: z.string().optional(),
  family: z.string().optional(),
  given: z.array(z.string()).optional(),
  prefix: z.array(z.string()).optional(),
  suffix: z.array(z.string()).optional(),
  text: z.string().optional(),
});

export const FhirIdentifierSchema = z.object({
  system: z.string().optional(),
  value: z.string().optional(),
});

export const FhirAddressSchema = z.object({
  use: z.string().optional(),
  line: z.array(z.string()).optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
});

export const FhirContactPointSchema = z.object({
  system: z.string().optional(),
  value: z.string().optional(),
  use: z.string().optional(),
});

export const FhirReferenceSchema = z.object({ reference: z.string() });

export const FhirMetaSchema = z.object({
  versionId: z.string().optional(),
  lastUpdated: z.string().optional(),
});

export const FhirPeriodSchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
});

// Patient.link — the FHIR-native record-linkage used for merge (replaced-by /
// replaces; ADR-0033 addendum).
export const FhirPatientLinkSchema = z.object({
  other: FhirReferenceSchema,
  type: z.enum(["replaced-by", "replaces", "refer", "seealso"]),
});

export const FhirExtensionSchema = z.object({
  url: z.string(),
  valueReference: FhirReferenceSchema.optional(),
  valueString: z.string().optional(),
});

// The deactivation reason (the FHIR analogue of the built-in's
// VERSION.audit_details.description / change_description column).
export const DEACTIVATION_REASON_EXTENSION =
  "https://ehrbase-ui.openhospi.nl/fhir/deactivation-reason";

export const FhirPatientSchema = z.object({
  resourceType: z.literal("Patient"),
  id: z.string().optional(),
  meta: FhirMetaSchema.optional(),
  active: z.boolean().optional(),
  identifier: z.array(FhirIdentifierSchema).optional(),
  name: z.array(FhirHumanNameSchema).optional(),
  gender: z.enum(["male", "female", "other", "unknown"]).optional(),
  birthDate: z.string().optional(),
  deceasedBoolean: z.boolean().optional(),
  deceasedDateTime: z.string().optional(),
  address: z.array(FhirAddressSchema).optional(),
  telecom: z.array(FhirContactPointSchema).optional(),
  link: z.array(FhirPatientLinkSchema).optional(),
  extension: z.array(FhirExtensionSchema).optional(),
});
export type FhirPatient = z.infer<typeof FhirPatientSchema>;

// RelatedPerson — the FHIR-native representation of a PARTY_RELATIONSHIP. The
// relationship type round-trips losslessly via a project code system; the target
// party reference is carried in a typed extension (the source is `patient`).
export const REL_TYPE_SYSTEM = "https://ehrbase-ui.openhospi.nl/fhir/relationship-type";
export const REL_TARGET_EXTENSION = "https://ehrbase-ui.openhospi.nl/fhir/related-patient";

export const FhirCodeableConceptSchema = z.object({
  coding: z
    .array(z.object({ system: z.string().optional(), code: z.string().optional() }))
    .optional(),
});

export const FhirRelatedPersonSchema = z.object({
  resourceType: z.literal("RelatedPerson"),
  id: z.string().optional(),
  meta: FhirMetaSchema.optional(),
  active: z.boolean().optional(),
  patient: FhirReferenceSchema,
  relationship: z.array(FhirCodeableConceptSchema).optional(),
  period: FhirPeriodSchema.optional(),
  extension: z.array(FhirExtensionSchema).optional(),
});
export type FhirRelatedPerson = z.infer<typeof FhirRelatedPersonSchema>;

export const FhirBundleSchema = z.object({
  resourceType: z.literal("Bundle"),
  type: z.string().optional(),
  total: z.number().optional(),
  entry: z
    .array(z.object({ resource: FhirPatientSchema.optional() }))
    .optional(),
});
export type FhirBundle = z.infer<typeof FhirBundleSchema>;
