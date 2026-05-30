ALTER TYPE "audit_resource_type" ADD VALUE 'PARTY';--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "source_adapter_name" text;