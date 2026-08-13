import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getChatById } from "@/lib/db/queries";
import { loadScreenshot, saveScreenshot } from "@/lib/screenshot-storage";

/**
 * Project screenshots.
 *
 * GET  /api/screenshots/[chatId] → PNG thumbnail
 * POST /api/screenshots/[chatId] → store a PNG captured client-side when the
 *                                  preview first appears ({ dataUrl } body)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { chatId } = await params;
  const chat = await getChatById(chatId);
  if (!chat || chat.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const png = await loadScreenshot(chatId);
  if (!png) {
    return NextResponse.json({ error: "No screenshot" }, { status: 404 });
  }

  const body = new Uint8Array(png);
  return new Response(body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { chatId } = await params;
  const chat = await getChatById(chatId);
  if (!chat || chat.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { dataUrl } = await request.json();
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "Invalid dataUrl" }, { status: 400 });
    }

    const base64 = dataUrl.split(",")[1] ?? "";
    const png = Buffer.from(base64, "base64");
    if (png.byteLength === 0) {
      return NextResponse.json({ error: "Empty image" }, { status: 400 });
    }

    await saveScreenshot(chatId, png);
    return NextResponse.json({ ok: true, bytes: png.byteLength });
  } catch (error) {
    console.error("Screenshot store failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to store screenshot" },
      { status: 500 },
    );
  }
}
