// Drizzle schema for Better Auth (docs/architecture.md §5; ADR-0028).
//
// One source of truth for every Better Auth table the configured plugins
// require. The Better Auth runtime introspects this via the drizzleAdapter
// and writes through it directly — no parallel ORM mapping to maintain.
//
// Layout (column shapes derived from the Better Auth v1.6.11 schema
// references; plugin extensions appended):
//
//   Core (always):
//     - user, session, account, verification
//   Admin plugin:
//     - extra columns on `user`: role, banned, banReason, banExpires
//     - extra column on `session`: impersonatedBy
//   Organization plugin (with teams enabled):
//     - organization, member, invitation, team, teamMember
//   SSO plugin:
//     - ssoProvider
//
// `keycloakRoles` is a CUSTOM column on `user`. It is now VESTIGIAL (ADR-0044):
// roles are read FRESH from the linked `account.access_token` JWT on every
// request (require-role.ts / realm-roles.server.ts), so nothing writes it
// anymore. Kept (unpopulated) to avoid a migration; safe to drop later.

import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

// ─── user ─────────────────────────────────────────────────────────────────
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),

  // Admin plugin extension columns.
  role: text('role').default('user').notNull(),
  banned: boolean('banned').default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires', { withTimezone: true }),

  // Custom — VESTIGIAL (ADR-0044). Roles are decoded fresh from the linked
  // account.access_token on every request; this column is no longer written.
  keycloakRoles: jsonb('keycloak_roles')
    .$type<string[]>()
    .default([])
    .notNull(),
})

// ─── session ──────────────────────────────────────────────────────────────
export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Admin plugin: when an admin impersonates a user, this is set to the
    // admin's user id so we can audit and undo.
    impersonatedBy: text('impersonated_by'),
    // Organization plugin: pin which org context this session is active in.
    activeOrganizationId: text('active_organization_id'),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
)

// ─── account (OAuth/OIDC provider linkage) ────────────────────────────────
// SSO via Keycloak lands here: providerId='keycloak' (or the configured
// SSO providerId), accountId=Keycloak user sub, accessToken/refreshToken/
// idToken from the OIDC token-exchange response. The BFF reads accessToken
// to forward as a Bearer to EHRbase.
export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
)

// ─── verification (email/magic-link/etc tokens) ───────────────────────────
export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)

// ─── organization plugin ──────────────────────────────────────────────────
export const organization = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').unique(),
  logo: text('logo'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  metadata: text('metadata'),
})

export const member = pgTable(
  'member',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').default('member').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('member_organization_id_idx').on(t.organizationId),
    index('member_user_id_idx').on(t.userId),
  ],
)

export const invitation = pgTable(
  'invitation',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role'),
    status: text('status').default('pending').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    teamId: text('team_id'),
  },
  (t) => [
    index('invitation_organization_id_idx').on(t.organizationId),
    index('invitation_email_idx').on(t.email),
  ],
)

// Teams sub-feature of the organization plugin (teams: { enabled: true }).
export const team = pgTable(
  'team',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('team_organization_id_idx').on(t.organizationId)],
)

export const teamMember = pgTable(
  'team_member',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => team.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('team_member_team_id_idx').on(t.teamId),
    index('team_member_user_id_idx').on(t.userId),
  ],
)

// ─── sso plugin ───────────────────────────────────────────────────────────
// One row per registered external IdP. For our deployment: a single
// Keycloak provider, optionally per-organization (multi-hospital).
export const ssoProvider = pgTable(
  'sso_provider',
  {
    id: text('id').primaryKey(),
    issuer: text('issuer').notNull(),
    oidcConfig: text('oidc_config'),
    samlConfig: text('saml_config'),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    providerId: text('provider_id').notNull().unique(),
    organizationId: text('organization_id').references(() => organization.id, {
      onDelete: 'cascade',
    }),
    domain: text('domain'),
  },
  (t) => [
    index('sso_provider_organization_id_idx').on(t.organizationId),
    index('sso_provider_domain_idx').on(t.domain),
  ],
)

// Relations are intentionally omitted — we use Better Auth's adapter for all
// inserts/reads, not the relational `db.query.*` API, so the relations would
// be dead weight (and drizzle-kit's `relations()` introspection is currently
// incompatible with this Drizzle release). The foreign-key constraints
// declared above are enforced at the DB level regardless.
