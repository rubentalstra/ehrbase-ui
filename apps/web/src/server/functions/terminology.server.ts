// Server-only external terminology lookups + Valkey cache (ADR-0034; F2).
//
// Resolves the active TerminologyProvider (snowstorm | generic-fhir | none),
// role-gates like the other authed server fns, validates inputs (the boundary
// re-parses with the term-core schemas — defense in depth, §15), and caches the
// result in Valkey (terminology is reference data, highly cacheable; 1h TTL per
// ADR-0034). Contract/types live in terminology.functions.ts.
//
// NOT PHI (ADR-0034): no audit, no pseudonymisation. The cache key is global (the
// expansion of a SNOMED value set is system-wide reference data, not principal-
// scoped) — same reasoning as the web-template cache key in template.server.ts.

import { ExpandValueSetInputSchema, LookupInputSchema } from "@ehrbase-ui/term-core";
import { valkey } from "@ehrbase-ui/valkey";
import { z } from "zod";

import { requireRole } from "@/server/auth/require-role";
import { getTerminologyProvider } from "@/server/terminology/provider.factory.server";

import type {
  ExpandValueSetRequest,
  ExpandValueSetResult,
  LookupCodeRequest,
  LookupCodeResult,
} from "./terminology.functions";

const TERMINOLOGY_CACHE_TTL_SECONDS = 3600; // reference data; 1h is ample (ADR-0034)

// A deterministic, collision-safe cache key from the request fields. Built by
// JSON-stringifying a fixed-order tuple (not the object) so key order can never
// shift the key. Encoded so a value-set URL's `/` and `:` don't split the key.
function expandCacheKey(input: ExpandValueSetRequest): string {
  const tuple = [
    input.url ?? "",
    input.system ?? "",
    input.filter ?? "",
    input.count,
    input.offset,
    input.displayLanguage ?? "",
  ];
  return `term:expand:${encodeURIComponent(JSON.stringify(tuple))}`;
}

function lookupCacheKey(input: LookupCodeRequest): string {
  const tuple = [input.system, input.code, input.displayLanguage ?? ""];
  return `term:lookup:${encodeURIComponent(JSON.stringify(tuple))}`;
}

// Role gate: clinician + admin may resolve terminology (the form pipeline they
// drive needs it). Not flagged `phi:true` — terminology is reference data, so a
// denial is a plain 403 with no break-glass affordance (ADR-0034).
async function gate(): Promise<void> {
  await requireRole(["clinician", "admin"]);
}

export async function runExpandValueSet(
  input: ExpandValueSetRequest,
): Promise<ExpandValueSetResult> {
  await gate();
  const provider = getTerminologyProvider();

  // Unconfigured provider: short-circuit so the UI degrades the picker without a
  // round trip. configured=false is the signal the FieldRenderer reads.
  if (!provider.capabilities.configured) {
    return { configured: false, options: [], total: 0 };
  }

  // Re-parse at the boundary with the canonical term-core schema (defense in
  // depth — the .functions.ts already validated, but the provider contract owns
  // the authoritative shape, incl. the url-or-system refinement).
  const parsed = ExpandValueSetInputSchema.parse(input);

  const key = expandCacheKey(input);
  const cached = await valkey.get(key);
  if (cached !== null) {
    const fromCache = parseCachedExpand(cached);
    if (fromCache !== null) return fromCache;
  }

  const result = await provider.expandValueSet(parsed);
  const dto: ExpandValueSetResult = {
    configured: true,
    options: result.options,
    total: result.total,
  };
  await valkey.setex(key, TERMINOLOGY_CACHE_TTL_SECONDS, JSON.stringify(dto));
  return dto;
}

export async function runLookupCode(input: LookupCodeRequest): Promise<LookupCodeResult> {
  await gate();
  const provider = getTerminologyProvider();
  if (!provider.capabilities.configured) {
    return { configured: false, display: input.code };
  }

  const parsed = LookupInputSchema.parse(input);
  const key = lookupCacheKey(input);
  const cached = await valkey.get(key);
  if (cached !== null) {
    const fromCache = parseCachedLookup(cached);
    if (fromCache !== null) return fromCache;
  }

  const result = await provider.lookup(parsed);
  const dto: LookupCodeResult = { configured: true, display: result.display };
  await valkey.setex(key, TERMINOLOGY_CACHE_TTL_SECONDS, JSON.stringify(dto));
  return dto;
}

// ── Cache parsing (Zod parse — rule 3, no `as` / no unsafe `any`) ─────────────
const CachedExpandSchema = z.object({
  configured: z.literal(true),
  total: z.number(),
  options: z.array(z.object({ system: z.string(), code: z.string(), display: z.string() })),
});
const CachedLookupSchema = z.object({ configured: z.literal(true), display: z.string() });

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function parseCachedExpand(raw: string): ExpandValueSetResult | null {
  const parsed = CachedExpandSchema.safeParse(safeJsonParse(raw));
  return parsed.success ? parsed.data : null;
}

function parseCachedLookup(raw: string): LookupCodeResult | null {
  const parsed = CachedLookupSchema.safeParse(safeJsonParse(raw));
  return parsed.success ? parsed.data : null;
}
