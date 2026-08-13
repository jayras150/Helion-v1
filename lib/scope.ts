/**
 * Scope detection — determines whether a user request targets a frontend,
 * backend, fullstack, or plain text answer.
 *
 * Strategy (hybrid):
 *  1. `detectScopeFromPrompt` — fast keyword heuristic on the user's prompt.
 *  2. `parseScopeTag` — reads the authoritative `<!-- scope:... -->` tag the
 *     model is instructed to emit as the very first line of its reply.
 *
 * The tag wins when present; otherwise we fall back to the heuristic, and
 * finally to `frontend` (HELION's default output).
 */

export type Scope = "frontend" | "backend" | "fullstack" | "text";

export const SCOPE_LABELS: Record<Scope, string> = {
  frontend: "Frontend",
  backend: "Backend",
  fullstack: "Fullstack",
  text: "Chat",
};

const BACKEND_KEYWORDS = [
  "server",
  "backend",
  "api",
  "rest api",
  "restful",
  "endpoint",
  "database",
  "crud",
  "express",
  "prisma",
  "postgres",
  "postgresql",
  "mysql",
  "mongodb",
  "webhook",
  "websocket",
  "socket",
  "graphql",
  "redis",
  "node.js",
  "nodejs",
  "django",
  "flask",
  "fastapi",
  "supabase",
  "middleware",
  "jwt",
  "auth",
  "authentication",
  "stripe",
  "payment gateway",
];

const FRONTEND_KEYWORDS = [
  "landing page",
  "landing",
  "dashboard",
  "component",
  "ui",
  "website",
  "halaman",
  "button",
  "form",
  "tailwind",
  "react",
  "frontend",
  "page",
  "design",
  "tampilan",
  "layout",
  "hero",
  "navbar",
  "footer",
  "card",
  "modal",
  "animasi",
  "animation",
  "responsive",
  "pricing",
  "todo app",
  "halaman utama",
  "halaman login",
  "login page",
  "register page",
];

/** Fast keyword heuristic. Returns the most likely scope for a prompt. */
export function detectScopeFromPrompt(prompt: string): Scope {
  const lower = prompt.toLowerCase();
  let backendScore = 0;
  let frontendScore = 0;

  for (const kw of BACKEND_KEYWORDS) {
    if (lower.includes(kw)) {
      backendScore += 1;
    }
  }
  for (const kw of FRONTEND_KEYWORDS) {
    if (lower.includes(kw)) {
      frontendScore += 1;
    }
  }

  if (backendScore > 0 && frontendScore > 0) {
    return "fullstack";
  }
  if (backendScore > 0) {
    return "backend";
  }
  // HELION's default is building frontend apps.
  return "frontend";
}

const SCOPE_TAG_RE = /<!--\s*scope\s*:\s*(frontend|backend|fullstack|text)\s*-->/i;

/** Reads the model-emitted scope tag from a reply, if present. */
export function parseScopeTag(text: string): Scope | null {
  const match = text.match(SCOPE_TAG_RE);
  if (match) {
    return match[1].toLowerCase() as Scope;
  }
  return null;
}

/** Resolves the effective scope: tag first, then heuristic, then default. */
export function resolveScope(
  fullText: string,
  prompt?: string,
): Scope {
  return parseScopeTag(fullText) ?? (prompt ? detectScopeFromPrompt(prompt) : "frontend");
}

/** True when the scope needs an E2B sandbox to run. */
export function requiresBackend(scope: Scope): boolean {
  return scope === "backend" || scope === "fullstack";
}
