import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import {
  DEFAULT_ENABLED_SKILLS,
  getEnabledSkills,
  listSkills,
  setSkillEnabled,
} from "@/lib/skills";

/**
 * GET  /api/admin/skills → all vendored skills (+ which are enabled).
 * POST /api/admin/skills { name, enabled } → toggle a skill's active state.
 *
 * All operations require an admin session.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [skills, enabled] = await Promise.all([listSkills(), getEnabledSkills()]);
  const enabledSet = new Set(enabled);

  return NextResponse.json({
    skills: skills.map((s) => ({
      name: s.name,
      description: s.description,
      domain: s.domain,
      enabled: enabledSet.has(s.name),
      isDefault: DEFAULT_ENABLED_SKILLS.includes(s.name),
    })),
    enabled: [...enabledSet],
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { name?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = body.name;
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "`name` is required" }, { status: 400 });
  }

  const known = listSkills().some((s) => s.name === name);
  if (!known) {
    return NextResponse.json({ error: "Skill not found." }, { status: 404 });
  }

  try {
    const enabled = await setSkillEnabled(name, Boolean(body.enabled));
    return NextResponse.json({ ok: true, enabled });
  } catch (error) {
    console.error("Failed to update skill:", error);
    return NextResponse.json(
      { error: "Failed to save skill settings." },
      { status: 500 },
    );
  }
}
