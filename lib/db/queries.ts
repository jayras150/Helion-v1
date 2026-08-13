import "server-only";

import { and, count, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import db from "./connection";
import {
  app_settings,
  chat_messages,
  type Chat,
  chats,
  type ChatMessage,
  type User,
  users,
} from "./schema";
import { generateHashedPassword } from "./utils";

/** Matches canonical UUID strings (v4-style with dashes). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const authUserColumns = {
  id: users.id,
  email: users.email,
  password: users.password,
  name: users.name,
  image: users.image,
  provider: users.provider,
  provider_account_id: users.provider_account_id,
  created_at: users.created_at,
};

export type AuthUser = Pick<User, "id" | "email" | "password" | "created_at">;

/**
 * Gets the database instance, throwing if not initialized.
 * @throws Error if POSTGRES_URL is not set
 */
function getDb() {
  if (!db) {
    throw new Error("Database not initialized. Ensure POSTGRES_URL is set.");
  }

  return db;
}

/** Retrieves a user by email address. */
export async function getUser(email: string): Promise<AuthUser[]> {
  try {
    return await getDb()
      .select(authUserColumns)
      .from(users)
      .where(eq(users.email, email));
  } catch (error) {
    console.error("Failed to get user from database");
    throw error;
  }
}

/** Retrieves a user by ID. */
export async function getUserById(userId: string): Promise<User | null> {
  try {
    const [user] = await getDb()
      .select(authUserColumns)
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return null;
    }

    return user as User;
  } catch (error) {
    console.error("Failed to get user by ID from database");
    throw error;
  }
}

/** Creates a new user with email and password. */
export async function createUser(
  email: string,
  password: string,
): Promise<void> {
  try {
    const hashedPassword = generateHashedPassword(password);
    const [created] = await getDb().execute(sql`
      insert into "users" ("email", "password")
      values (${email}, ${hashedPassword})
      returning "id"
    `);
    // Self-hosted bootstrap: the very first account becomes the admin.
    if (created) {
      await promoteIfFirstUser((created as { id: string }).id);
    }
  } catch (error) {
    console.error("Failed to create user in database");
    throw error;
  }
}

/**
 * Finds an existing OAuth user, links an existing account by email, or creates
 * a brand-new user for a Google/GitHub sign-in.
 */
export async function findOrCreateOAuthUser({
  provider,
  providerAccountId,
  email,
  name,
  image,
}: {
  provider: "google" | "github";
  providerAccountId: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}): Promise<User> {
  try {
    // 1) Same provider + account id → return existing.
    const [byAccount] = await getDb()
      .select()
      .from(users)
      .where(
        and(
          eq(users.provider, provider),
          eq(users.provider_account_id, providerAccountId),
        ),
      )
      .limit(1);
    if (byAccount) {
      return byAccount;
    }

    // 2) Same email (existing email/password account) → link provider to it.
    if (email) {
      const [byEmail] = await getDb()
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (byEmail) {
        const [linked] = await getDb()
          .update(users)
          .set({
            provider,
            provider_account_id: providerAccountId,
            name: name ?? byEmail.name,
            image: image ?? byEmail.image,
          })
          .where(eq(users.id, byEmail.id))
          .returning();
        return linked;
      }
    }

    // 3) Create a brand-new OAuth user.
    const [created] = await getDb()
      .insert(users)
      .values({
        email: email ?? null,
        password: null,
        name: name ?? null,
        image: image ?? null,
        provider,
        provider_account_id: providerAccountId,
      })
      .returning();
    // Self-hosted bootstrap: the very first account becomes the admin.
    await promoteIfFirstUser(created.id);
    return created;
  } catch (error) {
    console.error("Failed to find or create OAuth user in database");
    throw error;
  }
}

/**
 * Gets (or creates) the app `users` row for a Supabase Auth user, keyed by
 * email. The row carries the app-level id / role used by every chat/project
 * query, so Supabase Auth only handles authentication while the app DB keeps
 * its existing shape.
 */
