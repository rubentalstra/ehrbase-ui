// Thin FHIR R4 Terminology Service REST client (ADR-0034). `fetch` is injectable
// so the contract suite drives a deterministic in-memory double and prod uses the
// global fetch (a thin REST client over fetch, no FHIR SDK). All
// responses are Zod-validated (fhir-types.ts) before returning (§15).
//
// Exposes the three GET operations the F2 scope needs: ValueSet/$expand,
// CodeSystem/$lookup, ValueSet/$validate-code. Adapters layer server-specific
// parameters (Snowstorm `_displayLanguage`) on top via the `extraParams` arg.

import {
  FhirParametersSchema,
  FhirValueSetSchema,
  type FhirParameters,
  type FhirValueSet,
} from "./fhir-types.ts";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface FhirTerminologyClientConfig {
  baseUrl: string;
  token?: string;
  fetch?: FetchLike;
}

const FHIR_JSON = "application/fhir+json";

// Strip trailing slashes without a regex — a linear scan avoids the
// polynomial-ReDoS hazard CodeQL flags for `/\/+$/` on slash-heavy input
// (a linear scan, not a slash-heavy regex).
function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47 /* '/' */) end -= 1;
  return value.slice(0, end);
}

export class FhirTerminologyClient {
  readonly #baseUrl: string;
  readonly #token?: string;
  readonly #fetch: FetchLike;

  constructor(config: FhirTerminologyClientConfig) {
    this.#baseUrl = stripTrailingSlashes(config.baseUrl);
    this.#token = config.token;
    this.#fetch = config.fetch ?? ((input, init) => fetch(input, init));
  }

  #headers(): Record<string, string> {
    const h: Record<string, string> = { accept: FHIR_JSON };
    if (this.#token) h["authorization"] = `Bearer ${this.#token}`;
    return h;
  }

  async #get(path: string): Promise<Response> {
    return this.#fetch(`${this.#baseUrl}${path}`, { method: "GET", headers: this.#headers() });
  }

  // ValueSet/$expand — query params drive the expansion. Returns null on 404 so
  // the adapter can map a missing value set to an empty expansion.
  async expand(params: URLSearchParams): Promise<FhirValueSet | null> {
    const res = await this.#get(`/ValueSet/$expand?${params.toString()}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`FHIR $expand failed: ${res.status}`);
    return FhirValueSetSchema.parse(await res.json());
  }

  async lookup(params: URLSearchParams): Promise<FhirParameters | null> {
    const res = await this.#get(`/CodeSystem/$lookup?${params.toString()}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`FHIR $lookup failed: ${res.status}`);
    return FhirParametersSchema.parse(await res.json());
  }

  async validateCode(params: URLSearchParams): Promise<FhirParameters | null> {
    const res = await this.#get(`/ValueSet/$validate-code?${params.toString()}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`FHIR $validate-code failed: ${res.status}`);
    return FhirParametersSchema.parse(await res.json());
  }
}
