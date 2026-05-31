// FhirTerminologyProvider — the shared FHIR R4 Terminology Service adapter both
// concrete adapters build on (ADR-0034). The generic-FHIR adapter uses it as-is;
// the Snowstorm adapter subclasses it to inject `_displayLanguage` + advertise
// the SNOMED-ECL capability. Mirrors the FhirDemographicProvider shape
// (ADR-0033): a thin client + canonical mapping behind the interface.
//
// Terminology is NOT PHI (ADR-0034) — no audit, no pseudonymisation here.

import { FhirTerminologyClient, type FetchLike } from "./fhir-client.ts";
import {
  CodedOptionSchema,
  type CodedOption,
  type Designation,
  type ExpandResult,
  type ExpandValueSetInput,
  type LookupInput,
  type LookupResult,
  type TerminologyProvider,
  type TerminologyProviderCapabilities,
  type ValidateCodeInput,
} from "./provider.ts";
import type { FhirParametersParameter } from "./fhir-types.ts";

export interface FhirTerminologyConfig {
  baseUrl: string;
  token?: string;
  fetch?: FetchLike;
  /** Default display language sent on every op (BCP-47). */
  defaultDisplayLanguage?: string;
}

// Hook the subclass overrides to add server-specific query params (Snowstorm
// `_displayLanguage`) without re-implementing the operation bodies.
export class FhirTerminologyProvider implements TerminologyProvider {
  readonly name: string = "generic-fhir";
  readonly capabilities: TerminologyProviderCapabilities;

  protected readonly client: FhirTerminologyClient;
  protected readonly defaultDisplayLanguage?: string;

  constructor(config: FhirTerminologyConfig) {
    this.client = new FhirTerminologyClient({
      baseUrl: config.baseUrl,
      token: config.token,
      fetch: config.fetch,
    });
    this.defaultDisplayLanguage = config.defaultDisplayLanguage;
    this.capabilities = this.buildCapabilities();
  }

  protected buildCapabilities(): TerminologyProviderCapabilities {
    // A generic R4 server is assumed to support the three core ops; SNOMED-ECL
    // is NOT assumed (most generic servers don't — ADR-0034 verification note).
    return {
      configured: true,
      supportsExpand: true,
      supportsValidate: true,
      supportsLookup: true,
      supportsSnomedEcl: false,
      locales: this.defaultDisplayLanguage ? [this.defaultDisplayLanguage] : [],
    };
  }

  /** Subclass seam: append server-specific params (e.g. `_displayLanguage`). */
  protected decorateExpandParams(params: URLSearchParams, displayLanguage?: string): void {
    void params;
    void displayLanguage;
  }

  protected resolveDisplayLanguage(requested?: string): string | undefined {
    return requested ?? this.defaultDisplayLanguage;
  }

  async expandValueSet(input: ExpandValueSetInput): Promise<ExpandResult> {
    const params = new URLSearchParams();
    if (input.url !== undefined) params.set("url", input.url);
    if (input.system !== undefined) params.set("system", input.system);
    if (input.filter !== undefined && input.filter.length > 0) params.set("filter", input.filter);
    params.set("count", String(input.count));
    params.set("offset", String(input.offset));
    this.decorateExpandParams(params, this.resolveDisplayLanguage(input.displayLanguage));

    const vs = await this.client.expand(params);
    if (vs === null) return { options: [], total: 0 };
    const contains = vs.expansion?.contains ?? [];
    const options: CodedOption[] = [];
    for (const c of contains) {
      // Drop entries missing a code/system — they cannot become a DV_CODED_TEXT.
      const parsed = CodedOptionSchema.safeParse({
        system: c.system,
        code: c.code,
        display: c.display ?? c.code,
      });
      if (parsed.success) options.push(parsed.data);
    }
    return { options, total: vs.expansion?.total ?? options.length };
  }

  async lookup(input: LookupInput): Promise<LookupResult> {
    const params = new URLSearchParams({ system: input.system, code: input.code });
    const lang = this.resolveDisplayLanguage(input.displayLanguage);
    if (lang !== undefined) params.set("displayLanguage", lang);

    const result = await this.client.lookup(params);
    const parameters = result?.parameter ?? [];
    const display = findStringParam(parameters, "display") ?? input.code;
    const designations: Designation[] = [];
    for (const p of parameters) {
      if (p.name !== "designation" || p.part === undefined) continue;
      const value = findStringParam(p.part, "value");
      if (value === undefined) continue;
      designations.push({ language: findStringParam(p.part, "language"), value });
    }
    return { display, designations };
  }

  async validateCode(input: ValidateCodeInput): Promise<boolean> {
    const params = new URLSearchParams({ code: input.code });
    if (input.valueSetUrl !== undefined) params.set("url", input.valueSetUrl);
    if (input.system !== undefined) params.set("system", input.system);
    const lang = this.resolveDisplayLanguage(input.displayLanguage);
    if (lang !== undefined) params.set("displayLanguage", lang);

    const result = await this.client.validateCode(params);
    return findBooleanParam(result?.parameter ?? [], "result") ?? false;
  }
}

// ── Parameters helpers (no `as` — narrow by the present optional field) ────────
function findStringParam(
  parameters: readonly FhirParametersParameter[],
  name: string,
): string | undefined {
  return parameters.find((p) => p.name === name && p.valueString !== undefined)?.valueString;
}

function findBooleanParam(
  parameters: readonly FhirParametersParameter[],
  name: string,
): boolean | undefined {
  return parameters.find((p) => p.name === name && p.valueBoolean !== undefined)?.valueBoolean;
}
