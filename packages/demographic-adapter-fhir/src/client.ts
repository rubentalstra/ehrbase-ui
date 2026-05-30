// Thin FHIR R4 REST client for the Patient resource (ADR-0033). `fetch` is
// injectable so the contract suite drives a deterministic in-memory double and
// prod uses the global fetch. All responses are Zod-validated (fhir-types.ts)
// before returning — no unvalidated clinical data crosses the boundary (§15).

import {
  FhirBundleSchema,
  FhirPatientSchema,
  FhirRelatedPersonSchema,
  type FhirBundle,
  type FhirPatient,
  type FhirRelatedPerson,
} from "./fhir-types.ts";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface FhirClientConfig {
  baseUrl: string;
  token?: string;
  fetch?: FetchLike;
}

const FHIR_JSON = "application/fhir+json";

export class FhirHttpClient {
  readonly #baseUrl: string;
  readonly #token?: string;
  readonly #fetch: FetchLike;

  constructor(config: FhirClientConfig) {
    this.#baseUrl = config.baseUrl.replace(/\/+$/u, "");
    this.#token = config.token;
    this.#fetch = config.fetch ?? ((input, init) => fetch(input, init));
  }

  #headers(withBody: boolean): Record<string, string> {
    const h: Record<string, string> = { accept: FHIR_JSON };
    if (withBody) h["content-type"] = FHIR_JSON;
    if (this.#token) h["authorization"] = `Bearer ${this.#token}`;
    return h;
  }

  async #send(path: string, init: RequestInit, withBody: boolean): Promise<Response> {
    return this.#fetch(`${this.#baseUrl}${path}`, {
      ...init,
      headers: { ...this.#headers(withBody), ...(init.headers ?? {}) },
    });
  }

  async create(patient: FhirPatient): Promise<FhirPatient> {
    const res = await this.#send("/Patient", { method: "POST", body: JSON.stringify(patient) }, true);
    if (!res.ok) throw new Error(`FHIR create failed: ${res.status}`);
    return FhirPatientSchema.parse(await res.json());
  }

  async read(id: string): Promise<FhirPatient | null> {
    const res = await this.#send(`/Patient/${encodeURIComponent(id)}`, { method: "GET" }, false);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`FHIR read failed: ${res.status}`);
    return FhirPatientSchema.parse(await res.json());
  }

  async vread(id: string, versionId: string): Promise<FhirPatient | null> {
    const res = await this.#send(
      `/Patient/${encodeURIComponent(id)}/_history/${encodeURIComponent(versionId)}`,
      { method: "GET" },
      false,
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`FHIR vread failed: ${res.status}`);
    return FhirPatientSchema.parse(await res.json());
  }

  async update(id: string, patient: FhirPatient): Promise<FhirPatient> {
    const res = await this.#send(
      `/Patient/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify(patient) },
      true,
    );
    if (!res.ok) throw new Error(`FHIR update failed: ${res.status}`);
    return FhirPatientSchema.parse(await res.json());
  }

  async history(id: string): Promise<FhirBundle> {
    const res = await this.#send(`/Patient/${encodeURIComponent(id)}/_history`, { method: "GET" }, false);
    if (!res.ok) throw new Error(`FHIR history failed: ${res.status}`);
    return FhirBundleSchema.parse(await res.json());
  }

  async search(params: Record<string, string>): Promise<FhirBundle> {
    const qs = new URLSearchParams(params).toString();
    const res = await this.#send(`/Patient?${qs}`, { method: "GET" }, false);
    if (!res.ok) throw new Error(`FHIR search failed: ${res.status}`);
    return FhirBundleSchema.parse(await res.json());
  }

  // ── RelatedPerson (PARTY_RELATIONSHIP) ──────────────────────────────────────
  async createRelatedPerson(rp: FhirRelatedPerson): Promise<FhirRelatedPerson> {
    const res = await this.#send("/RelatedPerson", { method: "POST", body: JSON.stringify(rp) }, true);
    if (!res.ok) throw new Error(`FHIR RelatedPerson create failed: ${res.status}`);
    return FhirRelatedPersonSchema.parse(await res.json());
  }

  async readRelatedPerson(id: string): Promise<FhirRelatedPerson | null> {
    const res = await this.#send(`/RelatedPerson/${encodeURIComponent(id)}`, { method: "GET" }, false);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`FHIR RelatedPerson read failed: ${res.status}`);
    return FhirRelatedPersonSchema.parse(await res.json());
  }

  async updateRelatedPerson(id: string, rp: FhirRelatedPerson): Promise<FhirRelatedPerson> {
    const res = await this.#send(
      `/RelatedPerson/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify(rp) },
      true,
    );
    if (!res.ok) throw new Error(`FHIR RelatedPerson update failed: ${res.status}`);
    return FhirRelatedPersonSchema.parse(await res.json());
  }
}