export async function getOrCreateUserByEmail({
  email,
  name,
  image,
}: {
  email?: string | null;
  name?: string | null;
  image?: string | null;
}): Promise<User> {
  try {
    if (!email) {
      throw new Error("Cannot map a Supabase user without an email");
    }
    const [existing] = await getDb()
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) {
      if ((name && existing.name !== name) || (image && existing.image !== image)) {
        const [updated] = await getDb()
          .update(users)
          .set({ name: name ?? existing.name, image: image ?? existing.image })
          .where(eq(users.id, existing.id))
          .returning();
        return updated ?? existing;
      }
      return existing;
    }
    // New Supabase user → create an app user row (password managed by Supabase).
    const [created] = await getDb()
      .insert(users)
      .values({
        email,
        password: null,
        name: name ?? null,
        image: image ?? null,
        provider: "supabase",
      })
      .returning();
    // Self-hosted bootstrap: the very first account becomes the admin.
    await promoteIfFirstUser(created.id);
    return created;
  } catch (error) {
    console.error("Failed to get or create user by email in database");
    throw error;
  }
}

/**
 * Gets the number of chats created by a user in the specified time window.
 * Used for rate limiting authenticated users.
 */
export async function getChatCountByUserId({
  userId,
  differenceInHours,
}: {
  userId: string;
  differenceInHours: number;
}): Promise<number> {
  try {
    const hoursAgo = new Date(Date.now() - differenceInHours * 60 * 60 * 1000);

    const [stats] = await getDb()
      .select({ count: count(chats.id) })
      .from(chats)
      .where(and(eq(chats.userId, userId), gte(chats.createdAt, hoursAgo)));

    return stats?.count || 0;
  } catch (error) {
    console.error("Failed to get chat count by user from database");
    throw error;
  }
}

/** Gets a single chat by ID. */
export async function getChatById(chatId: string): Promise<Chat | undefined> {
  // Guard: Postgres throws on non-UUID input, which would surface as a 500
  // instead of a clean 404 for malformed/stale chat links.
  if (!UUID_RE.test(chatId)) {
    return undefined;
  }
  try {
    const [chat] = await getDb()
      .select()
      .from(chats)
      .where(eq(chats.id, chatId));
    return chat;
  } catch (error) {
    console.error("Failed to get chat by ID from database");
    throw error;
  }
}

export async function getChatsByUserId(userId: string): Promise<Chat[]> {
  try {
    return await getDb()
      .select()
      .from(chats)
      .where(eq(chats.userId, userId))
      .orderBy(desc(chats.createdAt));
  } catch (error) {
    console.error("Failed to get chats by user from database");
    throw error;
  }
}

/** Creates a new chat for a user. */
export async function createChat({
  userId,
  title,
}: {
  userId: string;
  title: string;
}): Promise<Chat> {
  try {
    const [chat] = await getDb()
      .insert(chats)
      .values({ userId, title: title.slice(0, 255) || "New chat" })
      .returning();
    return chat;
  } catch (error) {
    console.error("Failed to create chat in database");
    throw error;
  }
}

/** Inserts a message into a chat. */
export async function insertChatMessage({
  chatId,
  role,
  content,
  scope,
  sandboxId,
  url,
  snapshotId,
}: {
  chatId: string;
  role: "user" | "assistant";
  content: string;
  scope?: string | null;
  sandboxId?: string | null;
  url?: string | null;
  snapshotId?: string | null;
}): Promise<ChatMessage> {
  try {
    const [message] = await getDb()
      .insert(chat_messages)
      .values({ chatId, role, content, scope, sandboxId, url, snapshotId })
      .returning();

    // Bump the chat's updated_at timestamp
    await getDb()
      .update(chats)
      .set({ updatedAt: new Date() })
      .where(eq(chats.id, chatId));

    return message;
  } catch (error) {
    console.error("Failed to insert chat message in database");
    throw error;
  }
}

/** Gets all messages for a chat, oldest first. */
export async function getChatMessagesByChatId(
  chatId: string,
): Promise<ChatMessage[]> {
  if (!UUID_RE.test(chatId)) {
    return [];
  }
  try {
    return await getDb()
      .select()
      .from(chat_messages)
      .where(eq(chat_messages.chatId, chatId))
      .orderBy(chat_messages.createdAt);
  } catch (error) {
    console.error("Failed to get chat messages from database");
    throw error;
  }
}

