CREATE TYPE "audit_action" AS ENUM('READ', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'PRINT', 'QUERY', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'SESSION_EXPIRED', 'TOKEN_REFRESH', 'ACCESS_DENIED', 'CONSENT_GRANT', 'CONSENT_WITHDRAW', 'ADMIN_CHANGE', 'EMERGENCY_ACCESS_GRANTED');--> statement-breakpoint
CREATE TYPE "audit_lawful_basis" AS ENUM('9(2)(a)', '9(2)(c)', '9(2)(h)', '9(2)(i)', '9(2)(j)');--> statement-breakpoint
CREATE TYPE "audit_outcome" AS ENUM('SUCCESS', 'FAILURE', 'PARTIAL');--> statement-breakpoint
CREATE TYPE "audit_purpose" AS ENUM('TREATMENT', 'EMERGENCY', 'BILLING', 'QUALITY_ASSURANCE', 'RESEARCH', 'PATIENT_REQUEST', 'LEGAL_OBLIGATION', 'SYSTEM_ADMIN');--> statement-breakpoint
CREATE TYPE "audit_resource_type" AS ENUM('EHR', 'COMPOSITION', 'TEMPLATE', 'QUERY', 'FOLDER', 'CONTRIBUTION', 'SYSTEM');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"event_id" uuid PRIMARY KEY,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_username" text NOT NULL,
	"actor_display_name" text NOT NULL,
	"actor_roles" jsonb NOT NULL,
	"actor_organization" text,
	"actor_on_behalf_of" text,
	"source_ip_address" text NOT NULL,
	"source_user_agent" text NOT NULL,
	"source_session_id" text NOT NULL,
	"source_correlation_id" uuid NOT NULL,
	"action" "audit_action" NOT NULL,
	"target_ehr_id" uuid,
	"target_subject_id_hash" text,
	"target_resource_type" "audit_resource_type",
	"target_resource_id" text,
	"target_archetype_id" text,
	"purpose" "audit_purpose" NOT NULL,
	"lawful_basis" "audit_lawful_basis" NOT NULL,
	"outcome" "audit_outcome" NOT NULL,
	"outcome_detail" text,
	"previous_hash" text,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_events_timestamp_idx" ON "audit_events" ("timestamp");--> statement-breakpoint
CREATE INDEX "audit_events_actor_user_id_idx" ON "audit_events" ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "audit_events" ("action");--> statement-breakpoint
-- Append-only enforcement (ADR-0013). audit_writer is never granted UPDATE or
-- DELETE; this trigger is the second, DB-enforced layer so even a privilege
-- misconfiguration cannot mutate or erase a recorded event.
CREATE FUNCTION audit_events_block_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'audit_events is append-only: % is not permitted', TG_OP;
END;
$$;--> statement-breakpoint
CREATE TRIGGER audit_events_no_update_delete
	BEFORE UPDATE OR DELETE ON "audit_events"
	FOR EACH ROW EXECUTE FUNCTION audit_events_block_mutation();--> statement-breakpoint
-- Explicit least-privilege grant to the runtime writer (belt-and-braces with
-- the ALTER DEFAULT PRIVILEGES in platform-db-init/audit.sql): INSERT + SELECT
-- only — UPDATE and DELETE are never granted.
GRANT INSERT, SELECT ON "audit_events" TO audit_writer;