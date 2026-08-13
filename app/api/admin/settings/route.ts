import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import {
  DEFAULT_SYSTEM_PROMPT,
  getSystemPrompt,
  isSystemPromptDefault,
  MAX_PROMPT_LENGTH,
  resetSystemPrompt,
  saveSystemPrompt,
} from "@/lib/system-prompt";

/**
 * GET  /api/admin/settings → current system prompt (+ default + whether it's custom).
 * POST /api/admin/settings { value } → save custom prompt; { reset: true } → restore default.
 *
 * All operations require an admin session.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [prompt, isDefault] = await Promise.all([
    getSystemPrompt(),
    isSystemPromptDefault(),
  ]);

  return NextResponse.json({ prompt, isDefault, defaultPrompt: DEFAULT_SYSTEM_PROMPT });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { value?: string; reset?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body.reset) {
      await resetSystemPrompt();
      return NextResponse.json({ ok: true, reset: true });
    }

    const value = (body.value ?? "").trim();
    if (value.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json(
        { error: `Prompt is too long (max ${MAX_PROMPT_LENGTH} characters).` },
        { status: 400 },
      );
    }
    if (!value) {
      await resetSystemPrompt();
      return NextResponse.json({ ok: true, reset: true });
    }

    await saveSystemPrompt(value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to save system prompt:", error);
    return NextResponse.json(
      { error: "Failed to save prompt to the database." },
      { status: 500 },
    );
  }
}
