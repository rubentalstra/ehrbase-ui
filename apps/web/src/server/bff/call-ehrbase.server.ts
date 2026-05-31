// Server-side authenticated EHRbase call — the single choke point for EHRbase
// requests made from server FUNCTIONS (composition CRUD, …), mirroring the HTTP
// BFF proxy at routes/api/ehrbase/$.ts but for typed server-fn callers.
//
// It applies, in one place, exactly what the proxy applies (§5, §5.9, §10):
//   rate-limit (keyed by session) → forward the user's Keycloak Bearer (the
//   token EHRbase derives the openEHR CONTRIBUTION committer from) → map upstream
//   status, CONFLATING 404/403 (§10), surfacing 412 as a distinct typed
//   conflict, and never leaking a raw upstream body.
//
// `.server.ts` (CLAUDE.md rule 7): never reaches the client bundle.

import { checkRateLimit, classifyRequest, tooManyRequests } from "@/server/bff";

import type { EhrbaseContext } from "./ehrbase-context.server";

export interface CallEhrbaseOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Upstream path after baseUrl, e.g. `ehr/{uuid}/composition/{uid}`. */
  path: string;
  /**
   * STATIC path used ONLY for rate-limit classification — never include
   * user-supplied ids here, so a crafted id can't skew the rate-limit class.
   * Defaults to `path` when the path is already static.
   */
  classifyPath?: string;
  search?: string;
  body?: string;
  contentType?: string;
  accept?: string;
  /**
   * Optimistic concurrency: forwarded verbatim as the If-Match header. The
   * openEHR ITS-REST spec mandates a double-quoted version_uid, but EHRbase
   * 2.31's FLAT composition endpoint rejects the quotes (400 "UUID string too
   * large") and wants the bare version_uid — see composition.server.
   */
  ifMatch?: string;
}

export interface EhrbaseOk {
  status: number;
  etag: string | null;
  location: string | null;
  json: unknown;
}

function fail(status: number, code: string): Response {
  return new Response(JSON.stringify({ code }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Perform an authenticated, audited, rate-limited EHRbase call. Resolves with
 * the parsed 2xx response (+ etag/location); THROWS a typed `Response` for every
 * non-success path (401/429, 404 conflated, 412 conflict, 5xx, other 4xx) — the
 * same error contract the HTTP proxy returns, so server fns and the proxy behave
 * identically. The 412 body carries the current `etag` for the diff/merge modal.
 */
export async function callEhrbase(ctx: EhrbaseContext, opts: CallEhrbaseOptions): Promise<EhrbaseOk> {
  const cls = classifyRequest(opts.method, opts.classifyPath ?? opts.path);

  const limit = await checkRateLimit(cls.rateLimit, ctx.sid);
  if (!limit.allowed) throw tooManyRequests(limit);

  const headers = new Headers();
  headers.set("authorization", `Bearer ${ctx.accessToken}`);
  if (opts.contentType) headers.set("content-type", opts.contentType);
  if (opts.accept) headers.set("accept", opts.accept);
  if (opts.ifMatch) headers.set("if-match", opts.ifMatch);

  const url = `${ctx.baseUrl}/${opts.path}${opts.search ?? ""}`;
  let res: Response;
  try {
    res = await fetch(url, { method: opts.method, headers, ...(opts.body ? { body: opts.body } : {}) });
  } catch {
    throw fail(502, "UPSTREAM_ERROR");
  }

  // §10 — conflate 404/403 (existence of a record is itself sensitive).
  if (res.status === 403 || res.status === 404) throw fail(404, "NOT_FOUND");
  if (res.status >= 500) throw fail(502, "UPSTREAM_ERROR");
  // Optimistic-concurrency conflict (§7) — surface distinctly + echo current etag.
  if (res.status === 412) {
    const current = res.headers.get("etag");
    throw new Response(JSON.stringify(current ? { code: "CONFLICT", etag: current } : { code: "CONFLICT" }), {
      status: 412,
      headers: { "content-type": "application/json" },
    });
  }
  if (!res.ok) throw fail(res.status, "REQUEST_REJECTED");

  const text = await res.text();
  return {
    status: res.status,
    etag: res.headers.get("etag"),
    location: res.headers.get("location"),
    json: text ? JSON.parse(text) : null,
  };
}
