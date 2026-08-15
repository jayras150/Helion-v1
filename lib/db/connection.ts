// Load environment variables
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

config({
  path: [".env.local", ".env"],
});

let db: ReturnType<typeof drizzle> | null = null;

// Only initialize database if POSTGRES_URL is available
if (process.env.POSTGRES_URL) {
  console.log("🗄️  Using PostgreSQL database");
  // Supabase's session pooler has a small per-session connection limit.
  // Vercel can create several warm serverless instances, so the postgres
  // driver's default pool of 10 connections per instance quickly exhausts
  // the pooler and causes EMAXCONNSESSION. Keep one short-lived connection
  // per instance; Drizzle queries remain concurrent at the request level.
  const client = postgres(process.env.POSTGRES_URL, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
  });
  db = drizzle(client, { schema });
}

export default db;
