CREATE TYPE "audit_retention_policy" AS ENUM('CLINICAL_RECORD', 'AUDIT_LOG', 'AUTH_LOG', 'APP_LOG', 'SESSION');--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'META_AUDIT_ACCESS';--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "retention_policy" "audit_retention_policy" DEFAULT 'AUDIT_LOG'::"audit_retention_policy" NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "s3_archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_events" DROP COLUMN "lawful_basis";--> statement-breakpoint
CREATE INDEX "audit_events_retention_purge_idx" ON "audit_events" ("retention_policy","timestamp");--> statement-breakpoint
DROP TYPE "audit_lawful_basis";--> statement-breakpoint
-- Retention purge role (M4 — ADR-0027). Owns the ONLY controlled bypass of
-- the ADR-0013 append-only trigger: DELETE on `audit_events` and UPDATE of
-- the `s3_archived_at` bookkeeping column. Created idempotently so the
-- migration applies cleanly against an upgraded DB that doesn't have the
-- role yet (fresh-DB installs get the role via platform-db-init/audit.sql).
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_retention') THEN
		CREATE ROLE audit_retention WITH LOGIN PASSWORD 'audit_retention';
	END IF;
END
$$;--> statement-breakpoint
GRANT CONNECT ON DATABASE audit TO audit_retention;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO audit_retention;--> statement-breakpoint
GRANT SELECT, DELETE ON "audit_events" TO audit_retention;--> statement-breakpoint
GRANT UPDATE ("s3_archived_at") ON "audit_events" TO audit_retention;--> statement-breakpoint
-- Replace the append-only trigger function so the audit_retention role can:
--   (a) DELETE rows (post-archive purge), and
--   (b) UPDATE the s3_archived_at column ONLY — every other column stays
--       immutable, so the audit content the chain hashes over can never be
--       silently mutated. ADR-0013 is preserved for every other role.
CREATE OR REPLACE FUNCTION audit_events_block_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF current_user = 'audit_retention' THEN
		IF TG_OP = 'DELETE' THEN
			RETURN OLD;
		ELSIF TG_OP = 'UPDATE' THEN
			-- Allow only the s3_archived_at column to change. Compare each
			-- audit-content column with IS DISTINCT FROM so NULLs are handled.
			IF (
				NEW.event_id IS DISTINCT FROM OLD.event_id OR
				NEW.timestamp IS DISTINCT FROM OLD.timestamp OR
				NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id OR
				NEW.actor_username IS DISTINCT FROM OLD.actor_username OR
				NEW.actor_display_name IS DISTINCT FROM OLD.actor_display_name OR
				NEW.actor_roles IS DISTINCT FROM OLD.actor_roles OR
				NEW.actor_organization IS DISTINCT FROM OLD.actor_organization OR
				NEW.actor_on_behalf_of IS DISTINCT FROM OLD.actor_on_behalf_of OR
				NEW.source_ip_address IS DISTINCT FROM OLD.source_ip_address OR
				NEW.source_user_agent IS DISTINCT FROM OLD.source_user_agent OR
				NEW.source_session_id IS DISTINCT FROM OLD.source_session_id OR
				NEW.source_correlation_id IS DISTINCT FROM OLD.source_correlation_id OR
				NEW.action IS DISTINCT FROM OLD.action OR
				NEW.target_ehr_id IS DISTINCT FROM OLD.target_ehr_id OR
				NEW.target_subject_id_hash IS DISTINCT FROM OLD.target_subject_id_hash OR
				NEW.target_resource_type IS DISTINCT FROM OLD.target_resource_type OR
				NEW.target_resource_id IS DISTINCT FROM OLD.target_resource_id OR
				NEW.target_archetype_id IS DISTINCT FROM OLD.target_archetype_id OR
				NEW.purpose IS DISTINCT FROM OLD.purpose OR
				NEW.outcome IS DISTINCT FROM OLD.outcome OR
				NEW.outcome_detail IS DISTINCT FROM OLD.outcome_detail OR
				NEW.retention_policy IS DISTINCT FROM OLD.retention_policy OR
				NEW.previous_hash IS DISTINCT FROM OLD.previous_hash OR
				NEW.hash IS DISTINCT FROM OLD.hash
			) THEN
				RAISE EXCEPTION 'audit_events: only s3_archived_at is mutable by audit_retention';
			END IF;
			RETURN NEW;
		END IF;
	END IF;
	RAISE EXCEPTION 'audit_events is append-only: % is not permitted', TG_OP;
END;
$$;
