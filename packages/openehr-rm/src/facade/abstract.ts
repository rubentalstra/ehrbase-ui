// Hand-stitched abstract-supertype unions (ADR-0032 addendum).
//
// ITS-JSON emits no abstract classes — every polymorphic slot inlines its own
// `z.union(...)`. These named unions give consumers (the form engine, the FLAT
// converter, demographic + clinical surfaces) a stable handle on the openEHR
// abstract supertypes, built from the generated concrete classes (single source
// of truth). They are plain top-level `z.union`s: the referenced concrete
// schemas already exist when this module evaluates, and each concrete class is
// `.strict()`, so the union disambiguates members without a discriminator (and
// tolerates openEHR's optional `_type`).

import { z } from "zod";
import * as rm from "../generated/current.ts";

// DATA_VALUE — the 22 concrete DV_* leaf data types.
export const DATA_VALUE = z.union([
  rm.DV_BOOLEAN,
  rm.DV_CODED_TEXT,
  rm.DV_COUNT,
  rm.DV_DATE,
  rm.DV_DATE_TIME,
  rm.DV_DURATION,
  rm.DV_EHR_URI,
  rm.DV_GENERAL_TIME_SPECIFICATION,
  rm.DV_IDENTIFIER,
  rm.DV_INTERVAL,
  rm.DV_MULTIMEDIA,
  rm.DV_ORDINAL,
  rm.DV_PARAGRAPH,
  rm.DV_PARSABLE,
  rm.DV_PERIODIC_TIME_SPECIFICATION,
  rm.DV_PROPORTION,
  rm.DV_QUANTITY,
  rm.DV_SCALE,
  rm.DV_STATE,
  rm.DV_TEXT,
  rm.DV_TIME,
  rm.DV_URI,
]);
export type DATA_VALUE = z.infer<typeof DATA_VALUE>;

// ITEM — the content of a data structure: a single value or a nested cluster.
export const ITEM = z.union([rm.CLUSTER, rm.ELEMENT]);
export type ITEM = z.infer<typeof ITEM>;

// ITEM_STRUCTURE — the four concrete representational structures.
export const ITEM_STRUCTURE = z.union([rm.ITEM_SINGLE, rm.ITEM_LIST, rm.ITEM_TABLE, rm.ITEM_TREE]);
export type ITEM_STRUCTURE = z.infer<typeof ITEM_STRUCTURE>;

// ENTRY — the clinical/administrative entry types.
export const ENTRY = z.union([
  rm.OBSERVATION,
  rm.EVALUATION,
  rm.INSTRUCTION,
  rm.ACTION,
  rm.ADMIN_ENTRY,
  rm.GENERIC_ENTRY,
]);
export type ENTRY = z.infer<typeof ENTRY>;

// CARE_ENTRY — the clinical subset of ENTRY (excludes admin/generic).
export const CARE_ENTRY = z.union([rm.OBSERVATION, rm.EVALUATION, rm.INSTRUCTION, rm.ACTION]);
export type CARE_ENTRY = z.infer<typeof CARE_ENTRY>;

// CONTENT_ITEM — what may appear directly under a COMPOSITION / SECTION.
export const CONTENT_ITEM = z.union([
  rm.SECTION,
  rm.OBSERVATION,
  rm.EVALUATION,
  rm.INSTRUCTION,
  rm.ACTION,
  rm.ADMIN_ENTRY,
  rm.GENERIC_ENTRY,
]);
export type CONTENT_ITEM = z.infer<typeof CONTENT_ITEM>;

// EVENT — a point or interval event within a HISTORY.
export const EVENT = z.union([rm.POINT_EVENT, rm.INTERVAL_EVENT]);
export type EVENT = z.infer<typeof EVENT>;

// PARTY_PROXY — how a composition/entry references a party (always a reference,
// never inline demographics — CLAUDE.md Inviolable rule 12).
export const PARTY_PROXY = z.union([rm.PARTY_IDENTIFIED, rm.PARTY_SELF, rm.PARTY_RELATED]);
export type PARTY_PROXY = z.infer<typeof PARTY_PROXY>;
