// JWT payload helpers shared across auth flows.
//
// Keycloak's access_token is a signed JWT; the `realm_access.roles` claim
// lives in its payload (NOT in the OIDC userinfo endpoint — that returns
// standard profile/email claims only). We don't verify the signature here —
// Keycloak just minted the token in response to OUR token-exchange call
// inside Better Auth's OIDC handler, and we only read it to mirror the
// role list onto the Better Auth user row. The token's authoritative use
// is by EHRbase, which validates it against the realm's JWKS.

import { z } from 'zod'

export const KeycloakRealmAccessSchema = z
  .object({
    realm_access: z
      .object({ roles: z.array(z.string()).default([]) })
      .partial()
      .optional(),
  })
  .partial()

export const SessionUserShapeSchema = z
  .object({
    id: z.string(),
    email: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    keycloakRoles: z.array(z.string()).default([]),
  })
  .partial({ email: true, name: true })

/**
 * Best-effort JWT payload decode. Returns undefined if the input isn't a
 * three-part JWT or the payload isn't valid base64-url-encoded JSON.
 */
export function decodeJwtPayload(jwt: string | null | undefined): unknown {
  if (!jwt) return undefined
  const parts = jwt.split('.')
  const payload = parts[1]
  if (!payload) return undefined
  try {
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
    const json = Buffer.from(
      padded.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf8')
    const parsed: unknown = JSON.parse(json)
    return parsed
  } catch {
    return undefined
  }
}

export function extractRealmRoles(payload: unknown): string[] {
  const parsed = KeycloakRealmAccessSchema.safeParse(payload ?? {})
  return parsed.success ? (parsed.data.realm_access?.roles ?? []) : []
}

/**
 * Read the denormalised `keycloakRoles` cache off a Better Auth session.user
 * object. The authoritative source is the access_token JWT; this helper
 * tolerates a missing column on the row.
 */
export function extractKeycloakRoles(user: unknown): string[] {
  const parsed = SessionUserShapeSchema.safeParse(user)
  return parsed.success ? (parsed.data.keycloakRoles ?? []) : []
}
