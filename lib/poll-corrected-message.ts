import { extractProjectFiles } from "@/lib/extract-files";

/**
 * When the chat route auto-corrects a plan-only response (`ensureCodeOutput`
 * in app/api/chat/route.ts), the corrected code is only persisted to the DB
 * after the corrective model call finishes — which happens AFTER the client
 * already streamed the original (plan-only) reply.
 *
 * This polls the chat endpoint until a NEW assistant message carrying actual
 * code shows up, so the Files tab / preview can use the corrected output.
 *
 * `knownContents` = every message content already in the client's history
 * (including the just-streamed `finalContent`). The corrected message is a
 * brand-new content that is NOT in that set, so older replies with code are
 * never mistaken for the correction.
 *
 * Resolves with the corrected content, or `null` when nothing appears within
 * the timeout (e.g. the correction also failed).
 */
export async function pollForCorrectedMessage(
  chatId: string,
  knownContents: string[],
  timeoutMs = 60_000,
  intervalMs = 1500,
): Promise<string | null> {
  return pollForNewMessage(chatId, knownContents, {
    timeoutMs,
    intervalMs,
    requireFiles: true,
  });
}

/**
 * Polls for ANY new assistant message (regardless of whether it carries code).
 * Used by the Upstash QStash background flow: the client sends a message, the
 * server enqueues a background job, and this polls until the assistant reply
 * is persisted.
 */
export async function pollForNewAssistantMessage(
  chatId: string,
  knownContents: string[],
  timeoutMs = 11 * 60_000,
  intervalMs = 3000,
): Promise<string | null> {
  return pollForNewMessage(chatId, knownContents, {
    timeoutMs,
    intervalMs,
    requireFiles: false,
  });
}

async function pollForNewMessage(
  chatId: string,
  knownContents: string[],
  {
    timeoutMs,
    intervalMs,
    requireFiles,
  }: { timeoutMs: number; intervalMs: number; requireFiles: boolean },
): Promise<string | null> {
  const known = new Set(knownContents);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`/api/chats/${chatId}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = (await res.json()) as {
          messages?: Array<{ role: string; content: string }>;
        };
        const messages = data.messages ?? [];

        // Scan from the newest message; accept the latest assistant reply that
        // isn't one we already have (and, when required, actually has code).
        for (let i = messages.length - 1; i >= 0; i -= 1) {
          const m = messages[i];
          if (m.role !== "assistant" || !m.content) {
            continue;
          }
          if (!known.has(m.content)) {
            if (!requireFiles || extractProjectFiles(m.content)) {
              return m.content;
            }
          }
          break; // newest assistant message found but not useful → keep polling
        }
      }
    } catch {
      // transient network error — keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return null;
}
