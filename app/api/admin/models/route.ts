import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getRuntimeCredential } from "@/lib/env-writer";

/**
 * GET /api/admin/models
 * Returns the list of available models from the configured AI provider.
 */
export async function GET(_req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const key = (await getRuntimeCredential("AI_API_KEY")) ?? process.env.AI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "AI API key is not configured." }, { status: 400 });
  }

  const base = ((await getRuntimeCredential("AI_BASE_URL")) ?? process.env.AI_BASE_URL)?.replace(/\/+$/, "") || "https://api.openai.com/v1";
  try {
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return NextResponse.json({ error: `Provider error: ${res.status} ${txt}` }, { status: 502 });
    }
    const body = await res.json();
    // OpenAI-compatible: { data: [{ id, ... }, ...] }
    const models = Array.isArray(body?.data)
      ? body.data.map((m: any) => ({ id: m.id, description: m.description ?? "" }))
      : [];
    return NextResponse.json({ ok: true, models });
  } catch (error) {
    console.error("Failed to fetch models:", error);
    return NextResponse.json({ error: "Failed to fetch models from provider." }, { status: 500 });
  }
}
