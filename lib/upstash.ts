import "server-only";
import { Redis } from "@upstash/redis";
import { Client as QStashClient } from "@upstash/qstash";

/**
 * Upstash Redis job tracking for background chat generation.
 *
 * Flow:
 *  1. POST /api/chat (background) → `createJob(chatId)` (status "pending").
 *  2. Client fires POST /api/chat/run → `claimJob(chatId)` (pending → "processing")
 *     runs the generation server-side (continues even if the browser closes)
 *     → `finishJob(chatId, "done"|"failed")`.
 *
 * The Redis status prevents the same job from being run twice (dedupe) and
 * survives browser disconnects, so the result lands in the DB regardless of
 * whether the tab stays open.
 */

/** True when Upstash Redis is configured (URL + token present). */
export function isUpstashConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL &&
      process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

export function isQStashConfigured(): boolean {
  return Boolean(process.env.QSTASH_TOKEN && process.env.QSTASH_URL);
}

function qstash(): QStashClient {
  return new QStashClient({
    token: process.env.QSTASH_TOKEN!,
    baseUrl: process.env.QSTASH_URL!,
  });
}

export async function publishGenerationJob(chatId: string): Promise<void> {
  const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || process.env.VERCEL_URL;
  if (!baseUrl) throw new Error("APP_URL or NEXTAUTH_URL is required for QStash");
  const url = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
  await qstash().publishJSON({
    url: `${url.replace(/\/$/, "")}/api/chat/qstash`,
    body: { chatId },
    headers: { "Content-Type": "application/json" },
    deduplicationId: `helion-chat-${chatId}`,
    retries: 3,
    timeout: "10m",
  });
}

function redis(): Redis {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

export type JobStatus = "pending" | "processing" | "done" | "failed";
type StoredJob = { status?: JobStatus; createdAt?: number; startedAt?: number; finishedAt?: number };

const JOB_PREFIX = "helion:chat:job:";
const JOB_TTL_SECONDS = 20 * 60; // 20 minutes

function jobKey(chatId: string): string {
  return JOB_PREFIX + chatId;
}

function parseJob(raw: unknown): StoredJob {
  if (!raw) return {};
  if (typeof raw === "object") return (raw as StoredJob) ?? {};
  try {
    return JSON.parse(String(raw)) as StoredJob;
  } catch {
    return {};
  }
}

/** Creates a pending job for a chat (no-op if one already exists). */
export async function createJob(chatId: string): Promise<void> {
  await redis().set(
    jobKey(chatId),
    JSON.stringify({ status: "pending", createdAt: Date.now() }),
    { nx: true, ex: JOB_TTL_SECONDS },
  );
}

/**
 * Atomically claims a pending job (returns true when this caller may run the
 * generation). Returns false when the job is already processing/done so the
 * generation never runs twice.
 */
export async function claimJob(chatId: string): Promise<boolean> {
  const key = jobKey(chatId);
  const raw = await redis().get<string>(key);
  const job = parseJob(raw);
  if (job.status === "processing" || job.status === "done") {
    return false;
  }
  await redis().set(
    key,
    JSON.stringify({ status: "processing", startedAt: Date.now() }),
    { ex: JOB_TTL_SECONDS },
  );
  return true;
}

/** Marks a job done or failed. */
export async function finishJob(
  chatId: string,
  status: "done" | "failed",
): Promise<void> {
  await redis().set(
    jobKey(chatId),
    JSON.stringify({ status, finishedAt: Date.now() }),
    { ex: JOB_TTL_SECONDS },
  );
}

/** Reads the current job status (null when no job exists). */
export async function getJobStatus(chatId: string): Promise<JobStatus | null> {
  const raw = await redis().get<string>(jobKey(chatId));
  if (!raw) {
    return null;
  }
  try {
    return parseJob(raw).status ?? null;
  } catch {
    return null;
  }
}

