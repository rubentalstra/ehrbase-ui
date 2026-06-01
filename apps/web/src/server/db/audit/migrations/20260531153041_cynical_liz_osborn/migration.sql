CREATE TYPE "audit_action" AS ENUM('CREATE', 'READ', 'UPDATE', 'DELETE', 'QUERY', 'EXECUTE', 'ACCESS_DENIED');--> statement-breakpoint
CREATE TABLE "audit_event" (
	"event_id" uuid PRIMARY KEY,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_time" timestamp with time zone NOT NULL,
	"action" "audit_action" NOT NULL,
	"outcome" integer NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_username" text NOT NULL,
	"actor_roles" jsonb NOT NULL,
	"purpose_of_use" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"subject_id_hash" text,
	"source_component" text NOT NULL,
	"correlation_id" text,
	"detail" text,
	"message" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_event_subject_idx" ON "audit_event" ("subject_id_hash");--> statement-breakpoint
CREATE INDEX "audit_event_actor_idx" ON "audit_event" ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_event_recorded_idx" ON "audit_event" ("recorded_at");--> statement-breakpoint
CREATE INDEX "audit_event_resource_idx" ON "audit_event" ("resource_type");--> statement-breakpoint
-- Append-only enforcement (ADR-0013, ADR-0041). audit_writer is never granted
-- UPDATE or DELETE (platform-db-init/audit.sql); this trigger is the second,
-- DB-enforced layer so even a privilege escalation cannot mutate the IHE ATNA
-- access trail. The tamper-evidence hash chain is deferred hardening.
CREATE FUNCTION audit_event_block_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'audit_event is append-only: % is not permitted', TG_OP;
END;
$$;--> statement-breakpoint
CREATE TRIGGER audit_event_no_update_delete
	BEFORE UPDATE OR DELETE ON "audit_event"
	FOR EACH ROW EXECUTE FUNCTION audit_event_block_mutation();