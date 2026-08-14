import "server-only";

import { createOpenAI } from "@ai-sdk/openai";

const DEFAULT_MODEL = "gpt-4o-mini";

let cachedProvider: ReturnType<typeof createOpenAI> | null = null;
let cachedKey: string | undefined = undefined;
let cachedBase: string | undefined = undefined;

function getProvider() {
  const key = process.env.AI_API_KEY;
  const base = process.env.AI_BASE_URL;
  // If nothing changed, reuse cached provider
  if (cachedProvider && key === cachedKey && base === cachedBase) {
    return cachedProvider;
  }
  if (!key) {
    cachedProvider = null;
    cachedKey = key;
    cachedBase = base;
    return null;
  }
  // Recreate provider with latest env values
  cachedProvider = createOpenAI({
    apiKey: key,
    ...(base ? { baseURL: base } : {}),
  });
  cachedKey = key;
  cachedBase = base;
  return cachedProvider;
}

export function getModel() {
  const prov = getProvider();
  if (!prov) {
    throw new Error("AI provider is not configured (AI_API_KEY missing)");
  }
  return prov.chat(process.env.AI_MODEL || DEFAULT_MODEL);
}

/** Returns true when an AI provider key is configured. */
export function hasAiKey(): boolean {
  return Boolean(process.env.AI_API_KEY);
}
