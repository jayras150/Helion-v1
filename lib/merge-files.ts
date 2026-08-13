import { extractProjectFiles } from "@/lib/extract-files";

function langForPath(path: string): string {
  const clean = path.replace(/^\//, "");
  const ext = clean.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts":
      return "ts";
    case "tsx":
      return "tsx";
    case "js":
      return "js";
    case "jsx":
      return "jsx";
    case "css":
      return "css";
    case "json":
      return "json";
    case "html":
      return "html";
    case "md":
      return "md";
    default:
      return "tsx";
  }
}

/** Rebuilds a markdown project payload (scope tag + one fenced block per file). */
function rebuildProjectContent(
  files: Record<string, string>,
  current: string,
): string {
  const scopeMatch = current.match(/<!--\s*scope:([a-z]+)\s*-->/i);
  const scopeTag = scopeMatch
    ? `<!-- scope:${scopeMatch[1].toLowerCase()} -->`
    : "";
  const parts: string[] = [];
  if (scopeTag) {
    parts.push(scopeTag);
  }
  for (const [path, code] of Object.entries(files)) {
    const clean = path.replace(/^\//, "");
    const lang = langForPath(clean);
    parts.push(`\`\`\`${lang} filename="${clean}"\n${code}\n\`\`\``);
  }
  return parts.join("\n\n");
}

/**
 * Merges a new assistant reply into the previous project content.
 *
 * In edit mode the model outputs ONLY the files it changed. This reconstructs
 * the full project by overlaying the changed files on top of the previous
 * project files, so the live preview / Files panel stays complete.
 *
 * Returns `current` unchanged when there is nothing to merge (no previous
 * project, or the new reply carries no files).
 */
export function mergeProjectContent(
  previous: string | null | undefined,
  current: string,
): string {
  if (!previous || !current) {
    return current;
  }
  const prevFiles = extractProjectFiles(previous);
  const newFiles = extractProjectFiles(current);
  if (!prevFiles || !newFiles || Object.keys(newFiles).length === 0) {
    return current;
  }
  const merged: Record<string, string> = { ...prevFiles, ...newFiles };
  return rebuildProjectContent(merged, current);
}

/**
 * Merges the extracted files across a list of assistant messages (oldest →
 * newest, so newer replies override older ones). Used by the standalone
 * preview data route so an edit-only message still yields the full project.
 */
export function mergeFilesFromMessages(
  messages: { role: string; content: string }[],
): Record<string, string> | null {
  let files: Record<string, string> = {};
  let found = false;
  for (const msg of messages) {
    if (msg.role !== "assistant" || !msg.content) {
      continue;
    }
    const extracted = extractProjectFiles(msg.content);
    if (extracted) {
      files = { ...files, ...extracted };
      found = true;
    }
  }
  return found ? files : null;
}
