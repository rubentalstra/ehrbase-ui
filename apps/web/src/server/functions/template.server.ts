// Server-only template fetch + Valkey cache (§7 form pipeline, Tranche 1b).
//
// Fetches the operational web template from EHRbase
// (GET /definition/template/adl1.4/{id}, Accept: application/json), validates it
// with @ehrbase-ui/openehr-web-template, and caches the parsed document in
// Valkey (templates are stable; bounded TTL). Contract/types live in
// template.functions.ts.

import { parseWebTemplate, type WebTemplate } from "@ehrbase-ui/openehr-web-template";
import { valkey } from "@ehrbase-ui/valkey";

import { checkRateLimit, classifyRequest, tooManyRequests } from "@/server/bff";
import { getEhrbaseContext, type EhrbaseContext } from "@/server/bff/ehrbase-context.server";

import type { TemplateRequest } from "./template.functions";

const TEMPLATE_CACHE_TTL_SECONDS = 3600; // templates change rarely; 1h is ample

// Cache key is GLOBAL (not per-principal) on purpose: operational templates are
// system-wide DEFINITION-layer artefacts in EHRbase — not patient/tenant-scoped
// and not PHI. Read access is uniform for any authenticated principal (the
// fetchWebTemplate cache lookup is already gated behind a valid EhrbaseContext,
// so an unauthenticated caller can never reach a cached value). If a future
// deployment introduces per-realm template ACLs, this key MUST be namespaced by
// that realm/tenant id before the lookup.
const cacheKey = (id: string) => `webtemplate:${id}`;

// The upstream route is FIXED; classify by its static shape, never by the
// user-supplied templateId, so a crafted id can't skew the rate-limit class.
const STATIC_TEMPLATE_PATH = "definition/template/adl1.4/";

function fail(status: number, code: string): Response {
  return new Response(JSON.stringify({ code }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function fetchWebTemplate({ templateId }: TemplateRequest): Promise<WebTemplate> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const ctx = await getEhrbaseContext(getRequest().headers);
  if (!ctx) throw fail(401, "UNAUTHENTICATED");
  return loadWebTemplate(ctx, templateId);
}

/**
 * Cached web-template load for an already-resolved context — reused by the
 * composition CRUD path so a write/read resolves the session once. Same
 * rate-limit-before-cache + 404/403 conflation as fetchWebTemplate.
 */
export async function loadWebTemplate(ctx: EhrbaseContext, templateId: string): Promise<WebTemplate> {
  // Rate-limit BEFORE the cache lookup so cache traffic is also bounded, matching
  // the BFF proxy's single choke-point behaviour (§5.9). Keyed by session.
  const cls = classifyRequest("GET", STATIC_TEMPLATE_PATH);
  const limit = await checkRateLimit(cls.rateLimit, ctx.sid);
  if (!limit.allowed) throw tooManyRequests(limit);

  // Cache hit — re-validate the cached JSON (cheap; avoids trusting stale shape).
  const cached = await valkey.get(cacheKey(templateId));
  if (cached !== null) {
    return parseWebTemplate(JSON.parse(cached));
  }

  const path = `definition/template/adl1.4/${encodeURIComponent(templateId)}`;
  let res: Response;
  try {
    res = await fetch(`${ctx.baseUrl}/${path}`, {
      headers: { authorization: `Bearer ${ctx.accessToken}`, accept: "application/json" },
    });
  } catch {
    throw fail(502, "UPSTREAM_ERROR");
  }

  // §10 — conflate 404/403; a definition still shouldn't leak existence detail.
  if (res.status === 404 || res.status === 403) throw fail(404, "NOT_FOUND");
  if (!res.ok) throw fail(502, "UPSTREAM_ERROR");

  const template = parseWebTemplate(await res.json());
  await valkey.setex(cacheKey(templateId), TEMPLATE_CACHE_TTL_SECONDS, JSON.stringify(template));
  return template;
}
