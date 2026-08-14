import "server-only";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads/writes credential values in the project `.env` file WITHOUT ever
 * exposing the plain-text values (the API only reports whether a key is set).
 *
 * - Prefers `.env.local` when present, otherwise `.env`.
 * - Preserves comments/order of existing lines; appends new keys at the end.
 * - Also mirrors the value into `process.env` at runtime so lazily-read vars
 *   (e.g. E2B_API_KEY, HELION_ADMIN_EMAILS) take effect immediately. Keys
 *   baked at module load (AI provider, OAuth, DB) still need a server restart
 *   — flagged via `requiresRestart`.
 */

export type CredentialGroup =
  | "ai"
  | "backend"
  | "database"
  | "auth"
  | "supabase"
  | "other";

export type CredentialDef = {
  key: string;
  label: string;
  description: string;
  secret: boolean;
  requiresRestart: boolean;
  group: CredentialGroup;
};

export const CREDENTIAL_DEFS: CredentialDef[] = [
  // AI provider
  { key: "AI_API_KEY", label: "AI API Key", description: "AI provider API key (DeepSeek/OpenAI/etc.)", secret: true, requiresRestart: false, group: "ai" },
  { key: "AI_BASE_URL", label: "AI Base URL", description: "OpenAI-compatible endpoint, e.g. https://api.deepseek.com/v1", secret: false, requiresRestart: false, group: "ai" },
  { key: "AI_MODEL", label: "AI Model", description: "Default model, e.g. deepseek-v4-flash", secret: false, requiresRestart: false, group: "ai" },
  // Backend sandbox
  { key: "E2B_API_KEY", label: "E2B API Key", description: "Runs project backends in E2B sandboxes", secret: true, requiresRestart: false, group: "backend" },
  { key: "E2B_TEMPLATE", label: "E2B Template", description: "E2B sandbox template (name or ID), e.g. vite-react-fast. Leave empty for default.", secret: false, requiresRestart: false, group: "backend" },
  // Database
  { key: "POSTGRES_URL", label: "Database URL", description: "PostgreSQL connection string (Neon/etc.)", secret: true, requiresRestart: true, group: "database" },
  // Auth
  { key: "AUTH_SECRET", label: "Auth Secret", description: "Login session secret (do not leak)", secret: true, requiresRestart: true, group: "auth" },
  { key: "AUTH_GOOGLE_ID", label: "Google Client ID", description: "OAuth Google client id", secret: true, requiresRestart: true, group: "auth" },
  { key: "AUTH_GOOGLE_SECRET", label: "Google Client Secret", description: "OAuth Google client secret", secret: true, requiresRestart: true, group: "auth" },
  { key: "AUTH_GITHUB_ID", label: "GitHub Client ID", description: "OAuth GitHub client id", secret: true, requiresRestart: true, group: "auth" },
  { key: "AUTH_GITHUB_SECRET", label: "GitHub Client Secret", description: "OAuth GitHub client secret", secret: true, requiresRestart: true, group: "auth" },
  // Supabase (prep)
  { key: "NEXT_PUBLIC_SUPABASE_URL", label: "Supabase URL", description: "Supabase project URL", secret: false, requiresRestart: true, group: "supabase" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", label: "Supabase Anon Key", description: "Supabase public anon key", secret: true, requiresRestart: true, group: "supabase" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase Service Role Key", description: "Supabase service role (secret!)", secret: true, requiresRestart: true, group: "supabase" },
  // Other
  { key: "HELION_ADMIN_EMAILS", label: "Admin Emails", description: "Emails with admin access (comma-separated)", secret: false, requiresRestart: false, group: "other" },
];

export function getEnvFilePath(): string {
  const local = join(process.cwd(), ".env.local");
  return existsSync(local) ? local : join(process.cwd(), ".env");
}

/** Minimal .env parser (handles KEY=value and KEY="value"). */
function parseEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1).replace(/\\"/g, '"');
    } else {
      // strip inline comment (but not inside quotes — handled above)
      val = val.split(/\s+#/)[0].trim();
    }
    out[m[1]] = val;
  }
  return out;
}

