// In-memory FHIR R4 server — a deterministic test double of the subset of the
// REST API the adapter exercises: Patient (create / read / vread / update /
// history / search) + RelatedPerson (create / read / update). Lets the contract
// suite + mapping tests run in-process, no Docker. The live HAPI server
// (docker-compose `fhir` profile) is the belt-and-braces integration check.

import type { FetchLike } from "./client.ts";
import {
  FhirPatientSchema,
  FhirRelatedPersonSchema,
  type FhirPatient,
  type FhirRelatedPerson,
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

function meta(version: number): { versionId: string; lastUpdated: string } {
  return { versionId: String(version), lastUpdated: `2026-01-0${Math.min(version, 9)}T00:00:00Z` };
}

export interface InMemoryFhirServer {
  fetch: FetchLike;
  reset(): void;
}

export function createInMemoryFhirServer(): InMemoryFhirServer {
  const patients = new Map<string, FhirPatient[]>(); // id → versions (last = current)
  const relatedPersons = new Map<string, FhirRelatedPerson>();
  let patientSeq = 0;
  let relSeq = 0;

  function patientMatches(patient: FhirPatient, params: URLSearchParams): boolean {
    if (params.get("active") === "true" && patient.active === false) return false;
    const identifier = params.get("identifier");
    if (identifier) {
      const [system, value] = identifier.split("|");
      if (!(patient.identifier ?? []).some((i) => i.system === system && i.value === value)) return false;
    }
    const family = params.get("family");
    if (family && !(patient.name ?? []).some((n) => n.family === family)) return false;
    const given = params.get("given");
    if (given && !(patient.name ?? []).some((n) => (n.given ?? []).includes(given))) return false;
    const birthdate = params.get("birthdate");
    if (birthdate && patient.birthDate !== birthdate) return false;
    return true;
  }

  function handlePatient(method: string, url: URL, id: string | undefined, body: unknown): Response {
    const segments = url.pathname.split("/").filter(Boolean);
    const pIdx = segments.indexOf("Patient");
    const isHistory = segments[pIdx + 2] === "_history";
    const versionId = segments[pIdx + 3];

    if (method === "POST" && id === undefined) {
      patientSeq += 1;
      const newId = `pat-${patientSeq}`;
      const stored: FhirPatient = { ...FhirPatientSchema.parse(body), id: newId, meta: meta(1) };
      patients.set(newId, [stored]);
      return ok(stored, 201);
    }
    if (method === "GET" && id === undefined) {
      const all = [...patients.values()].map((v) => v[v.length - 1]);
      const hits = all.filter((p): p is FhirPatient => p !== undefined && patientMatches(p, url.searchParams));
      return ok({ resourceType: "Bundle", type: "searchset", total: hits.length, entry: hits.map((r) => ({ resource: r })) });
    }
    if (id === undefined) return notFound();

    const rec = patients.get(id);
    if (method === "GET" && isHistory && versionId === undefined) {
      if (!rec) return notFound();
      return ok({ resourceType: "Bundle", type: "history", total: rec.length, entry: [...rec].reverse().map((r) => ({ resource: r })) });
    }
    if (method === "GET" && isHistory && versionId !== undefined) {
      const v = rec?.[Number.parseInt(versionId, 10) - 1];
      return v ? ok(v) : notFound();
    }
    if (method === "GET") {
      const cur = rec?.[rec.length - 1];
      return cur ? ok(cur) : notFound();
    }
    if (method === "PUT") {
      if (!rec) return notFound();
      const next: FhirPatient = { ...FhirPatientSchema.parse(body), id, meta: meta(rec.length + 1) };
      rec.push(next);
      return ok(next);
    }
    return notFound();
  }

  function handleRelatedPerson(method: string, id: string | undefined, body: unknown): Response {
    if (method === "POST" && id === undefined) {
      relSeq += 1;
      const newId = `rp-${relSeq}`;
      const stored: FhirRelatedPerson = { ...FhirRelatedPersonSchema.parse(body), id: newId, meta: meta(1) };
      relatedPersons.set(newId, stored);
      return ok(stored, 201);
    }
    if (id === undefined) return notFound();
    if (method === "GET") {
      const cur = relatedPersons.get(id);
      return cur ? ok(cur) : notFound();
    }
    if (method === "PUT") {
      if (!relatedPersons.has(id)) return notFound();
      const next: FhirRelatedPerson = { ...FhirRelatedPersonSchema.parse(body), id, meta: meta(2) };
      relatedPersons.set(id, next);
      return ok(next);
    }
    return notFound();
  }

  function handle(input: string, init?: RequestInit): Response {
    const method = init?.method ?? "GET";
    const url = new URL(input);
    const segments = url.pathname.split("/").filter(Boolean);
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

    if (segments.includes("RelatedPerson")) {
      const idx = segments.indexOf("RelatedPerson");
      return handleRelatedPerson(method, segments[idx + 1], body);
    }
    if (segments.includes("Patient")) {
      const idx = segments.indexOf("Patient");
      return handlePatient(method, url, segments[idx + 1], body);
    }
    return notFound();
  }

  return {
    fetch: (input, init) => Promise.resolve(handle(input, init)),
    reset: () => {
      patients.clear();
      relatedPersons.clear();
    },
  };
}
