import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth";
import { snapshotSandbox, stopSandbox } from "@/lib/e2b";
import {
  getLatestAssistantMessage,
  updateChatMessageDeployment,
} from "@/lib/db/queries";
import { saveSnapshot } from "@/lib/snapshots";

/**
 * POST /api/e2b/stop
 * Body: { sandboxId: string, projectId?: string }
 * Captures a final snapshot of the project state (if projectId given), then
 * kills the sandbox so nothing keeps running (and no E2B cost while idle).
 */
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
  if (!sandboxId) {
    return NextResponse.json({ error: "`sandboxId` is required" }, { status: 400 });
  }

  try {
    // Save a final snapshot before stopping so the project can be resumed.
    if (projectId) {
      try {
        const data = await snapshotSandbox(sandboxId);
        await saveSnapshot(projectId, data);
      } catch (snapErr) {
        console.error("Final snapshot failed:", snapErr);
        // Continue with stop even if snapshot fails.
      }
    }
    await stopSandbox(sandboxId);

    // Clear the deployment marker so the dashboard reflects only ACTIVE
    // sandboxes (deploy writes it; stop removes it).
    if (projectId) {
      try {
        const msg = await getLatestAssistantMessage(projectId);
        if (msg) {
          await updateChatMessageDeployment({
            messageId: msg.id,
            sandboxId: null,
            url: null,
          });
        }
      } catch (dbErr) {
        console.error("Failed to clear deployment info:", dbErr);
      }
    }

    return NextResponse.json({ ok: true, sandboxId });
  } catch (error) {
    console.error("E2B stop failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Stop failed" },
      { status: 500 },
    );
  }
}
