ALTER TABLE "users" ADD COLUMN "name" varchar(255);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "image" varchar(512);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "provider" varchar(32) DEFAULT 'credentials' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "provider_account_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
