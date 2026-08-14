import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { normalizeEnvFile } from "@/lib/env-writer";

export async function POST(_request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    normalizeEnvFile();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to normalize env file:", error);
    return NextResponse.json({ error: "Failed to normalize env file" }, { status: 500 });
  }
}
