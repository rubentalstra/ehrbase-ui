// Server-only template fetch + Valkey cache (§7 form pipeline, Tranche 1b).
//
// Fetches the operational web template from EHRbase
// (GET /definition/template/adl1.4/{id}, Accept: application/json), validates it
// with @ehrbase-ui/openehr-web-template, and caches the parsed document in
// Valkey (templates are stable; bounded TTL). Contract/types live in
// template.functions.ts.

import { parseWebTemplate, type WebTemplate } from "@ehrbase-ui/openehr-web-template";
import { valkey } from "@ehrbase-ui/valkey";
import { z } from "zod";

import { checkRateLimit, classifyRequest, tooManyRequests } from "@/server/bff";
import { callEhrbase, type EhrbaseOk } from "@/server/bff/call-ehrbase.server";
import { getEhrbaseContext, type EhrbaseContext } from "@/server/bff/ehrbase-context.server";

import type {
  TemplateRequest,
  TemplateSummary,
  UploadTemplateInput,
  UploadTemplateResult,
} from "./template.functions";

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

// ─── Template list + OPT upload (Part C Phase 1 — engine-first workbench) ──────
// Both go through callEhrbase (auth + rate-limit + 404/403 conflation), the same
// choke point the composition/EHR/AQL server fns use. classifyPath is the static
// ADL 1.4 definition route so a crafted id can never skew the rate-limit class.
const JSON_MEDIA_TYPE = "application/json";
const XML_MEDIA_TYPE = "application/xml";
const LIST_CLASSIFY_PATH = "definition/template/adl1.4";

async function requireContext(): Promise<EhrbaseContext> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const ctx = await getEhrbaseContext(getRequest().headers);
  if (!ctx) throw fail(401, "UNAUTHENTICATED");
  return ctx;
}

// EHRbase returns an array of objects keyed in snake_case; `concept` is the
// concept name. Lenient: any of the fields may be absent on a future EHRbase, so
// only the template_id is required for a row to be usable.
const TemplateListEntrySchema = z.looseObject({
  template_id: z.string().min(1),
  concept: z.string().optional(),
  created_timestamp: z.string().optional(),
});
const TemplateListSchema = z.array(z.unknown());

export async function fetchTemplateList(): Promise<TemplateSummary[]> {
  const ctx = await requireContext();
  const res = await callEhrbase(ctx, {
    method: "GET",
    path: "definition/template/adl1.4",
    classifyPath: LIST_CLASSIFY_PATH,
    accept: JSON_MEDIA_TYPE,
  });

  // Drop rows that don't carry a template_id rather than failing the whole list.
  const rows = TemplateListSchema.parse(res.json ?? []);
  return rows.flatMap((row) => {
    const parsed = TemplateListEntrySchema.safeParse(row);
    if (!parsed.success) return [];
    return [
      {
        templateId: parsed.data.template_id,
        conceptName: parsed.data.concept ?? null,
        createdTimestamp: parsed.data.created_timestamp ?? null,
      },
    ];
  });
}

// Pull the template id out of the OPT XML (<template_id><value>…</value>) as a
// fallback when EHRbase's Location header doesn't carry it. Deliberately a plain
// regex, not an XML parser — we only need the one element and never trust it for
// anything but display.
function templateIdFromOpt(opt: string): string | null {
  const block = /<template_id\b[^>]*>([\s\S]*?)<\/template_id>/u.exec(opt)?.[1];
  if (block === undefined) return null;
  const value = /<value\b[^>]*>([\s\S]*?)<\/value>/u.exec(block)?.[1] ?? block;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function templateIdFrom(res: EhrbaseOk, opt: string): string {
  // EHRbase returns the new template id in the Location header
  // (`{baseUrl}/definition/template/adl1.4/{template_id}`).
  const seg = res.location?.split("/").pop();
  if (seg) return decodeURIComponent(seg);
  const fromBody = typeof res.json === "string" ? res.json.trim() : null;
  if (fromBody) return fromBody;
  const fromOpt = templateIdFromOpt(opt);
  if (fromOpt) return fromOpt;
  throw fail(502, "NO_TEMPLATE_ID");
}

export async function storeTemplate(input: UploadTemplateInput): Promise<UploadTemplateResult> {
  const ctx = await requireContext();
  const res = await callEhrbase(ctx, {
    method: "POST",
    path: "definition/template/adl1.4",
    classifyPath: LIST_CLASSIFY_PATH,
    contentType: XML_MEDIA_TYPE,
    accept: JSON_MEDIA_TYPE,
    body: input.opt,
  });
  return { templateId: templateIdFrom(res, input.opt) };
}
