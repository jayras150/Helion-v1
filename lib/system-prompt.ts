import "server-only";

import { getSetting, upsertSetting } from "@/lib/db/queries";

/**
 * Built-in fallback prompt, used until an admin saves a custom one to the DB
 * (`app_settings.system_prompt`). The override is editable from `/admin/settings`
 * and takes effect immediately (read fresh on every chat request).
 */
export const DEFAULT_SYSTEM_PROMPT = `You are HELION, an expert full-stack engineer. Build what the user requests.

Use React + TypeScript + Tailwind for frontend apps. For backends, include a start script and listen on process.env.PORT || 3000 at 0.0.0.0. Keep the implementation focused and explanations brief. Output complete files only; never output a plan without code.`;

export const SYSTEM_PROMPT_KEY = "system_prompt";

const MAX_PROMPT_LENGTH = 8_000;

/** Oversized legacy custom prompts are ignored to protect generation speed. */
const MAX_ACTIVE_CUSTOM_PROMPT_LENGTH = 4_000;

/** Returns the active system prompt (DB override, else the built-in default). */
export async function getSystemPrompt(): Promise<string> {
  try {
    const saved = await getSetting(SYSTEM_PROMPT_KEY);
    const trimmed = saved?.trim();
    return trimmed && trimmed.length <= MAX_ACTIVE_CUSTOM_PROMPT_LENGTH
      ? trimmed
      : DEFAULT_SYSTEM_PROMPT;
  } catch (error) {
    // DB unavailable → fall back to the default so chats keep working.
    console.error("Failed to read system prompt, using default:", error);
    return DEFAULT_SYSTEM_PROMPT;
  }
}

/** True when no custom prompt has been saved yet. */
export async function isSystemPromptDefault(): Promise<boolean> {
  const saved = await getSetting(SYSTEM_PROMPT_KEY);
  return !saved || !saved.trim();
}

/** Persists a custom system prompt to the DB. */
export async function saveSystemPrompt(value: string): Promise<void> {
  await upsertSetting(SYSTEM_PROMPT_KEY, value);
}

/** Clears the custom prompt so the built-in default is used again. */
export async function resetSystemPrompt(): Promise<void> {
  await upsertSetting(SYSTEM_PROMPT_KEY, "");
}

export { MAX_PROMPT_LENGTH };
