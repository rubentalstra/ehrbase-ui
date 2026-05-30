CREATE TYPE "demographic_change_type" AS ENUM('creation', 'modification', 'deletion');--> statement-breakpoint
CREATE TYPE "demographic_gender" AS ENUM('male', 'female', 'other', 'unknown');--> statement-breakpoint
CREATE TYPE "demographic_relationship_type" AS ENUM('next-of-kin', 'emergency-contact', 'guardian', 'parent', 'child', 'spouse', 'caregiver', 'other');--> statement-breakpoint
CREATE TABLE "demographic_party" (
	"id" uuid PRIMARY KEY,
	"version" integer NOT NULL,
	"active" boolean NOT NULL,
	"gender" "demographic_gender",
	"birth_date" text,
	"deceased" text,
	"snapshot" jsonb NOT NULL,
	"merged_into" uuid,
	"committed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committer_user_id" text NOT NULL,
	"committer_display_name" text NOT NULL,
	"change_type" "demographic_change_type" NOT NULL,
	"change_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demographic_party_history" (
	"id" uuid,
	"version" integer,
	"active" boolean NOT NULL,
	"gender" "demographic_gender",
	"birth_date" text,
	"deceased" text,
	"snapshot" jsonb NOT NULL,
	"merged_into" uuid,
	"committed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committer_user_id" text NOT NULL,
	"committer_display_name" text NOT NULL,
	"change_type" "demographic_change_type" NOT NULL,
	"change_description" text,
	CONSTRAINT "demographic_party_history_pkey" PRIMARY KEY("id","version")
);
--> statement-breakpoint
CREATE TABLE "demographic_party_identifier" (
	"party_id" uuid,
	"identifier_id" text,
	"namespace" text NOT NULL,
	"value" text NOT NULL,
	"start" text,
	"end" text,
	CONSTRAINT "demographic_party_identifier_pkey" PRIMARY KEY("party_id","identifier_id")
);
--> statement-breakpoint
CREATE TABLE "demographic_party_name" (
	"party_id" uuid,
	"seq" integer,
	"use" text,
	"family" text,
	"given" text,
	CONSTRAINT "demographic_party_name_pkey" PRIMARY KEY("party_id","seq")
);
--> statement-breakpoint
CREATE TABLE "demographic_relationship" (
	"id" uuid PRIMARY KEY,
	"source_party_id" uuid NOT NULL,
	"target_party_id" uuid NOT NULL,
	"type" "demographic_relationship_type" NOT NULL,
	"start" text,
	"end" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "demographic_party_active_idx" ON "demographic_party" ("active");--> statement-breakpoint
CREATE INDEX "demographic_party_birth_date_idx" ON "demographic_party" ("birth_date");--> statement-breakpoint
CREATE UNIQUE INDEX "demographic_party_identifier_active_uq" ON "demographic_party_identifier" ("namespace","value") WHERE "end" is null;--> statement-breakpoint
CREATE INDEX "demographic_party_identifier_lookup_idx" ON "demographic_party_identifier" ("namespace","value");--> statement-breakpoint
CREATE INDEX "demographic_party_name_family_idx" ON "demographic_party_name" ("family");--> statement-breakpoint
CREATE INDEX "demographic_party_name_given_idx" ON "demographic_party_name" ("given");--> statement-breakpoint
CREATE INDEX "demographic_relationship_source_idx" ON "demographic_relationship" ("source_party_id");--> statement-breakpoint
CREATE INDEX "demographic_relationship_target_idx" ON "demographic_relationship" ("target_party_id");--> statement-breakpoint
-- Explicit least-privilege grant to the runtime writer (belt-and-braces with the
-- ALTER DEFAULT PRIVILEGES in platform-db-init/demographic.sql). Unlike `audit`,
-- the demographic store is CRUD (VERSIONED_PARTY: insert snapshots, update the
-- current row, rebuild index tables) — so the writer needs full DML. ADR-0031.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "demographic_party",
  "demographic_party_history",
  "demographic_party_identifier",
  "demographic_party_name",
  "demographic_relationship"
TO demographic_writer;
