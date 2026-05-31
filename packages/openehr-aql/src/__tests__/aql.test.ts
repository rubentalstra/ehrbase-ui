import { describe, expect, it } from "vitest";

import {
  allVersions,
  and,
  type AqlQuery,
  collectParams,
  compare,
  compareFn,
  countDistinct,
  countStar,
  exists,
  fn,
  latestVersion,
  not,
  or,
  param,
  parseAql,
  path,
  serializeAql,
  SPEC_COMPONENT,
  SPEC_VERSION,
  tryParseAql,
  validateAql,
  versionAtTime,
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

describe("string escaping (CodeQL: complete escaping)", () => {
  it("escapes both backslashes and single quotes in literals", () => {
    const q: AqlQuery = {
      select: { columns: [{ path: "c/uid/value" }] },
      from: { rmType: "COMPOSITION", alias: "c" },
      where: compare("c/name/value", "=", "a\\b'c"),
    };
    // backslash → \\  and  ' → \'  (backslash escaped first)
    expect(serializeAql(q)).toContain("c/name/value = 'a\\\\b\\'c'");
  });

  it("round-trips escaped literals through the parser", () => {
    const q: AqlQuery = {
      select: { columns: [{ path: "c/uid/value" }] },
      from: { rmType: "COMPOSITION", alias: "c" },
      where: compare("c/name/value", "=", "a\\b'c"),
    };
    expect(parseAql(serializeAql(q))).toEqual(q);
  });
});

describe("collectParams", () => {
  it("returns the distinct structured $parameters", () => {
    expect(collectParams(vitalsQuery)).toEqual(["ehrId"]);
  });

  it("collects params nested inside functions and version predicates", () => {
    const q: AqlQuery = {
      select: { columns: [{ func: fn("CONCAT", path("p/family"), param("suffix")), alias: "x" }] },
      from: { rmType: "VERSION", alias: "v", version: versionAtTime(param("at")) },
      where: compareFn(fn("LENGTH", path("c/name/value")), ">", param("min")),
    };
    expect(collectParams(q).sort()).toEqual(["at", "min", "suffix"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Round-trip helper: both directions are the correctness gate.
//   serializeAql(parseAql(str))  normalises to the expected string
//   parseAql(serializeAql(ast))  deep-equals the ast
// ───────────────────────────────────────────────────────────────────────────
function expectRoundTrip(ast: AqlQuery): string {
  const str = serializeAql(ast);
  const reparsed = parseAql(str);
  expect(reparsed).toEqual(ast);
  expect(serializeAql(reparsed)).toBe(str);
  return str;
}

function expectStringRoundTrip(str: string): void {
  const ast = parseAql(str);
  expect(serializeAql(ast)).toBe(str);
}

describe("round-trip: existing builder fixtures", () => {
  it("the vitals CONTAINS-chain query round-trips both directions", () => {
    expectRoundTrip(vitalsQuery);
  });

  it("DISTINCT/TOP/aggregate/LIKE/matches/NOT round-trips both directions", () => {
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
    expectRoundTrip(q);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Catalogue corpus (docs/aql-catalogue.md). The doc lists the named queries the
// UI runs; here each is expressed as a concrete AQL statement (the form the BFF
// will store in src/lib/aql/catalogue.ts) and asserted to round-trip both ways.
// This is the real-world corpus the parser must handle.
// ───────────────────────────────────────────────────────────────────────────
const CATALOGUE: Record<string, string> = {
  // The doc's own schema example (vitals_latest_blood_pressure).
  vitals_latest_blood_pressure: [
    "SELECT bp/data[at0001]/events[at0006]",
    "FROM EHR[ehr_id/value=$ehr_id] CONTAINS COMPOSITION CONTAINS OBSERVATION bp[openEHR-EHR-OBSERVATION.blood_pressure.v2]",
  ].join("\n"),

  patient_summary_header: [
    "SELECT COUNT(e/uid/value) AS active_problems",
    "FROM EHR[ehr_id/value=$ehr_id] CONTAINS COMPOSITION CONTAINS EVALUATION e[openEHR-EHR-EVALUATION.problem_diagnosis.v1]",
  ].join("\n"),

  patient_encounters_recent: [
    "SELECT c/uid/value, c/context/start_time/value AS started",
    "FROM EHR[ehr_id/value=$ehr_id] CONTAINS COMPOSITION c[openEHR-EHR-COMPOSITION.encounter.v1]",
    "WHERE c/category/code = 'event'",
    "ORDER BY c/context/start_time/value DESC",
    "LIMIT 20",
  ].join("\n"),

  vitals_trend_blood_pressure: [
    "SELECT bp/data[at0001]/events[at0006]/data[at0003]/items[at0004]/value/magnitude AS systolic",
    "FROM EHR[ehr_id/value=$ehr_id] CONTAINS OBSERVATION bp[openEHR-EHR-OBSERVATION.blood_pressure.v2]",
    "ORDER BY bp/data[at0001]/events[at0006]/time/value DESC",
    "LIMIT 50",
  ].join("\n"),

  vitals_latest_pulse: [
    "SELECT o/data[at0002]/events[at0003]/data[at0001]/items[at0004]/value/magnitude AS rate",
    "FROM EHR[ehr_id/value=$ehr_id] CONTAINS OBSERVATION o[openEHR-EHR-OBSERVATION.pulse.v2]",
    "ORDER BY o/data[at0002]/events[at0003]/time/value DESC",
    "LIMIT 1",
  ].join("\n"),

  labs_recent_results: [
    "SELECT o/uid/value, o/data[at0001]/events[at0002]/data[at0003] AS result",
    "FROM EHR[ehr_id/value=$ehr_id] CONTAINS OBSERVATION o[openEHR-EHR-OBSERVATION.laboratory_test_result.v1]",
    "WHERE o/data[at0001]/events[at0002]/time/value >= $since",
    "ORDER BY o/data[at0001]/events[at0002]/time/value DESC",
    "LIMIT 100",
  ].join("\n"),

  labs_results_by_loinc: [
    "SELECT o/uid/value",
    "FROM EHR[ehr_id/value=$ehr_id] CONTAINS OBSERVATION o[openEHR-EHR-OBSERVATION.laboratory_test_result.v1]",
    "WHERE o/data[at0001]/events[at0002]/data[at0003]/items[at0005]/value/defining_code/code_string = $loinc_code AND o/data[at0001]/events[at0002]/time/value >= $since",
  ].join("\n"),

  notes_recent_compositions: [
    "SELECT c/uid/value, e/data[at0001]/items[at0002]/value/value AS synopsis",
    "FROM EHR[ehr_id/value=$ehr_id] CONTAINS COMPOSITION c CONTAINS EVALUATION e[openEHR-EHR-EVALUATION.clinical_synopsis.v1]",
    "WHERE c/category/code = 'event'",
    "ORDER BY c/context/start_time/value DESC",
    "LIMIT 20",
  ].join("\n"),

  problems_active: [
    "SELECT e/data[at0001]/items[at0002]/value/value AS problem",
    "FROM EHR[ehr_id/value=$ehr_id] CONTAINS EVALUATION e[openEHR-EHR-EVALUATION.problem_diagnosis.v1]",
    "WHERE e/data[at0001]/items[at0063]/value/defining_code/code_string = 'active'",
  ].join("\n"),

  problems_history: [
    "SELECT e/data[at0001]/items[at0002]/value/value AS problem, e/data[at0001]/items[at0077]/value/value AS onset",
    "FROM EHR[ehr_id/value=$ehr_id] CONTAINS EVALUATION e[openEHR-EHR-EVALUATION.problem_diagnosis.v1]",
    "ORDER BY e/data[at0001]/items[at0077]/value/value ASC",
  ].join("\n"),

  medications_active: [
    "SELECT i/uid/value",
    "FROM EHR[ehr_id/value=$ehr_id] CONTAINS INSTRUCTION i[openEHR-EHR-INSTRUCTION.medication_order.v3]",
    "WHERE NOT (EXISTS i/activities[at0001]/description[at0002]/items[at0012]/value)",
  ].join("\n"),

  medication_administrations_recent: [
    "SELECT a/uid/value, a/time/value AS administered",
    "FROM EHR[ehr_id/value=$ehr_id] CONTAINS ACTION a[openEHR-EHR-ACTION.medication.v1]",
    "ORDER BY a/time/value DESC",
    "LIMIT 50",
  ].join("\n"),

  allergies_active: [
    "SELECT e/data[at0001]/items[at0002]/value/value AS substance",
    "FROM EHR[ehr_id/value=$ehr_id] CONTAINS EVALUATION e[openEHR-EHR-EVALUATION.adverse_reaction_risk.v1]",
  ].join("\n"),

  immunisations_history: [
    "SELECT a/uid/value, a/description[at0001]/items[at0002]/value/value AS vaccine",
    "FROM EHR[ehr_id/value=$ehr_id] CONTAINS ACTION a[openEHR-EHR-ACTION.immunisation.v1]",
    "ORDER BY a/time/value DESC",
  ].join("\n"),

  orders_pending: [
    "SELECT i/uid/value",
    "FROM EHR[ehr_id/value=$ehr_id] CONTAINS COMPOSITION c CONTAINS INSTRUCTION i",
    "WHERE c/name/value = $order_type AND i/narrative/value = 'pending'",
  ].join("\n"),

  orders_recent_completed: [
    "SELECT i/uid/value, a/time/value AS completed",
    "FROM EHR[ehr_id/value=$ehr_id] CONTAINS (INSTRUCTION i AND ACTION a)",
    "ORDER BY a/time/value DESC",
    "LIMIT 50",
  ].join("\n"),

  care_plan_active_tasks: [
    "SELECT t/uid/value",
    "FROM EHR[ehr_id/value=$ehr_id] CONTAINS COMPOSITION c[openEHR-EHR-COMPOSITION.care_plan.v1] CONTAINS INSTRUCTION t[openEHR-EHR-INSTRUCTION.task.v1]",
    "WHERE t/activities[at0001]/action_archetype_id = $assignee",
  ].join("\n"),

  care_plan_tasks_overdue: [
    "SELECT t/uid/value",
    "FROM EHR[ehr_id/value=$ehr_id] CONTAINS INSTRUCTION t[openEHR-EHR-INSTRUCTION.task.v1]",
    "WHERE t/activities[at0001]/timing/value < NOW() AND t/narrative/value != 'done'",
  ].join("\n"),

  discharge_compositions_recent: [
    "SELECT c/uid/value, c/context/end_time/value AS discharged",
    "FROM EHR[ehr_id/value=$ehr_id] CONTAINS COMPOSITION c[openEHR-EHR-COMPOSITION.discharge_summary.v1]",
    "ORDER BY c/context/end_time/value DESC",
    "LIMIT 20",
  ].join("\n"),

  // VERSION / temporal: audit-trail style queries (data lineage).
  version_history_of_composition: [
    "SELECT v/commit_audit/time_committed/value AS committed_at",
    "FROM EHR[ehr_id/value=$ehr_id] CONTAINS VERSIONED_OBJECT vo CONTAINS VERSION v[ALL_VERSIONS]",
    "ORDER BY v/commit_audit/time_committed/value DESC",
  ].join("\n"),

  composition_as_of_time: [
    "SELECT c/uid/value",
    "FROM EHR[ehr_id/value=$ehr_id] CONTAINS VERSION v[version_at_time($at)] CONTAINS COMPOSITION c",
  ].join("\n"),
};

describe("round-trip: AQL catalogue corpus", () => {
  for (const [name, aql] of Object.entries(CATALOGUE)) {
    it(`'${name}' round-trips (string → ast → string)`, () => {
      expectStringRoundTrip(aql);
    });
    it(`'${name}' round-trips (ast → string → ast)`, () => {
      expect(parseAql(serializeAql(parseAql(aql)))).toEqual(parseAql(aql));
    });
  }

  it("covers every catalogue entry", () => {
    // 20 distinct named queries exercised above.
    expect(Object.keys(CATALOGUE).length).toBeGreaterThanOrEqual(20);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// VERSION / temporal build → serialize → parse.
// ───────────────────────────────────────────────────────────────────────────
describe("VERSION / temporal expressions", () => {
  it("LATEST_VERSION containment", () => {
    const q: AqlQuery = {
      select: { columns: [{ path: "v/uid/value" }] },
      from: {
        rmType: "EHR",
        alias: "e",
        contains: {
          items: [
            { rmType: "VERSIONED_OBJECT", alias: "vo", contains: { items: [{ rmType: "VERSION", alias: "v", version: latestVersion() }] } },
          ],
        },
      },
    };
    expect(serializeAql(q)).toContain("CONTAINS VERSION v[LATEST_VERSION]");
    expectRoundTrip(q);
  });

  it("ALL_VERSIONS containment", () => {
    const q: AqlQuery = {
      select: { columns: [{ path: "v/uid/value" }] },
      from: { rmType: "VERSION", alias: "v", version: allVersions() },
    };
    expect(serializeAql(q)).toContain("VERSION v[ALL_VERSIONS]");
    expectRoundTrip(q);
  });

  it("version_at_time with a $param", () => {
    const q: AqlQuery = {
      select: { columns: [{ path: "v/data" }] },
      from: { rmType: "VERSION", alias: "v", version: versionAtTime(param("at")) },
    };
    expect(serializeAql(q)).toContain("VERSION v[version_at_time($at)]");
    expectRoundTrip(q);
  });

  it("version_at_time with an ISO literal", () => {
    const q: AqlQuery = {
      select: { columns: [{ path: "v/data" }] },
      from: { rmType: "VERSION", alias: "v", version: versionAtTime("2024-01-01T00:00:00Z") },
    };
    expect(serializeAql(q)).toContain("version_at_time('2024-01-01T00:00:00Z')");
    expectRoundTrip(q);
  });

  it("archetype + version predicate combine inside one bracket", () => {
    const q: AqlQuery = {
      select: { columns: [{ path: "c/uid/value" }] },
      from: { rmType: "COMPOSITION", alias: "c", archetypeId: "openEHR-EHR-COMPOSITION.encounter.v1", version: latestVersion() },
    };
    expect(serializeAql(q)).toContain("COMPOSITION c[openEHR-EHR-COMPOSITION.encounter.v1 and LATEST_VERSION]");
    expectRoundTrip(q);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// FUNCTION expressions build → serialize → parse.
// ───────────────────────────────────────────────────────────────────────────
describe("function expressions", () => {
  it("COUNT(*) and COUNT(DISTINCT path)", () => {
    const q: AqlQuery = {
      select: { columns: [{ func: countStar(), alias: "n" }, { func: countDistinct(path("c/uid/value")), alias: "d" }] },
      from: { rmType: "COMPOSITION", alias: "c" },
    };
    expect(serializeAql(q)).toContain("COUNT(*) AS n, COUNT(DISTINCT c/uid/value) AS d");
    expectRoundTrip(q);
  });

  it("nested numeric/aggregate function in SELECT", () => {
    const q: AqlQuery = {
      select: { columns: [{ func: fn("ROUND", fn("AVG", path("o/value/magnitude")), 1), alias: "avg_mag" }] },
      from: { rmType: "OBSERVATION", alias: "o" },
    };
    expect(serializeAql(q)).toContain("ROUND(AVG(o/value/magnitude), 1) AS avg_mag");
    expectRoundTrip(q);
  });

  it("string function with mixed path + literal args", () => {
    const q: AqlQuery = {
      select: { columns: [{ func: fn("CONCAT", path("p/firstnames"), "' '", path("p/family")), alias: "full" }] },
      from: { rmType: "PERSON", alias: "p" },
    };
    expectRoundTrip(q);
  });

  it("date function (nullary) in SELECT and WHERE", () => {
    const q: AqlQuery = {
      select: { columns: [{ func: fn("NOW"), alias: "now" }] },
      from: { rmType: "COMPOSITION", alias: "c" },
      where: compare("c/context/start_time/value", "<", fn("CURRENT_DATE_TIME")),
    };
    expect(serializeAql(q)).toContain("NOW() AS now");
    expect(serializeAql(q)).toContain("c/context/start_time/value < CURRENT_DATE_TIME()");
    expectRoundTrip(q);
  });

  it("function on the left of a WHERE comparison", () => {
    const q: AqlQuery = {
      select: { columns: [{ path: "c/uid/value" }] },
      from: { rmType: "COMPOSITION", alias: "c" },
      where: compareFn(fn("LENGTH", path("c/name/value")), ">", 3),
    };
    expect(serializeAql(q)).toContain("WHERE LENGTH(c/name/value) > 3");
    expectRoundTrip(q);
  });

  it("TERMINOLOGY function inside a SELECT projection", () => {
    const q: AqlQuery = {
      select: { columns: [{ func: fn("TERMINOLOGY", "'expand'", "'hl7.org/fhir/ValueSet'", "'url=...'"), alias: "vs" }] },
      from: { rmType: "COMPOSITION", alias: "c" },
    };
    expectRoundTrip(q);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Containment operators: AND/OR groups, NOT CONTAINS, EXISTS.
// ───────────────────────────────────────────────────────────────────────────
describe("containment + boolean structure", () => {
  it("OR containment group", () => {
    const q: AqlQuery = {
      select: { columns: [{ path: "e/uid/value" }] },
      from: { rmType: "EHR", alias: "e", contains: { op: "OR", items: [{ rmType: "OBSERVATION", alias: "o" }, { rmType: "EVALUATION", alias: "ev" }] } },
    };
    expect(serializeAql(q)).toContain("CONTAINS (OBSERVATION o OR EVALUATION ev)");
    expectRoundTrip(q);
  });

  it("NOT CONTAINS", () => {
    const q: AqlQuery = {
      select: { columns: [{ path: "c/uid/value" }] },
      from: { rmType: "COMPOSITION", alias: "c", contains: { negated: true, items: [{ rmType: "ACTION", alias: "a" }] } },
    };
    expect(serializeAql(q)).toContain("COMPOSITION c NOT CONTAINS ACTION a");
    expectRoundTrip(q);
  });

  it("EXISTS and OR in WHERE, plus FETCH", () => {
    const q: AqlQuery = {
      select: { columns: [{ path: "c/uid/value" }] },
      from: { rmType: "COMPOSITION", alias: "c" },
      where: or(exists("c/context/other_context"), compare("c/name/value", "=", "X")),
      fetch: 25,
    };
    expect(serializeAql(q)).toContain("FETCH 25");
    expectRoundTrip(q);
  });

  it("boolean and numeric literal values", () => {
    const q: AqlQuery = {
      select: { columns: [{ path: "o/uid/value" }] },
      from: { rmType: "OBSERVATION", alias: "o" },
      where: and(compare("o/data/items/value/value", "=", true), compare("o/data/items/value/magnitude", ">=", 12.5)),
    };
    expectRoundTrip(q);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// tryParseAql diagnostics.
// ───────────────────────────────────────────────────────────────────────────
describe("tryParseAql", () => {
  it("returns ok for a valid query", () => {
    const res = tryParseAql("SELECT c/uid/value FROM COMPOSITION c");
    expect(res.ok).toBe(true);
  });

  it("returns positioned diagnostics for a malformed query", () => {
    const res = tryParseAql("SELECT c/uid/value FORM COMPOSITION c");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0]?.message).toContain("FROM");
      expect(res.errors[0]?.position).toBeGreaterThan(0);
    }
  });

  it("reports an unterminated string literal", () => {
    const res = tryParseAql("SELECT c/uid/value FROM COMPOSITION c WHERE c/name/value = 'oops");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]?.message).toContain("Unterminated string");
  });

  it("accepts the lenient unparenthesised NOT EXISTS form (serializer normalises to parens)", () => {
    const lenient = "SELECT c/uid/value FROM COMPOSITION c WHERE NOT EXISTS c/context/other_context";
    const ast = parseAql(lenient);
    expect(serializeAql(ast)).toContain("WHERE NOT (EXISTS c/context/other_context)");
  });

  it("is case-insensitive for keywords", () => {
    const ast = parseAql("select c/uid/value from COMPOSITION c where c/name/value = 'X' limit 5");
    expect(ast.limit).toBe(5);
    expect(ast.select.columns[0]?.path).toBe("c/uid/value");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// validateAql — identifier-level diagnostics.
// ───────────────────────────────────────────────────────────────────────────
describe("validateAql", () => {
  it("a good query produces no errors", () => {
    const diags = validateAql(vitalsQuery, { boundParams: ["ehrId"] });
    expect(diags.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("flags an unknown RM class in FROM", () => {
    const q: AqlQuery = { select: { columns: [{ path: "x/uid/value" }] }, from: { rmType: "NONSENSE", alias: "x" } };
    const diags = validateAql(q);
    expect(diags.some((d) => d.severity === "error" && d.message.includes("NONSENSE"))).toBe(true);
  });

  it("flags a malformed archetype id", () => {
    const q: AqlQuery = {
      select: { columns: [{ path: "c/uid/value" }] },
      from: { rmType: "COMPOSITION", alias: "c", archetypeId: "not-an-archetype-id" },
    };
    const diags = validateAql(q);
    expect(diags.some((d) => d.severity === "error" && d.message.includes("Malformed archetype id"))).toBe(true);
  });

  it("flags an archetype id whose RM class segment is not a real RM class", () => {
    const q: AqlQuery = {
      select: { columns: [{ path: "x/uid/value" }] },
      from: { rmType: "OBSERVATION", alias: "x", archetypeId: "openEHR-EHR-BOGUSCLASS.blood_pressure.v2" },
    };
    const diags = validateAql(q);
    expect(diags.some((d) => d.severity === "error" && d.message.includes("unknown RM class 'BOGUSCLASS'"))).toBe(true);
  });

  it("flags an invalid node code embedded in a path", () => {
    const q: AqlQuery = {
      select: { columns: [{ path: "o/data[at00X1]/value" }] },
      from: { rmType: "OBSERVATION", alias: "o" },
    };
    const diags = validateAql(q);
    expect(diags.some((d) => d.severity === "error" && d.message.includes("node code"))).toBe(true);
  });

  it("flags an unresolved $param", () => {
    const diags = validateAql(vitalsQuery, { boundParams: ["wrongName"] });
    expect(diags.some((d) => d.severity === "error" && d.message.includes("Unresolved parameter '$ehrId'"))).toBe(true);
  });

  it("warns about a bound-but-unused $param", () => {
    const diags = validateAql(vitalsQuery, { boundParams: ["ehrId", "extra"] });
    expect(diags.some((d) => d.severity === "warning" && d.message.includes("'$extra'"))).toBe(true);
  });

  it("accepts a string input and parses it before validating", () => {
    const diags = validateAql("SELECT c/uid/value FROM COMPOSITION c", { boundParams: [] });
    expect(diags.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("surfaces a parse error as a diagnostic when given a bad string", () => {
    const diags = validateAql("SELECT FROM");
    expect(diags.some((d) => d.severity === "error" && d.message.startsWith("Parse error"))).toBe(true);
  });

  it("validates archetype ids and node codes embedded in catalogue strings", () => {
    expect(validateAql(CATALOGUE.vitals_latest_blood_pressure ?? "", { boundParams: ["ehr_id"] }).filter((d) => d.severity === "error")).toEqual([]);
  });

  // Regression: identifier extraction must stay linear-time on adversarial
  // input. The old unanchored global archetype-id scan was quadratic — a long
  // run of identifier characters with a near-match prefix made it re-backtrack
  // at every offset (CodeQL js/polynomial-redos). A pathological 100k-char path
  // must validate in well under a second.
  it("does not blow up on a pathological identifier run (ReDoS guard)", () => {
    const evil = `A-A-A.${"a".repeat(100_000)}`;
    const q: AqlQuery = {
      select: { columns: [{ path: evil }] },
      from: { rmType: "OBSERVATION", alias: "o" },
    };
    const start = Date.now();
    validateAql(q);
    expect(Date.now() - start).toBeLessThan(500);
  });
});
