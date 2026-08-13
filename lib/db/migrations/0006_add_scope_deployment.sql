ALTER TABLE "chat_messages" ADD COLUMN "scope" varchar(16);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "sandbox_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "url" varchar(512);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "snapshot_id" varchar(255);
