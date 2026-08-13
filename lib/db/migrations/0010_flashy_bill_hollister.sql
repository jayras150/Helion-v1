CREATE TABLE "app_settings" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
