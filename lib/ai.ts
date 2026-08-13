import "server-only";

import { createOpenAI } from "@ai-sdk/openai";

const DEFAULT_MODEL = "gpt-4o-mini";

/**
 * Configurable AI provider (OpenAI-compatible).
 *
 * Uses your own API key, fully independent from Vercel / v0.
 * Works with OpenAI and any OpenAI-compatible endpoint
 * (Groq, Together, OpenRouter, Ollama, local proxies, etc.).
 *
 * We use `provider.chat(model)` which targets the standard
 * `/v1/chat/completions` endpoint (NOT the Responses API `/v1/responses` that
 * `provider(model)` defaults to in @ai-sdk/openai v3). Most OpenAI-compatible
 * providers (incl. nscale, DeepSeek, Groq, Together…) only support chat
 * completions.
 *
 * Env vars:
 *   AI_API_KEY  - your provider API key (required)
 *   AI_BASE_URL - optional, defaults to https://api.openai.com/v1
 *   AI_MODEL    - optional, defaults to gpt-4o-mini
 */
const provider = createOpenAI({
  apiKey: process.env.AI_API_KEY,
  ...(process.env.AI_BASE_URL ? { baseURL: process.env.AI_BASE_URL } : {}),
});

export function getModel() {
  return provider.chat(process.env.AI_MODEL || DEFAULT_MODEL);
}

/** Returns true when an AI provider key is configured. */
export function hasAiKey(): boolean {
  return Boolean(process.env.AI_API_KEY);
}
