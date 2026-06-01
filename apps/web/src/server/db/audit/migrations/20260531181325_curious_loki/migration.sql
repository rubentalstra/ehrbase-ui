CREATE TABLE "break_glass_grant" (
	"grant_id" uuid PRIMARY KEY,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_username" text NOT NULL,
	"actor_roles" jsonb NOT NULL,
	"ehr_id" text NOT NULL,
	"subject_id_hash" text,
	"purpose_of_use" text NOT NULL,
	"justification" text NOT NULL,
	"correlation_id" text
);
--> statement-breakpoint
CREATE INDEX "break_glass_grant_actor_idx" ON "break_glass_grant" ("actor_user_id");--> statement-breakpoint
CREATE INDEX "break_glass_grant_ehr_idx" ON "break_glass_grant" ("ehr_id");--> statement-breakpoint
CREATE INDEX "break_glass_grant_granted_idx" ON "break_glass_grant" ("granted_at");--> statement-breakpoint
-- Append-only enforcement (ADR-0013, ADR-0045). break_glass_grant is durable
-- emergency-access evidence; audit_writer is never granted UPDATE or DELETE
-- (default privileges in platform-db-init/audit.sql), and this trigger is the
-- DB-enforced second layer. The audit-reviewer's REVIEW decision (M22) is a
-- separate insert, not a mutation of the grant.
CREATE FUNCTION break_glass_grant_block_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'break_glass_grant is append-only: % is not permitted', TG_OP;
END;
$$;--> statement-breakpoint
CREATE TRIGGER break_glass_grant_no_update_delete
	BEFORE UPDATE OR DELETE ON "break_glass_grant"
	FOR EACH ROW EXECUTE FUNCTION break_glass_grant_block_mutation();