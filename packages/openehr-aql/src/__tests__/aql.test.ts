import { describe, expect, it } from "vitest";

import {
  and,
  type AqlQuery,
  collectParams,
  compare,
  not,
  param,
  serializeAql,
  SPEC_COMPONENT,
  SPEC_VERSION,
} from "../index.ts";

describe("spec coordinates", () => {
  it("pins AQL 1.1.0", () => {
    expect(SPEC_COMPONENT).toBe("AQL");
    expect(SPEC_VERSION).toBe("1.1.0");
  });
});

const vitalsQuery: AqlQuery = {
  select: {
    columns: [
      { path: "c/uid/value", alias: "uid" },
      { path: "o/data[at0001]/events[at0006]/data[at0003]/items[at0004]/value/magnitude", alias: "systolic" },
    ],
  },
  from: {
    rmType: "EHR",
    alias: "e",
    predicate: "ehr_id/value=$ehrId",
    contains: {
      items: [
        {
          rmType: "COMPOSITION",
          alias: "c",
          archetypeId: "openEHR-EHR-COMPOSITION.encounter.v1",
          contains: {
            items: [{ rmType: "OBSERVATION", alias: "o", archetypeId: "openEHR-EHR-OBSERVATION.blood_pressure.v2" }],
          },
        },
      ],
    },
  },
  where: and(compare("c/name/value", "=", "Encounter"), compare("e/ehr_id/value", "=", param("ehrId"))),
  orderBy: [{ path: "o/data/events/time", direction: "DESC" }],
  limit: 10,
  offset: 0,
};

describe("serializeAql", () => {
  it("serializes a CONTAINS chain with predicates, WHERE, ORDER BY, LIMIT/OFFSET", () => {
    expect(serializeAql(vitalsQuery)).toBe(
      [
        "SELECT c/uid/value AS uid, o/data[at0001]/events[at0006]/data[at0003]/items[at0004]/value/magnitude AS systolic",
        "FROM EHR e[ehr_id/value=$ehrId] CONTAINS COMPOSITION c[openEHR-EHR-COMPOSITION.encounter.v1] CONTAINS OBSERVATION o[openEHR-EHR-OBSERVATION.blood_pressure.v2]",
        "WHERE c/name/value = 'Encounter' AND e/ehr_id/value = $ehrId",
        "ORDER BY o/data/events/time DESC",
        "LIMIT 10",
        "OFFSET 0",
      ].join("\n"),
    );
  });

  it("renders DISTINCT, TOP, aggregates, LIKE, matches, and NOT", () => {
    const q: AqlQuery = {
      select: { distinct: true, top: 5, columns: [{ path: "c/uid/value", aggregate: "COUNT" }] },
      from: { rmType: "COMPOSITION", alias: "c" },
      where: not(
        and(
          compare("c/name/value", "like", "Vital%"),
          compare("c/category/code", "matches", ["433", "451"]),
        ),
      ),
    };
    expect(serializeAql(q)).toBe(
      [
        "SELECT DISTINCT TOP 5 COUNT(c/uid/value)",
        "FROM COMPOSITION c",
        "WHERE NOT (c/name/value LIKE 'Vital%' AND c/category/code matches {'433', '451'})",
      ].join("\n"),
    );
  });
});

describe("collectParams", () => {
  it("returns the distinct structured $parameters", () => {
    expect(collectParams(vitalsQuery)).toEqual(["ehrId"]);
  });
});
