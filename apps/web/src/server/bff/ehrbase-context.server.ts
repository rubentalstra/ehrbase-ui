// Resolve the authenticated user + their EHRbase (Keycloak) access token for
// SERVER-SIDE EHRbase calls made from server functions (template fetch,
// composition CRUD, …). The user token is what EHRbase derives the openEHR
// CONTRIBUTION committer from (ADR-0024 addendum) — so server-side writes carry
// the real clinician identity, same as the BFF proxy route.
//
// `.server.ts` suffix (CLAUDE.md rule 7): never reaches the client bundle.

import { eq } from "drizzle-orm";
import { z } from "zod";

import { auth as betterAuth } from "@/lib/auth/auth.server";
import { account as accountTable } from "@/server/db/auth";
import { authDb } from "@/server/db/auth-client";

// Mirror routes/api/ehrbase/$.ts: the Keycloak roles live on the Better Auth
// user row; parse them so the audit actor.roles is accurate (audit-trail
// integrity), never a hard-coded empty list.
const UserShapeSchema = z.object({ keycloakRoles: z.array(z.string()).default([]) }).partial();

export interface EhrbaseContext {
  user: { id: string; email: string; name: string; roles: string[] };
  accessToken: string;
  baseUrl: string;
  sid: string;
}

export function ehrbaseBaseUrl(): string {
  return process.env.EHRBASE_URL ?? "http://localhost:8080/ehrbase/rest/openehr/v1";
}

/** Resolve the session + linked Keycloak access token, or null if unauthenticated / unlinked. */
export async function getEhrbaseContext(headers: Headers): Promise<EhrbaseContext | null> {
  const session = await betterAuth.api.getSession({ headers });
  if (!session) return null;

  // ADR-0028: the Keycloak access token lives on the Better Auth `account` row.
  const rows = await authDb
    .select({ accessToken: accountTable.accessToken })
    .from(accountTable)
    .where(eq(accountTable.userId, session.user.id))
    .limit(5);
  const accessToken = rows.find((r) => r.accessToken !== null)?.accessToken;
  if (!accessToken) return null;

  const shape = UserShapeSchema.safeParse(session.user);
  const roles = shape.success ? (shape.data.keycloakRoles ?? []) : [];

  return {
    user: {
      id: session.user.id,
      email: session.user.email ?? "",
      name: session.user.name ?? "",
      roles,
    },
    accessToken,
    baseUrl: ehrbaseBaseUrl(),
    sid: session.session.token,
  };
}
