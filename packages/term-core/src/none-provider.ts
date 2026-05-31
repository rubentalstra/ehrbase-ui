// NoneTerminologyProvider — the unconfigured default (TERMINOLOGY_PROVIDER=none,
// ADR-0034). Returns empty results and advertises `configured:false` so the UI
// degrades the external-binding picker to a plain text field with a "terminology
// not configured" hint (graceful degradation; never a hard error).

import {
  type ExpandResult,
  type ExpandValueSetInput,
  type LookupInput,
  type LookupResult,
  type TerminologyProvider,
  type TerminologyProviderCapabilities,
  type ValidateCodeInput,
} from "./provider.ts";

export class NoneTerminologyProvider implements TerminologyProvider {
  readonly name = "none";
  readonly capabilities: TerminologyProviderCapabilities = {
    configured: false,
    supportsExpand: false,
    supportsValidate: false,
    supportsLookup: false,
    supportsSnomedEcl: false,
    locales: [],
  };

  expandValueSet(_input: ExpandValueSetInput): Promise<ExpandResult> {
    void _input;
    return Promise.resolve({ options: [], total: 0 });
  }

  // No server to resolve against — echo the code as its own display (the UI then
  // shows the raw code, which is better than nothing for a free-typed value).
  lookup(input: LookupInput): Promise<LookupResult> {
    return Promise.resolve({ display: input.code, designations: [] });
  }

  validateCode(_input: ValidateCodeInput): Promise<boolean> {
    void _input;
    return Promise.resolve(false);
  }
}
