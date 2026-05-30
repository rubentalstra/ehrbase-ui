// GET|POST|PUT|DELETE /api/demographic/* — the demographic (M7) REST surface
// (docs/architecture.md §M7; ADR-0031, ADR-0023 shape). One authenticated,
// role-gated choke point in front of the active DemographicProvider (built-in
// Postgres or FHIR R4, resolved by the factory):
//
//   requireRole(clinician|admin, phi) → resolve provider → validate input with
//   the demographic-core Zod schemas → call the provider → map typed errors to
//   HTTP without leaking PHI (§10).
//
// AUDIT: the provider's injected AuditSink lands the NEN-7513 PARTY event
// (resourceType:'PARTY', source.adapterName) for every op — success AND failure
// — BEFORE this handler returns (rule 1). requireRole audits RBAC denials. So
// this route never double-audits; it only gates + validates + shapes errors.
//
// Routes (splat after /api/demographic/):
//   GET    party?identifier_namespace=&identifier_value=&family=&given=&birthDate=&limit=&offset=
//   POST   party                              create
//   GET    party/{id}?version=                read (current or a prior version)
//   PUT    party/{id}                         update (patch semantics)
//   DELETE party/{id}?justification=          deactivate
//   GET    party/{id}/versions                list versions
//   POST   party/{id}/identifiers            { namespace, value }
//   DELETE party/{id}/identifiers/{identifierId}
//   POST   party/{id}/merge                  { from }   (into = {id})
//   POST   relationships                      CreateRelationshipInput
//   DELETE relationships/{id}

import {
  CapabilityError,
  CreatePartyInputSchema,
  CreateRelationshipInputSchema,
  DemographicValidationError,
  DuplicateIdentifierError,
  PartyNotFoundError,
  PartySearchQuerySchema,
  UpdatePartyInputSchema,
  type DemographicProvider,
  type ProviderContext,
} from '@ehrbase-ui/demographic-core'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { requireRole } from '@/server/auth/require-role'
import { getDemographicProvider } from '@/server/demographic/provider.factory.server'

function json(
  status: number,
  body: Record<string, unknown>,
  correlationId: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-correlation-id': correlationId,
      'cache-control': 'no-store, no-cache, must-revalidate, private',
    },
  })
}

// Map a typed provider error to HTTP. Returns only a stable code — never the
// error message (which could name an identifier namespace) and never PHI (§10).
function mapError(err: unknown, correlationId: string): Response {
  if (err instanceof DemographicValidationError) return json(400, { code: 'VALIDATION' }, correlationId)
  if (err instanceof DuplicateIdentifierError) return json(409, { code: 'DUPLICATE_IDENTIFIER' }, correlationId)
  if (err instanceof PartyNotFoundError) return json(404, { code: 'NOT_FOUND' }, correlationId)
  if (err instanceof CapabilityError) return json(405, { code: 'NOT_SUPPORTED' }, correlationId)
  return json(500, { code: 'INTERNAL' }, correlationId)
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}

function buildSearchQuery(url: URL): unknown {
  const p = url.searchParams
  const ns = p.get('identifier_namespace')
  const val = p.get('identifier_value')
  const query: Record<string, unknown> = {}
  if (ns && val) query['identifier'] = { namespace: ns, value: val }
  if (p.get('family')) query['family'] = p.get('family')
  if (p.get('given')) query['given'] = p.get('given')
  if (p.get('birthDate')) query['birthDate'] = p.get('birthDate')
  if (p.has('limit')) query['limit'] = Number(p.get('limit'))
  if (p.has('offset')) query['offset'] = Number(p.get('offset'))
  return query
}

const AddIdentifierSchema = z.object({ namespace: z.string().min(1), value: z.string().min(1) })
const MergeSchema = z.object({ from: z.string().min(1) })

