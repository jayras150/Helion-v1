ALTER TABLE "users" ADD COLUMN "role" varchar(16) DEFAULT 'user' NOT NULL;
--> statement-breakpoint
-- Self-hosted bootstrap: the first (oldest) account becomes the admin.
UPDATE "users" SET "role" = 'admin'
WHERE "id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1);
