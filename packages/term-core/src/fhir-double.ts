// In-memory FHIR R4 Terminology Service double — a deterministic test double of
// the subset of the REST API the adapters exercise: ValueSet/$expand,
// CodeSystem/$lookup, ValueSet/$validate-code. Lets the contract suite + adapter
// tests run in-process, no Docker. The live HAPI/Ontoserver server (docker-compose
// `terminology` profile, see term-adapter-snowstorm README note) is the
// belt-and-braces integration check (same in-memory-double pattern the
// demographic contract suite uses).

import type { FetchLike } from "./fhir-client.ts";
import {
  FhirParametersSchema,
  FhirValueSetSchema,
  type FhirParameters,
  type FhirValueSet,
} from "./fhir-types.ts";

const JSON_HEADERS = { "content-type": "application/fhir+json" };

function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
function notFound(): Response {
  return new Response(JSON.stringify({ resourceType: "OperationOutcome" }), {
    status: 404,
    headers: JSON_HEADERS,
  });
}

/** A concept seeded into the double. `valueSets` lists the ValueSet URLs it is a member of. */
export interface SeedConcept {
  system: string;
  code: string;
  display: string;
  valueSets?: string[];
  designations?: { language?: string; value: string }[];
}

export interface InMemoryFhirTerminologyServer {
  fetch: FetchLike;
  reset(): void;
}

export const SNOMED_SYSTEM = "http://snomed.info/sct";

/**
 * A small SNOMED-shaped seed (real codes) used by the contract + adapter suites.
 * VALUESET_URL binds a subset; the rest are reachable via system expansion.
 */
export const SAMPLE_VALUESET_URL = "http://ehrbase-ui.test/fhir/ValueSet/clinical-finding";

export const SAMPLE_CONCEPTS: SeedConcept[] = [
  {
    system: SNOMED_SYSTEM,
    code: "38341003",
    display: "Hypertensive disorder",
    valueSets: [SAMPLE_VALUESET_URL],
    designations: [{ language: "nl", value: "Hypertensie" }],
  },
  {
    system: SNOMED_SYSTEM,
    code: "73211009",
    display: "Diabetes mellitus",
    valueSets: [SAMPLE_VALUESET_URL],
  },
  {
    system: SNOMED_SYSTEM,
    code: "195967001",
    display: "Asthma",
    valueSets: [SAMPLE_VALUESET_URL],
  },
];

export function createInMemoryFhirTerminologyServer(
  concepts: SeedConcept[] = SAMPLE_CONCEPTS,
): InMemoryFhirTerminologyServer {
  let store: SeedConcept[] = [...concepts];

  function matchesFilter(c: SeedConcept, filter: string | null): boolean {
    if (!filter) return true;
    const needle = filter.toLowerCase();
    return c.display.toLowerCase().includes(needle) || c.code.includes(needle);
  }

  function handleExpand(url: URL): Response {
    const vsUrl = url.searchParams.get("url");
    const system = url.searchParams.get("system");
    const filter = url.searchParams.get("filter");
    const count = Number.parseInt(url.searchParams.get("count") ?? "20", 10);
    const offset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);

    // An unknown ValueSet URL → 404 so the adapter maps it to an empty expansion.
    if (vsUrl !== null && !store.some((c) => (c.valueSets ?? []).includes(vsUrl))) {
      return notFound();
    }

    const matched = store
      .filter((c) => (vsUrl === null ? true : (c.valueSets ?? []).includes(vsUrl)))
      .filter((c) => (system === null ? true : c.system === system))
      .filter((c) => matchesFilter(c, filter));

    const page = matched.slice(offset, offset + count);
    const vs: FhirValueSet = {
      resourceType: "ValueSet",
      expansion: {
        total: matched.length,
        offset,
        contains: page.map((c) => ({ system: c.system, code: c.code, display: c.display })),
      },
    };
    return ok(FhirValueSetSchema.parse(vs));
  }

  function handleLookup(url: URL): Response {
    const system = url.searchParams.get("system");
    const code = url.searchParams.get("code");
    const hit = store.find((c) => c.system === system && c.code === code);
    if (!hit) return notFound();
    const params: FhirParameters = {
      resourceType: "Parameters",
      parameter: [
        { name: "display", valueString: hit.display },
        { name: "system", valueString: hit.system },
        ...(hit.designations ?? []).map((d) => ({
          name: "designation",
          part: [
            ...(d.language !== undefined
              ? [{ name: "language", valueCode: d.language, valueString: d.language }]
              : []),
            { name: "value", valueString: d.value },
          ],
        })),
      ],
    };
    return ok(FhirParametersSchema.parse(params));
  }

  function handleValidateCode(url: URL): Response {
    const vsUrl = url.searchParams.get("url");
    const system = url.searchParams.get("system");
    const code = url.searchParams.get("code");
    const isMember = store.some((c) => {
      if (c.code !== code) return false;
      if (vsUrl !== null) return (c.valueSets ?? []).includes(vsUrl);
      if (system !== null) return c.system === system;
      return false;
    });
    const params: FhirParameters = {
      resourceType: "Parameters",
      parameter: [{ name: "result", valueBoolean: isMember }],
    };
    return ok(FhirParametersSchema.parse(params));
  }

  function handle(input: string): Response {
    const url = new URL(input);
    const path = url.pathname;
    if (path.endsWith("/ValueSet/$expand")) return handleExpand(url);
    if (path.endsWith("/CodeSystem/$lookup")) return handleLookup(url);
    if (path.endsWith("/ValueSet/$validate-code")) return handleValidateCode(url);
    return notFound();
  }

  return {
    fetch: (input) => Promise.resolve(handle(input)),
    reset: () => {
      store = [...concepts];
    },
  };
}