/** Returns the latest assistant message of a chat (used for E2B tracking). */
export async function getLatestAssistantMessage(
  chatId: string,
): Promise<ChatMessage | undefined> {
  const rows = await getDb()
    .select()
    .from(chat_messages)
    .where(
      and(eq(chat_messages.chatId, chatId), eq(chat_messages.role, "assistant")),
    )
    .orderBy(desc(chat_messages.createdAt))
    .limit(1);
  return rows[0];
}

/** Replaces a message's content (used to upgrade a plan-only reply with the auto-corrected code). */
export async function updateChatMessageContent(
  messageId: string,
  content: string,
  scope?: string | null,
): Promise<void> {
  try {
    const values: Record<string, unknown> = { content };
    if (scope !== undefined) values.scope = scope;
    await getDb()
      .update(chat_messages)
      .set(values)
      .where(eq(chat_messages.id, messageId));
  } catch (error) {
    console.error("Failed to update chat message content");
    throw error;
  }
}

/** Updates the E2B deployment fields on a single message. */
export async function updateChatMessageDeployment({
  messageId,
  sandboxId,
  url,
  snapshotId,
}: {
  messageId: string;
  sandboxId?: string | null;
  url?: string | null;
  snapshotId?: string | null;
}): Promise<void> {
  try {
    const values: Record<string, unknown> = {};
    if (sandboxId !== undefined) values.sandboxId = sandboxId;
    if (url !== undefined) values.url = url;
    if (snapshotId !== undefined) values.snapshotId = snapshotId;
    if (Object.keys(values).length === 0) return;

    await getDb()
      .update(chat_messages)
      .set(values)
      .where(eq(chat_messages.id, messageId));
  } catch (error) {
    console.error("Failed to update chat message deployment");
    throw error;
  }
}

/** Deletes a chat and its messages (cascade). */
export async function deleteChat({
  chatId,
  userId,
}: {
  chatId: string;
  userId: string;
}): Promise<void> {
  if (!UUID_RE.test(chatId)) {
    return;
  }
  try {
    await getDb()
      .delete(chats)
      .where(and(eq(chats.id, chatId), eq(chats.userId, userId)));
  } catch (error) {
    console.error("Failed to delete chat from database");
    throw error;
  }
}

/**
 * Returns lightweight project summaries for a user in a single query —
 * chat metadata + message count + first user message (used as the project
 * name). Avoids the N+1 query pattern for fast list loading.
 */
export async function getProjectSummariesByUserId(userId: string): Promise<
  Array<{
    id: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    messageCount: number;
    firstUserMessage: string | null;
  }>
