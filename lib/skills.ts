import "server-only";

import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";
import { upsertSetting } from "@/lib/db/queries";
import { getSystemPrompt } from "@/lib/system-prompt";
import { getStarterGuidance, detectStarterKind } from "@/lib/starters";

/**
 * Skill integration for the HELION AI.
 *
 * Skills are vendored from https://github.com/Jeffallan/claude-skills into
 * `content/skills/<name>/SKILL.md` (MIT). Each file has YAML frontmatter
 * (name, description, metadata.domain, metadata.triggers).
 *
 * Injecting all 67 skills into every request would blow the context budget, so
 * this follows the repo's own "context-aware activation" idea:
 *   1. A compact catalog of the ENABLED skills is always injected.
 *   2. Only the SKILL.md of skills that MATCH the user's message (keyword
 *      scoring against name/description/triggers) are injected in full,
 *      capped at MAX_MATCHED_SKILLS and truncated per skill.
 * Admins pick which skills are enabled from `/admin/settings` (persisted in
 * the DB via `app_settings.skills_enabled`).
 */

const SKILLS_DIR = path.join(process.cwd(), "content", "skills");
const ENABLED_KEY = "skills_enabled";

/** Skills are disabled to keep every generation prompt small and predictable. */
export const DEFAULT_ENABLED_SKILLS: string[] = [];

const MAX_MATCHED_SKILLS = 3;
const MAX_SKILL_CHARS = 3_000;
/** Hard cap on the TOTAL skill content injected per request (prompt budget). */
const MAX_SKILL_TOTAL_CHARS = 3_000;

export type SkillMeta = {
  name: string;
  description: string;
  domain: string;
  triggers: string[];
};

function parseSkillMeta(name: string, content: string): SkillMeta {
  const meta: SkillMeta = { name, description: "", domain: "", triggers: [] };
  const nameMatch = content.match(/^name:\s*(.+)$/m);
  const descMatch = content.match(/^description:\s*(.+)$/m);
  const domainMatch = content.match(/^  domain:\s*(.+)$/m);
  const triggersMatch = content.match(/^  triggers:\s*(.+)$/m);
  if (nameMatch) meta.name = nameMatch[1].trim();
  if (descMatch) meta.description = descMatch[1].trim();
  if (domainMatch) meta.domain = domainMatch[1].trim();
  if (triggersMatch) {
    meta.triggers = triggersMatch[1]
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return meta;
}

/** Returns the SKILL.md body (frontmatter stripped). */
export function getSkillContent(name: string): string | null {
  const file = path.join(SKILLS_DIR, name, "SKILL.md");
  if (!existsSync(file)) {
    return null;
  }
  const content = readFileSync(file, "utf8");
  const m = content.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/);
  return (m?.[1] ?? content).trim();
}

