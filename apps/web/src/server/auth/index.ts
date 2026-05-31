// @/server/auth — Better Auth factory + service locator + RBAC + break-glass.
//
// Public surface for server-side consumers:
//
//   import {
//     buildAuth, setAuthInstance, getAuthInstance,
//     requireRole, type RoleContext,
//     grantEmergencyAccess, BreakGlassRequestSchema,
//     resolveUserAppRoles,
//   } from '@/server/auth'
//
// Browser-side consumers import from the `/client` subpath:
//
//   import { authClient } from '@/lib/auth-client'

export {
  buildAuth,
  type BuildAuthOptions,
  KEYCLOAK_PROVIDER_ID,
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
  APP_REALM_ROLES,
  appRealmRolesFromTokens,
  resolveUserAppRoles,
} from './realm-roles.server.ts'
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