async function dispatch(
  request: Request,
  segments: string[],
  provider: DemographicProvider,
  ctx: ProviderContext,
  correlationId: string,
): Promise<Response> {
  const method = request.method
  const url = new URL(request.url)
  const [root, id, sub, subId] = segments

  // ── /relationships ─────────────────────────────────────────────────────────
  if (root === 'relationships') {
    if (method === 'POST' && id === undefined) {
      const parsed = CreateRelationshipInputSchema.safeParse(await readJson(request))
      if (!parsed.success) return json(400, { code: 'VALIDATION' }, correlationId)
      const rel = await provider.addRelationship(parsed.data, ctx)
      return json(201, { id: rel.id }, correlationId)
    }
    if (method === 'DELETE' && id !== undefined) {
      await provider.endRelationship(id, ctx)
      return json(200, { ended: true }, correlationId)
    }
    return json(405, { code: 'METHOD_NOT_ALLOWED' }, correlationId)
  }

  // ── /party ──────────────────────────────────────────────────────────────────
  if (root !== 'party' && root !== undefined) {
    return json(404, { code: 'NOT_FOUND' }, correlationId)
  }

  // collection: /party
  if (id === undefined) {
    if (method === 'GET') {
      const parsed = PartySearchQuerySchema.safeParse(buildSearchQuery(url))
      if (!parsed.success) return json(400, { code: 'VALIDATION' }, correlationId)
      const result = await provider.searchParty(parsed.data, ctx)
      return json(200, { parties: result.parties, total: result.total }, correlationId)
    }
    if (method === 'POST') {
      const parsed = CreatePartyInputSchema.safeParse(await readJson(request))
      if (!parsed.success) return json(400, { code: 'VALIDATION' }, correlationId)
      const ref = await provider.createParty(parsed.data, ctx)
      return json(201, { id: ref.id, namespace: ref.namespace, type: ref.type }, correlationId)
    }
    return json(405, { code: 'METHOD_NOT_ALLOWED' }, correlationId)
  }

  // sub-resources: /party/{id}/...
  if (sub === 'versions') {
    if (method === 'GET') {
      const versions = await provider.listVersions(id, ctx)
      return json(200, { versions }, correlationId)
    }
    return json(405, { code: 'METHOD_NOT_ALLOWED' }, correlationId)
  }
  if (sub === 'identifiers') {
    if (method === 'POST' && subId === undefined) {
      const parsed = AddIdentifierSchema.safeParse(await readJson(request))
      if (!parsed.success) return json(400, { code: 'VALIDATION' }, correlationId)
      await provider.addIdentifier(id, parsed.data.namespace, parsed.data.value, ctx)
      return json(200, { ok: true }, correlationId)
    }
    if (method === 'DELETE' && subId !== undefined) {
      await provider.endIdentifier(id, subId, ctx)
      return json(200, { ok: true }, correlationId)
    }
    return json(405, { code: 'METHOD_NOT_ALLOWED' }, correlationId)
  }
  if (sub === 'merge') {
    if (method === 'POST') {
      const parsed = MergeSchema.safeParse(await readJson(request))
      if (!parsed.success) return json(400, { code: 'VALIDATION' }, correlationId)
      await provider.mergeParty(id, parsed.data.from, ctx)
      return json(200, { ok: true }, correlationId)
    }
    return json(405, { code: 'METHOD_NOT_ALLOWED' }, correlationId)
  }
  if (sub !== undefined) {
    return json(404, { code: 'NOT_FOUND' }, correlationId)
  }

  // item: /party/{id}
  if (method === 'GET') {
    const versionParam = url.searchParams.get('version')
    const version = versionParam ? Number(versionParam) : undefined
    const party = await provider.getParty(id, version ? { version } : {}, ctx)
    if (!party) return json(404, { code: 'NOT_FOUND' }, correlationId)
    return json(200, { party }, correlationId)
  }
  if (method === 'PUT') {
    const parsed = UpdatePartyInputSchema.safeParse(await readJson(request))
    if (!parsed.success) return json(400, { code: 'VALIDATION' }, correlationId)
    const ref = await provider.updateParty(id, parsed.data, ctx)
    return json(200, { id: ref.id, namespace: ref.namespace, type: ref.type }, correlationId)
  }
  if (method === 'DELETE') {
    const justification = url.searchParams.get('justification') ?? 'deactivated'
    await provider.deactivateParty(id, justification, ctx)
    return json(200, { deactivated: true }, correlationId)
  }
  return json(405, { code: 'METHOD_NOT_ALLOWED' }, correlationId)
}

async function handle({
  request,
  params,
}: {
  request: Request
  params: { _splat?: string }
}): Promise<Response> {
  const correlationId = crypto.randomUUID()

  // RBAC gate (audits ACCESS_DENIED; advertises break-glass on a PHI route).
  let role: Awaited<ReturnType<typeof requireRole>>
  try {
    role = await requireRole(['clinician', 'admin'], { phi: true })
  } catch (err) {
    if (err instanceof Response) return err
    throw err
  }

  const ctx: ProviderContext = {
    actor: {
      userId: role.user.id,
      username: role.user.email,
      displayName: role.user.name,
      roles: role.user.roles,
    },
    sessionId: role.sid,
    correlationId,
  }

  const segments = (params._splat ?? '').split('/').filter(Boolean)
  try {
    return await dispatch(request, segments, getDemographicProvider(), ctx, correlationId)
  } catch (err) {
    if (err instanceof Response) return err
    return mapError(err, correlationId)
  }
}

export const Route = createFileRoute('/api/demographic/$')({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
      PUT: handle,
      DELETE: handle,
    },
  },
})