/** Lists all vendored skills (meta only, sorted by name). */
export function listSkills(): SkillMeta[] {
  if (!existsSync(SKILLS_DIR)) {
    return [];
  }
  const out: SkillMeta[] = [];
  for (const entry of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const md = path.join(SKILLS_DIR, entry.name, "SKILL.md");
    if (!existsSync(md)) {
      continue;
    }
    const content = readFileSync(md, "utf8");
    out.push(parseSkillMeta(entry.name, content));
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Returns no skills; legacy DB skill settings are intentionally ignored. */
export async function getEnabledSkills(): Promise<string[]> {
  // Do not inject any vendored SKILL.md content, including stale DB settings.
  return [];
}

/** Enables/disables a skill and persists the list to the DB. */
export async function setSkillEnabled(
  name: string,
  enabled: boolean,
): Promise<string[]> {
  // Keep the feature disabled even if an old admin page sends an enable request.
  await upsertSetting(ENABLED_KEY, JSON.stringify([]));
  return [];
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9+#.\-]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

/**
 * Scores enabled skills against the user message and returns the top matches
 * (context-aware activation), mirroring how the claude-skills repo activates
 * skills per request.
 */
export function matchSkills(
  userMessage: string,
  enabled: Set<string>,
  all: SkillMeta[],
): SkillMeta[] {
  const words = tokenize(userMessage);
  const scored: Array<{ skill: SkillMeta; score: number }> = [];

  for (const meta of all) {
    if (!enabled.has(meta.name)) {
      continue;
    }
    const haystack = `${meta.name} ${meta.description} ${meta.triggers.join(" ")}`
      .toLowerCase();
    let score = 0;
    for (const word of words) {
      if (word.length < 3) {
        continue;
      }
      if (haystack.includes(word)) {
        score += 1;
      }
      if (meta.name.includes(word)) {
        score += 2;
      }
    }
    if (score > 0) {
      scored.push({ skill: meta, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_MATCHED_SKILLS).map((s) => s.skill);
}

/** Compact catalog of the enabled skills, always injected into the prompt. */
function buildCatalog(all: SkillMeta[], enabled: Set<string>): string {
  const rows = all
    .filter((s) => enabled.has(s.name))
    .map((s) => `- **${s.name}**${s.domain ? ` [${s.domain}]` : ""}: ${s.description}`)
    .join("\n");
  return [
    "## AVAILABLE SKILLS",
    "You may use the skills below. When a skill matches what the user asks for,",
    "follow its SKILL instructions (injected after the catalog) to improve quality.",
    rows,
  ].join("\n");
}

/**
 * Hard contract appended to EVERY system prompt (regardless of the editable
 * base prompt) so models that tend to reply with a plan/outline instead of
 * actual code get reined in.
 */
const OUTPUT_CONTRACT = `## OUTPUT CONTRACT (MANDATORY)
- Do not describe your process. Do not say you will write code, correct code, or produce a final answer.
- Your reply MUST contain the COMPLETE source code of every file the app needs.
- One file per fenced code block. The block must start with the file path —
  either a filename="src/App.tsx" attribute on the opening tag, or a
  // src/App.tsx (or /* src/App.tsx */) comment as the first code line.
- The first character of the reply must be the scope tag; the next content must be a code fence.
- NEVER reply with only a plan, outline, file list, or verification steps
  without the actual code — that will be rejected.
- Start with the scope tag on the very first line:
  <!-- scope:frontend --> / <!-- scope:backend --> / <!-- scope:fullstack --> / <!-- scope:text -->`;

/**
 * Used instead of OUTPUT_CONTRACT when the conversation already contains a
 * full project and the user is asking to MODIFY it. Tells the model to output
 * ONLY the changed files so edits don't re-generate the whole project (which
 * wastes a lot of tokens).
 */
const EDIT_CONTRACT = `## OUTPUT CONTRACT (EDIT MODE — MANDATORY)
The conversation already contains a complete working project (previous replies have all the source files). The user is asking you to MODIFY that existing project.
- Output ONLY the files that CHANGED. Each changed file goes in its own fenced block, with its FULL content.
- Do NOT re-output files you did not change — repeating the whole project wastes tokens.
- If you only changed a few lines, still output the ENTIRE file content of each changed file (models cannot reliably emit partial-line patches).
- Do not remove, rewrite, or re-emit any file that stayed the same.
- NEVER reply with only a plan, outline, or a diff — output the complete file content of the changed files.
- Start with the scope tag on the very first line:
  <!-- scope:frontend --> / <!-- scope:backend --> / <!-- scope:fullstack --> / <!-- scope:text -->`;

/**
 * Builds the full system prompt for a chat request:
 * base prompt (DB-editable) + enabled skill catalog + full SKILL.md of the
 * skills that match the user's message + a mandatory output contract
 * (full-project contract for new builds, edit contract when the conversation
 * already contains a project so the model only outputs changed files).
 */
export async function buildChatSystemPrompt(
  userMessage: string,
  options: { hasExistingProject?: boolean } = {},
): Promise<string> {
  const base = await getSystemPrompt();
  const starter = options.hasExistingProject
    ? ""
    : `## STARTER BLUEPRINT (${detectStarterKind(userMessage).toUpperCase()})\n${getStarterGuidance(detectStarterKind(userMessage))}`;
  return [
    base,
    starter,
    options.hasExistingProject ? EDIT_CONTRACT : OUTPUT_CONTRACT,
  ].filter(Boolean).join("\n\n");
}
