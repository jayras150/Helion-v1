import "server-only";
import { Client } from "@upstash/qstash";

/** True when Upstash QStash is configured (QSTASH_TOKEN present). */
export function isQStashConfigured(): boolean {
  return Boolean(process.env.QSTASH_TOKEN);
}

function client(): Client {
  return new Client({ token: process.env.QSTASH_TOKEN! });
}

/**
 * Enqueues a background generation job via Upstash QStash.
 *
 * The job calls `<origin>/api/chat/background`, which runs the AI generation
 * in a fresh serverless invocation — so it completes even when the browser
 * disconnects or the user goes idle. `origin` is the deployment origin (e.g.
 * `https://helion-v1.vercel.app`); QStash must be able to reach it publicly.
 */
export async function enqueueGeneration(
  payload: { chatId: string; userMessage: string },
  origin: string,
): Promise<void> {
  await client().publishJSON({
    url: `${origin}/api/chat/background`,
    body: payload,
    retries: 3,
    // The background route checks this header so only jobs we published are
    // accepted (QSTASH_TOKEN is a secret).
    headers: {
      Authorization: `Bearer ${process.env.QSTASH_TOKEN!}`,
    },
  });
}