> {
  try {
    return await getDb()
      .select({
        id: chats.id,
        title: chats.title,
        createdAt: chats.createdAt,
        updatedAt: chats.updatedAt,
        messageCount: count(chat_messages.id),
        firstUserMessage: sql<string | null>`(
          select content
          from chat_messages
          where chat_id = ${chats.id} and role = 'user'
          order by created_at asc
          limit 1
        )`,
      })
      .from(chats)
      .leftJoin(chat_messages, eq(chat_messages.chatId, chats.id))
      .where(eq(chats.userId, userId))
      .groupBy(chats.id)
      .orderBy(desc(chats.createdAt));
  } catch (error) {
    console.error("Failed to get project summaries from database");
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

/** Promotes a user to admin when they are the only account in the DB. */
export async function promoteIfFirstUser(userId: string): Promise<void> {
  try {
    const [row] = await getDb().select({ count: count() }).from(users);
    if (row?.count === 1) {
      await getDb().update(users).set({ role: "admin" }).where(eq(users.id, userId));
    }
  } catch (error) {
    console.error("Failed to promote first user to admin");
    throw error;
  }
}

/** Returns the admin-facing subset of a user row. */
export async function getAdminUser(
  userId: string,
): Promise<{ id: string; email: string | null; name: string | null; role: string } | null> {
  if (!UUID_RE.test(userId)) {
    return null;
  }
  try {
    const [u] = await getDb()
      .select({ id: users.id, email: users.email, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.id, userId));
    return u ?? null;
  } catch (error) {
    console.error("Failed to get admin user");
    throw error;
  }
}

/** Number of users with the admin role. */
export async function countAdminUsers(): Promise<number> {
  try {
    const [row] = await getDb()
      .select({ count: count() })
      .from(users)
      .where(eq(users.role, "admin"));
    return row?.count ?? 0;
  } catch (error) {
    console.error("Failed to count admin users");
    throw error;
  }
}

/** Sets a user's role ('user' | 'admin'). */
export async function setUserRole(userId: string, role: string): Promise<void> {
  if (!UUID_RE.test(userId) || (role !== "admin" && role !== "user")) {
    return;
  }
  try {
    await getDb().update(users).set({ role }).where(eq(users.id, userId));
  } catch (error) {
    console.error("Failed to set user role");
    throw error;
  }
}

export type AdminStats = {
  totalUsers: number;
  totalChats: number;
  totalMessages: number;
  totalDeployments: number;
  scopeBreakdown: { scope: string; count: number }[];
  chatsPerDay: { day: string; count: number }[];
  recentChats: {
    id: string;
    title: string;
    userEmail: string | null;
    messageCount: number;
    createdAt: Date;
  }[];
};

/** Aggregated platform stats for the admin dashboard. */
export async function getAdminStats(): Promise<AdminStats> {
  try {
    const [userCount] = await getDb().select({ count: count() }).from(users);
    const [chatCount] = await getDb().select({ count: count() }).from(chats);
    const [msgCount] = await getDb().select({ count: count() }).from(chat_messages);
    const [deployCount] = await getDb()
      .select({ count: count() })
      .from(chat_messages)
      .where(isNotNull(chat_messages.sandboxId));

    const scopeRows = await getDb()
      .select({ scope: chat_messages.scope, count: count() })
      .from(chat_messages)
      .where(isNotNull(chat_messages.scope))
      .groupBy(chat_messages.scope);

    // Chats created per day over the last 14 days (zero-filled client-side).
    const dayRows = await getDb()
      .select({
        day: sql<string>`to_char(${chats.createdAt}, 'YYYY-MM-DD')`,
        count: count(),
      })
      .from(chats)
      .where(gte(chats.createdAt, new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)))
      .groupBy(sql`to_char(${chats.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${chats.createdAt}, 'YYYY-MM-DD')`);

    const recentChats = await getDb()
      .select({
        id: chats.id,
        title: chats.title,
        userEmail: users.email,
        messageCount: count(chat_messages.id),
        createdAt: chats.createdAt,
      })
      .from(chats)
      .leftJoin(users, eq(users.id, chats.userId))
      .leftJoin(chat_messages, eq(chat_messages.chatId, chats.id))
      .groupBy(chats.id, users.email)
      .orderBy(desc(chats.createdAt))
      .limit(8);

    return {
      totalUsers: userCount?.count ?? 0,
      totalChats: chatCount?.count ?? 0,
      totalMessages: msgCount?.count ?? 0,
      totalDeployments: deployCount?.count ?? 0,
      scopeBreakdown: scopeRows.map((r) => ({ scope: r.scope ?? "text", count: r.count })),
      chatsPerDay: dayRows.map((r) => ({ day: r.day, count: r.count })),
      recentChats: recentChats.map((c) => ({
        id: c.id,
        title: c.title,
        userEmail: c.userEmail,
        messageCount: c.messageCount,
        createdAt: c.createdAt,
      })),
    };
  } catch (error) {
    console.error("Failed to get admin stats");
    throw error;
  }
}

/** All users with their chat counts, newest first. */
export async function getAdminUsers(): Promise<
  Array<{
    id: string;
    email: string | null;
    name: string | null;
    provider: string;
    role: string;
    createdAt: Date;
    chatCount: number;
  }>
> {
  try {
    return await getDb()
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        provider: users.provider,
        role: users.role,
        createdAt: users.created_at,
        chatCount: count(chats.id),
      })
      .from(users)
      .leftJoin(chats, eq(chats.userId, users.id))
      .groupBy(users.id)
      .orderBy(desc(users.created_at));
  } catch (error) {
    console.error("Failed to get admin users");
    throw error;
  }
}

