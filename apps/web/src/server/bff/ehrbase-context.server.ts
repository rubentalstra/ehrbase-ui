// Resolve the authenticated user + their EHRbase (Keycloak) access token for
// SERVER-SIDE EHRbase calls made from server functions (template fetch,
// composition CRUD, …). The user token is what EHRbase derives the openEHR
// CONTRIBUTION committer from — so server-side writes carry the real clinician
// identity, same as the BFF proxy route.
//
// Token freshness (ADR-0044): the Keycloak access token has a short lifespan
// (realm accessTokenLifespan). Because Keycloak is wired via the genericOAuth
// plugin, the provider is registered in `socialProviders`, so the core
// `auth.api.getAccessToken` endpoint transparently REFRESHES the token from the
// stored refresh_token when it is at/near expiry (and persists the rotated
// tokens). That is what keeps these EHRbase calls working past the short token
// lifespan instead of 401-ing. The refresh happens against the genericOAuth
// keycloak issuer (localhost:8180 in dev), so the refreshed token keeps
// iss=localhost:8180 — the value EHRbase validates.
//
// Realm roles are decoded FRESH from that token (id_token fallback) — the same
// authoritative source require-role.ts uses — never a denormalised column.
//
// `.server.ts` suffix (CLAUDE.md rule 7): never reaches the client bundle.

import { eq } from "drizzle-orm";

import { auth as betterAuth } from "@/lib/auth/auth.server";
import { appRealmRolesFromTokens } from "@/server/auth/realm-roles.server";
import { account as accountTable } from "@/server/db/auth";
import { authDb } from "@/server/db/auth-client";
import { appLog } from "@/server/observability/log";

const KEYCLOAK_PROVIDER_ID = "keycloak";

export interface EhrbaseContext {
  user: { id: string; email: string; name: string; roles: string[] };
  accessToken: string;
  baseUrl: string;
  sid: string;
}

export function ehrbaseBaseUrl(): string {
  return process.env.EHRBASE_URL ?? "http://localhost:8080/ehrbase/rest/openehr/v1";
}

interface ResolvedTokens {
  accessToken: string;
  idToken: string | null;
}

/** Read the stored Keycloak tokens directly (fallback when getAccessToken can't
 *  run — e.g. no recorded expiry yet). The returned access token may be expired;
 *  EHRbase is the final authority and will 401 if so, prompting re-login. */
async function loadStoredTokens(userId: string): Promise<ResolvedTokens | null> {
  const rows = await authDb
    .select({ accessToken: accountTable.accessToken, idToken: accountTable.idToken })
    .from(accountTable)
    .where(eq(accountTable.userId, userId))
    .limit(10);
  const row = rows.find((r) => r.accessToken !== null);
  return row?.accessToken ? { accessToken: row.accessToken, idToken: row.idToken } : null;
}

/** A valid (refreshed if needed) Keycloak access token for the user + the linked
 *  id_token, via Better Auth's getAccessToken (genericOAuth refresh), falling
 *  back to the stored token on any error. */
async function resolveTokens(headers: Headers, userId: string): Promise<ResolvedTokens | null> {
  try {
    const res = await betterAuth.api.getAccessToken({
      body: { providerId: KEYCLOAK_PROVIDER_ID, userId },
      headers,
    });
    if (res?.accessToken) {
      return { accessToken: res.accessToken, idToken: res.idToken ?? null };
    }
  } catch (err) {
    appLog.error({ err }, "[ehrbase-context] getAccessToken failed; using stored token");
  }
  return loadStoredTokens(userId);
}

/** Resolve the session + a valid (refreshed if needed) Keycloak access token, or
 *  null if unauthenticated / unlinked. */
export async function getEhrbaseContext(headers: Headers): Promise<EhrbaseContext | null> {
  const session = await betterAuth.api.getSession({ headers });
  if (!session) return null;

  const tokens = await resolveTokens(headers, session.user.id);
  if (!tokens) return null;

  return {
    user: {
      id: session.user.id,
      email: session.user.email ?? "",
      name: session.user.name ?? "",
      roles: appRealmRolesFromTokens(tokens.accessToken, tokens.idToken),
    },
    accessToken: tokens.accessToken,
    baseUrl: ehrbaseBaseUrl(),
    sid: session.session.token,
  };
}
