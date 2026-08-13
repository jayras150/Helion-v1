import type { InferSelectModel } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }),
  password: varchar("password", { length: 64 }),
  // OAuth profile data
  name: varchar("name", { length: 255 }),
  image: varchar("image", { length: 512 }),
  provider: varchar("provider", { length: 32 }).notNull().default("credentials"),
  provider_account_id: varchar("provider_account_id", { length: 255 }),
  role: varchar("role", { length: 16 }).notNull().default("user"),
  v0_api_key_encrypted: varchar("v0_api_key_encrypted", { length: 512 }),
  v0_api_key_iv: varchar("v0_api_key_iv", { length: 64 }),
  v0_api_key_updated_at: timestamp("v0_api_key_updated_at"),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export type User = InferSelectModel<typeof users>;

// Simple ownership mapping for v0 chats
// The actual chat data lives in v0 API, we just track who owns what
export const chat_ownerships = pgTable(
  "chat_ownerships",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    v0_chat_id: varchar("v0_chat_id", { length: 255 }).notNull(), // v0 API chat ID
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    // Ensure each v0 chat can only be owned by one user
    unique_v0_chat: unique().on(table.v0_chat_id),
  }),
);

export type ChatOwnership = InferSelectModel<typeof chat_ownerships>;

/**
 * Local chats — stored entirely in your own PostgreSQL database.
 * No dependency on the v0 cloud API.
 */
export const chats = pgTable("chats", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull().default("New chat"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Chat = InferSelectModel<typeof chats>;

/** Messages belonging to a local chat. */
export const chat_messages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chat_id")
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 16 }).notNull(),
  content: text("content").notNull().default(""),
  // Detected scope for assistant messages: frontend | backend | fullstack | text
  scope: varchar("scope", { length: 16 }),
  // E2B deployment tracking for backend/fullstack messages
  sandboxId: varchar("sandbox_id", { length: 255 }),
  url: varchar("url", { length: 512 }),
  snapshotId: varchar("snapshot_id", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ChatMessage = InferSelectModel<typeof chat_messages>;

/**
 * Simple key-value settings store (e.g. the editable AI system prompt).
 * Values are plain text; the app falls back to built-in defaults when a key
 * has no row yet.
 */
export const app_settings = pgTable("app_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AppSetting = InferSelectModel<typeof app_settings>;