/** All chats with owner + message count, most recently updated first. */
export async function getAdminChats(userId?: string): Promise<
  Array<{
    id: string;
    title: string;
    userEmail: string | null;
    scope: string | null;
    messageCount: number;
    createdAt: Date;
    updatedAt: Date;
  }>
> {
  try {
    const query = getDb()
      .select({
        id: chats.id,
        title: chats.title,
        userEmail: users.email,
        scope: sql<string | null>`(
          select scope from chat_messages
          where chat_id = ${chats.id} and scope is not null
          order by created_at desc limit 1
        )`,
        messageCount: count(chat_messages.id),
        createdAt: chats.createdAt,
        updatedAt: chats.updatedAt,
      })
      .from(chats)
      .leftJoin(users, eq(users.id, chats.userId))
      .leftJoin(chat_messages, eq(chat_messages.chatId, chats.id));

    const rows = await (UUID_RE.test(userId ?? "")
      ? query.where(eq(chats.userId, userId!))
      : query)
      .groupBy(chats.id, users.email)
      .orderBy(desc(chats.updatedAt))
      .limit(200);

    return rows;
  } catch (error) {
    console.error("Failed to get admin chats");
    throw error;
  }
}

/** Full user row for admin management (includes provider + password presence). */
export async function getAdminUserRow(userId: string): Promise<{
  id: string;
  email: string | null;
  name: string | null;
  provider: string;
  role: string;
  createdAt: Date;
  hasPassword: boolean;
} | null> {
  if (!UUID_RE.test(userId)) {
    return null;
  }
  try {
    const [u] = await getDb()
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        provider: users.provider,
        role: users.role,
        createdAt: users.created_at,
        password: users.password,
      })
      .from(users)
      .where(eq(users.id, userId));
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      provider: u.provider,
      role: u.role,
      createdAt: u.createdAt,
      hasPassword: Boolean(u.password),
    };
  } catch (error) {
    console.error("Failed to get admin user row");
    throw error;
  }
}

/** Updates a user's display name and/or email (admin action). */
export async function updateUserProfile({
  userId,
  name,
  email,
}: {
  userId: string;
  name?: string;
  email?: string;
}): Promise<void> {
  if (!UUID_RE.test(userId)) {
    return;
  }
  try {
    const patch: Record<string, string> = {};
    if (name !== undefined) patch.name = name;
    if (email !== undefined) patch.email = email;
    if (Object.keys(patch).length === 0) return;
    await getDb().update(users).set(patch).where(eq(users.id, userId));
  } catch (error) {
    console.error("Failed to update user profile");
    throw error;
  }
}

/** Sets a new password for a user (admin password reset). */
export async function setUserPassword(
  userId: string,
  plainTextPassword: string,
): Promise<void> {
  if (!UUID_RE.test(userId) || !plainTextPassword) {
    return;
  }
  try {
    // Only set the password — leave `provider` untouched so OAuth users can
    // still sign in via their provider (they just also get a password now).
    await getDb()
      .update(users)
      .set({ password: generateHashedPassword(plainTextPassword) })
      .where(eq(users.id, userId));
  } catch (error) {
    console.error("Failed to set user password");
    throw error;
  }
}

/** Deletes a user account; their chats/messages cascade. */
export async function deleteUserAccount(userId: string): Promise<void> {
  if (!UUID_RE.test(userId)) {
    return;
  }
  try {
    await getDb().delete(users).where(eq(users.id, userId));
  } catch (error) {
    console.error("Failed to delete user account");
    throw error;
  }
}

/** Reads a value from the `app_settings` key-value store (null when unset). */
export async function getSetting(key: string): Promise<string | null> {
  const rows = await getDb()
    .select()
    .from(app_settings)
    .where(eq(app_settings.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

/** Inserts or updates a value in the `app_settings` key-value store. */
export async function upsertSetting(key: string, value: string): Promise<void> {
  await getDb()
    .insert(app_settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: app_settings.key,
      set: { value, updatedAt: new Date() },
    });
}
