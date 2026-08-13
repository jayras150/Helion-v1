import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import {
  CREDENTIAL_DEFS,
  readCredentialStatus,
  readCredentialValues,
  setCredentialValue,
} from "@/lib/env-writer";

/**
 * GET  /api/admin/credentials → masked status of configurable keys.
 * POST /api/admin/credentials { key, value } → set (value) or clear ("").
 *
 * Plain-text credential values are NEVER returned or displayed.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = new Map(readCredentialStatus().map((s) => [s.key, s.set]));
  const values = new Map(readCredentialValues().map((v) => [v.key, v.value]));
  const credentials = CREDENTIAL_DEFS.map((d) => ({
    key: d.key,
    label: d.label,
    description: d.description,
    secret: d.secret,
    requiresRestart: d.requiresRestart,
    group: d.group,
    set: status.get(d.key) ?? false,
    // Only non-secret config (endpoint, model, etc.) is exposed; secrets stay masked.
    value: d.secret ? "" : (values.get(d.key) ?? ""),
  }));

  return NextResponse.json({ credentials });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { key?: string; value?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const key = body.key;
  if (!key) {
    return NextResponse.json({ error: "`key` is required" }, { status: 400 });
  }
  const def = CREDENTIAL_DEFS.find((d) => d.key === key);
  if (!def) {
    return NextResponse.json(
      { error: "Key is not allowed to be changed." },
      { status: 400 },
    );
  }

  const value = body.value ?? "";
  try {
    setCredentialValue(key, value);
  } catch (error) {
    console.error("Failed to update credential:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    set: Boolean(value),
    requiresRestart: def.requiresRestart,
  });
}
