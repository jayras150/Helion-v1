import "server-only";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Filesystem-backed screenshot storage. Each project's thumbnail PNG lives at
 * `data/screenshots/<chatId>.png` — durable on the HELION server disk and
 * gitignored. Kept outside the DB so the feature needs no migration.
 */

const SHOT_DIR = path.join(process.cwd(), "data", "screenshots");

function shotPath(chatId: string): string {
  const safe = chatId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60) || "chat";
  return path.join(SHOT_DIR, `${safe}.png`);
}

export async function saveScreenshot(
  chatId: string,
  data: Uint8Array,
): Promise<void> {
  await mkdir(SHOT_DIR, { recursive: true });
  await writeFile(shotPath(chatId), data);
}

export async function loadScreenshot(
  chatId: string,
): Promise<Buffer | null> {
  try {
    return await readFile(shotPath(chatId));
  } catch {
    return null;
  }
}

export async function screenshotExists(chatId: string): Promise<boolean> {
  try {
    await stat(shotPath(chatId));
    return true;
  } catch {
    return false;
  }
}
