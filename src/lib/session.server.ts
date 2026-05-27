// Server-side session store on Valkey (docs/architecture.md §5.3, §5.10).
//
// The browser holds only an opaque session id in an httpOnly cookie; all OAuth
// tokens and identity live here, server-side, so a session can be revoked
// instantly (logout, break-glass ceiling) by deleting one Valkey key.
//
// Two clocks are stamped on every authenticated session and enforced by
// requireAuth (§5.10): `createdAt` anchors the 12 h absolute timeout and
// `lastSeenAt` anchors the 15 min idle timeout. The Valkey key itself carries
// an 8 h sliding TTL so abandoned sessions are reaped even if never visited.

import { randomBytes } from 'node:crypto'

import { z } from 'zod'

import { valkey } from '@/lib/valkey.server'

const SESSION_TTL_SECONDS = 8 * 60 * 60
const keyFor = (sid: string) => `sess:${sid}`

export const SessionDataSchema = z.object({
  status: z.enum(['authenticating', 'authenticated']),

  // Identity (present once status === 'authenticated').
  userId: z.string().optional(),
  email: z.string().optional(),
  name: z.string().optional(),
  roles: z.array(z.string()).optional(),

  // OAuth material — never leaves the server.
  accessToken: z.string().optional(),
  accessTokenExpiresAt: z.number().optional(),
  refreshToken: z.string().optional(),
  idToken: z.string().optional(),

  // Timeout anchors (epoch ms).
  createdAt: z.number().optional(),
  lastSeenAt: z.number().optional(),

  // Break-glass lifetime counter (§5.6 — max 3 per session).
  emergencyAccessCount: z.number().optional(),

  // PKCE bookkeeping (only while status === 'authenticating').
  state: z.string().optional(),
  codeVerifier: z.string().optional(),
  postLoginRedirect: z.string().optional(),
})

export type SessionData = z.infer<typeof SessionDataSchema>

export function createSessionId(): string {
  return randomBytes(32).toString('hex')
}

export async function readSession(sid: string): Promise<SessionData | null> {
  const raw = await valkey.get(keyFor(sid))
  if (!raw) return null
  const json: unknown = JSON.parse(raw)
  const parsed = SessionDataSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

export async function writeSession(sid: string, data: SessionData): Promise<void> {
  await valkey.set(keyFor(sid), JSON.stringify(data), 'EX', SESSION_TTL_SECONDS)
}

export async function destroySession(sid: string): Promise<void> {
  await valkey.del(keyFor(sid))
}