/** Returns whether each credential key currently has a value (no plain text). */
export function readCredentialStatus(): { key: string; set: boolean }[] {
  const path = getEnvFilePath();
  const content = existsSync(path) ? readFileSync(path, "utf8") : "";
  const parsed = parseEnv(content);
  return CREDENTIAL_DEFS.map((d) => ({
    key: d.key,
    set: Boolean(parsed[d.key] ?? process.env[d.key]),
  }));
}

/**
 * Returns the current plain-text value of each credential key ("" when unset).
 * The API only exposes these for NON-SECRET keys (endpoint, model, etc.) —
 * secret values are never returned.
 */
export function readCredentialValues(): { key: string; value: string }[] {
  const path = getEnvFilePath();
  const content = existsSync(path) ? readFileSync(path, "utf8") : "";
  const parsed = parseEnv(content);
  return CREDENTIAL_DEFS.map((d) => ({
    key: d.key,
    value: parsed[d.key] ?? process.env[d.key] ?? "",
  }));
}

function escapeEnvValue(value: string): string {
  const needsQuote = /[\s#"']/.test(value);
  return needsQuote ? `"${value.replace(/"/g, '\\"')}"` : value;
}

/**
 * Sets (or clears when value === "") a credential in the .env file and
 * mirrors it into process.env at runtime.
 */
export function setCredentialValue(key: string, value: string): void {
  const def = CREDENTIAL_DEFS.find((d) => d.key === key);
  if (!def) {
    throw new Error(`Key "${key}" is not allowed to be changed.`);
  }

  const path = getEnvFilePath();
  const content = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = content.split(/\r?\n/);
  const re = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=.*$`);
  let found = false;

  const next = lines.map((line) => {
    if (re.test(line)) {
      found = true;
      return value ? `${key}=${escapeEnvValue(value)}` : `# ${key}=`;
    }
    return line;
  });

  if (!found) {
    next.push(value ? `${key}=${escapeEnvValue(value)}` : `# ${key}=`);
  }

  writeFileSync(path, next.join("\n").replace(/\n+$/, "") + "\n", "utf8");

  // Runtime mirror for lazily-read vars (E2B_API_KEY, HELION_ADMIN_EMAILS, …).
  if (value) {
    process.env[key] = value;
  } else {
    delete process.env[key];
  }
}

/**
 * Rewrites the env file grouping keys by `CREDENTIAL_DEFS` groups and
 * preserving current values. Unknown keys are appended at the end.
 * This makes the .env file tidy and easy to review.
 */
export function normalizeEnvFile(): void {
  const path = getEnvFilePath();
  const content = existsSync(path) ? readFileSync(path, "utf8") : "";
  const parsed = parseEnv(content);

  const groups: Record<string, CredentialDef[]> = {};
  for (const d of CREDENTIAL_DEFS) {
    groups[d.group] = groups[d.group] ?? [];
    groups[d.group].push(d);
  }

  const lines: string[] = [];
  for (const grp of Object.keys(groups)) {
    const label = grp;
    lines.push(`# ${label.toUpperCase()}`);
    for (const def of groups[grp]) {
      const val = parsed[def.key] ?? process.env[def.key] ?? "";
      if (val) {
        lines.push(`${def.key}=${escapeEnvValue(val)}`);
      } else {
        lines.push(`# ${def.key}=`);
      }
    }
    lines.push("");
  }

  // Append any keys in the file that aren't defined in CREDENTIAL_DEFS
  const known = new Set(CREDENTIAL_DEFS.map((d) => d.key));
  const extras = Object.keys(parsed).filter((k) => !known.has(k));
  if (extras.length > 0) {
    lines.push("# EXTRA CONFIGURATION (preserved)");
    for (const k of extras) {
      const v = parsed[k];
      if (v) lines.push(`${k}=${escapeEnvValue(v)}`);
      else lines.push(`# ${k}=`);
    }
    lines.push("");
  }

  writeFileSync(path, lines.join("\n").replace(/\n+$/, "") + "\n", "utf8");
}
