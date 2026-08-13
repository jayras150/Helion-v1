import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { deployBackend, hasE2BKey } from "@/lib/e2b";
import {
  getLatestAssistantMessage,
  updateChatMessageDeployment,
} from "@/lib/db/queries";
import { loadSnapshot } from "@/lib/snapshots";

/**
 * POST /api/e2b/deploy
 * Body: { files: Record<path, string>, projectId: string, useSnapshot?: boolean,
 *         frontendHtml?: string }
 * Deploys backend files to a fresh E2B sandbox. When `useSnapshot` is true and
 * a snapshot exists for the project, the previous runtime state is restored.
 * When `frontendHtml` is provided, the app's frontend is served from the E2B
 * URL too (static + SPA fallback) so the generated app runs fully standalone
 * outside the HELION origin.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!hasE2BKey()) {
    return NextResponse.json(
      { error: "E2B_API_KEY is not configured. Add it to .env to run backend projects." },
      { status: 500 },
    );
  }

  let body: {
    files?: Record<string, string>;
    projectId?: string;
    useSnapshot?: boolean;
    frontendHtml?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { files, projectId, useSnapshot, frontendHtml } = body;
  if (!files || typeof files !== "object") {
    return NextResponse.json({ error: "`files` object is required" }, { status: 400 });
  }

  try {
    const entries = Object.entries(files).map(([path, content]) => ({
      path,
      content: String(content),
    }));

    const snapshot =
      useSnapshot && projectId ? await loadSnapshot(projectId) : null;

    const result = await deployBackend(entries, {
      snapshot,
      frontendHtml: typeof frontendHtml === "string" ? frontendHtml : null,
    });

    // Persist the deployment so the admin dashboard can track active sandboxes.
    if (projectId) {
      try {
        const msg = await getLatestAssistantMessage(projectId);
        if (msg) {
          await updateChatMessageDeployment({
            messageId: msg.id,
            sandboxId: result.sandboxId,
            url: result.url,
          });
        }
      } catch (dbErr) {
        console.error("Failed to persist deployment info:", dbErr);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("E2B deploy failed:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Deploy failed",
        logs: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}
