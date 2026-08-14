import { performance } from "perf_hooks";
import fs from "fs";
import path from "path";

function readDefaultSystemPrompt(): string {
  const p = path.resolve(__dirname, "..", "lib", "system-prompt.ts");
  const src = fs.readFileSync(p, "utf8");
  const m = src.match(/export const DEFAULT_SYSTEM_PROMPT\s*=\s*`([\s\S]*?)`;/);
  return (m && m[1]) || "You are HELION, an expert full-stack engineer.";
}

function readDefaultEnabledSkills(): string[] {
  const p = path.resolve(__dirname, "..", "lib", "skills.ts");
  const src = fs.readFileSync(p, "utf8");
  const m = src.match(/export const DEFAULT_ENABLED_SKILLS\s*=\s*\[([^\]]*)\]/);
  if (!m) return ["react-expert"];
  return m[1]
    .split(/,/) 
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function listSkillsSync(): Array<{ name: string; description: string; domain: string; triggers: string[]; body: string }> {
  const skillsDir = path.resolve(__dirname, "..", "content", "skills");
  if (!fs.existsSync(skillsDir)) return [];
  const out: any[] = [];
  for (const n of fs.readdirSync(skillsDir)) {
    const md = path.join(skillsDir, n, "SKILL.md");
    if (!fs.existsSync(md)) continue;
    const content = fs.readFileSync(md, "utf8");
    const metaMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    const body = metaMatch ? content.slice(metaMatch[0].length) : content;
    const fm = (metaMatch && metaMatch[1]) || "";
    const nameMatch = fm.match(/name:\s*(.+)/);
    const descMatch = fm.match(/description:\s*(.+)/);
    const domainMatch = fm.match(/domain:\s*(.+)/);
    const triggersMatch = fm.match(/triggers:\s*\n?\s*-?\s*(.+)/);
    const metaName = nameMatch ? nameMatch[1].trim() : n;
    const description = descMatch ? descMatch[1].trim() : "";
    const domain = domainMatch ? domainMatch[1].trim() : "";
    const triggers = triggersMatch ? triggersMatch[1].split(/[,\n]/).map(s=>s.trim()).filter(Boolean) : [];
    out.push({ name: metaName, description, domain, triggers, body });
  }
  return out;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9+#.\-]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

function matchSkillsLocal(userMessage: string, enabled: Set<string>, all: any[]): any[] {
  const words = tokenize(userMessage);
  const scored: Array<{ skill: any; score: number }> = [];
  for (const meta of all) {
    if (!enabled.has(meta.name)) continue;
    const haystack = `${meta.name} ${meta.description} ${(meta.triggers||[]).join(" ")}`.toLowerCase();
    let score = 0;
    for (const word of words) {
      if (word.length < 3) continue;
      if (haystack.includes(word)) score += 1;
      if (meta.name.includes(word)) score += 2;
    }
    if (score > 0) scored.push({ skill: meta, score });
  }
  scored.sort((a,b)=>b.score-a.score);
  return scored.slice(0, 3).map(s=>s.skill);
}

async function buildPromptLocal(userMessage: string, skillBudget: number) {
  const base = readDefaultSystemPrompt();
  const enabledList = readDefaultEnabledSkills();
  const all = listSkillsSync();
  const enabled = new Set(enabledList);
  const matched = matchSkillsLocal(userMessage, enabled, all);

  const parts: string[] = [base];
  const rows = all.filter((s)=>enabled.has(s.name)).map((s)=>`- **${s.name}**${s.domain?` [${s.domain}]`:''}: ${s.description}`).join("\n");
  parts.push(["## AVAILABLE SKILLS","You may use the skills below.", rows].join("\n"));

  let budget = skillBudget;
  for (const skill of matched) {
    if (budget <= 0) break;
    const content = skill.body || '';
    const body = content.slice(0, Math.min(content.length, budget));
    budget -= body.length;
    parts.push(`## SKILL: ${skill.name}\nFollow this skill's instructions when they apply to the user's request.\n${body}`);
  }
  parts.push("## OUTPUT CONTRACT (MANDATORY)\n- Your reply MUST contain the COMPLETE source code of every file the app needs.");
  return parts.join("\n\n");
}

async function run() {
  const userPrompt = process.argv.slice(2).join(" ") ||
    "Build a fullstack React + Node app with authentication, file uploads, and SQLite persistence. Include an API endpoint for uploading files, and a React UI with a form to upload and list files. Use Tailwind and TypeScript.";

  console.log("User prompt:\n", userPrompt, "\n---\n");
  const budgets = [6000, 3000];
  for (const b of budgets) {
    const t0 = performance.now();
    const system = await buildPromptLocal(userPrompt, b);
    const t1 = performance.now();
    console.log(`Budget ${b}: build time ${(t1 - t0).toFixed(2)} ms, chars=${system.length}`);
    console.log(system.slice(0, 800).replace(/\n/g, "\\n"));
    console.log("---\n");
  }
}

run().catch((e)=>{ console.error(e); process.exit(1); });
