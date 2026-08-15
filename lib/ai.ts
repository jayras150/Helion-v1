import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import { getRuntimeCredential } from "@/lib/env-writer";

const DEFAULT_MODEL = "gpt-4o-mini";

let cachedProvider: ReturnType<typeof createOpenAI> | null = null;
let cachedKey: string | undefined = undefined;
let cachedBase: string | undefined = undefined;

async function getProvider() {
  const key = (await getRuntimeCredential("AI_API_KEY")) ?? process.env.AI_API_KEY;
  const base = (await getRuntimeCredential("AI_BASE_URL")) ?? process.env.AI_BASE_URL;
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

export async function getModel() {
  const prov = await getProvider();
  if (!prov) {
    throw new Error("AI provider is not configured (AI_API_KEY missing)");
  }
  const model = (await getRuntimeCredential("AI_MODEL")) ?? process.env.AI_MODEL ?? DEFAULT_MODEL;
  return prov.chat(model);
}

/** Returns true when an AI provider key is configured. */
export async function hasAiKey(): Promise<boolean> {
  return Boolean((await getRuntimeCredential("AI_API_KEY")) ?? process.env.AI_API_KEY);
}
