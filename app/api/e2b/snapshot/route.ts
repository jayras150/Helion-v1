import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SandboxNotFoundError } from "e2b";
import { getServerUser } from "@/lib/auth";
import { snapshotSandbox } from "@/lib/e2b";
import {
  getLatestAssistantMessage,
  updateChatMessageDeployment,
} from "@/lib/db/queries";
import { getSnapshotInfo, saveSnapshot } from "@/lib/snapshots";

/**
 * E2B snapshot management.
 *
 * GET  /api/e2b/snapshot?projectId=<id>  → { exists, size, updatedAt }
 * POST /api/e2b/snapshot { sandboxId, projectId } → snapshot now
 *
 * Snapshots persist each project's backend state on the HELION server so it
 * can be restored later (even months later, after the sandbox is long gone).
 */
export async function GET(request: NextRequest) {
  const user = await getServerUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "`projectId` is required" }, { status: 400 });
  }

  const info = await getSnapshotInfo(projectId);
  return NextResponse.json(info);
}

export async function POST(request: NextRequest) {
  const user = await getServerUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: { sandboxId?: string; projectId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sandboxId, projectId } = body;
  if (!sandboxId || !projectId) {
    return NextResponse.json(
      { error: "`sandboxId` and `projectId` are required" },
      { status: 400 },
    );
  }

  try {
    const data = await snapshotSandbox(sandboxId);
    await saveSnapshot(projectId, data);
    const info = await getSnapshotInfo(projectId);
    // Mark the message as having a saved snapshot (informational only).
    try {
      const msg = await getLatestAssistantMessage(projectId);
      if (msg) {
        await updateChatMessageDeployment({
          messageId: msg.id,
          snapshotId: new Date().toISOString(),
        });
      }
    } catch {
      /* best-effort */
    }
    return NextResponse.json({ ok: true, ...info });
  } catch (error) {
    // A paused/stopped sandbox is expected (E2B pauses idle sandboxes) —
    // return a graceful response so the client can stop autosaving instead
    // of spamming 500s.
    if (error instanceof SandboxNotFoundError) {
      return NextResponse.json({ ok: false, paused: true });
    }
    console.error("E2B snapshot failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Snapshot failed" },
      { status: 500 },
    );
  }
}
