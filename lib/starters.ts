import "server-only";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type StarterKind = "landing" | "dashboard" | "todo" | "fullstack";

function starterRoot(kind: StarterKind): string {
  return join(process.cwd(), "content", "starters", kind, "starter.md");
}

export function detectStarterKind(message: string): StarterKind {
  const text = message.toLowerCase();
  if (/(full.?stack|backend|api|database|express|server)/.test(text)) return "fullstack";
  if (/(dashboard|admin|analytics|metrics|kpi|chart|table)/.test(text)) return "dashboard";
  if (/(todo|task|checklist|productivity|kanban)/.test(text)) return "todo";
  return "landing";
}

export function getStarterGuidance(kind: StarterKind): string {
  const file = starterRoot(kind);
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf8").trim();
}