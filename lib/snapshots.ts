import "server-only";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Snapshot storage — persists each project's backend state (kode + data
 * runtime) on the HELION server filesystem, keyed by project (chat) id.
 *
 * This lives outside E2B, so a project can be restored months later even if
 * the original sandbox is long gone.
 */

const SNAP_DIR = path.join(process.cwd(), "data", "snapshots");

function snapPath(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60) || "project";
  return path.join(SNAP_DIR, `${safe}.tgz`);
}

export async function saveSnapshot(projectId: string, data: Uint8Array): Promise<void> {
  await mkdir(SNAP_DIR, { recursive: true });
  await writeFile(snapPath(projectId), data);
}

export async function loadSnapshot(projectId: string): Promise<Uint8Array | null> {
  try {
    return await readFile(snapPath(projectId));
  } catch {
    return null;
  }
}

export type SnapshotInfo = {
  exists: boolean;
  size: number;
  updatedAt: string | null;
};

export async function getSnapshotInfo(projectId: string): Promise<SnapshotInfo> {
  try {
    const st = await stat(snapPath(projectId));
    return { exists: true, size: st.size, updatedAt: st.mtime.toISOString() };
  } catch {
    return { exists: false, size: 0, updatedAt: null };
  }
}
