// @ehrbase-ui/auth — Better Auth factory + service locator + RBAC + break-glass.
//
// Public surface for server-side consumers:
//
//   import {
//     buildAuth, setAuthInstance, getAuthInstance,
//     requireRole, type RoleContext,
//     grantEmergencyAccess, BreakGlassRequestSchema,
//     ensureKeycloakSsoProviderRegistered,
//   } from '@ehrbase-ui/auth'
//
// Browser-side consumers import from the `/client` subpath:
//
//   import { authClient } from '@ehrbase-ui/auth/client'

export {
  buildAuth,
  type BuildAuthOptions,
  decodeJwtPayload,
  extractKeycloakRoles,
} from './factory.ts'
export {
  setAuthInstance,
  getAuthInstance,
  _resetAuthInstanceForTests,
  type AuthInstance,
} from './instance.ts'
export {
  setAuthRequestContextProvider,
  getAuthRequestHeaders,
  _resetAuthRequestContextProviderForTests,
  type AuthRequestContextProvider,
} from './request-context.ts'
export {
  extractRealmRoles,
  KeycloakRealmAccessSchema,
  SessionUserShapeSchema,
} from './jwt.ts'
export {
  provisionFromKeycloak,
  type ProvisionInput,
} from './provision.ts'
export { ensureKeycloakSsoProviderRegistered } from './sso-bootstrap.ts'
export {
  requireRole,
  type RoleContext,
  type RequireRoleOptions,
} from './require-role.ts'
export {
  GRANT_TTL_SECONDS,
  MIN_JUSTIFICATION,
  BreakGlassRequestSchema,
  type BreakGlassRequest,
  type BreakGlassOutcome,
  grantEmergencyAccess,
  getEmergencyGrant,
  type EmergencyGrant,
} from './break-glass.ts'
