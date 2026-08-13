/**
 * Parses the assistant's markdown response and extracts project files for
 * the live preview and backend deploy.
 *
 * Filenames are read from (in order):
 *   ```tsx filename="components/Button.tsx"   ← explicit attribute
 *   ```tsx
 *   // components/Button.tsx                   ← comment-style label on line 1
 *   # .env.example
 *   /* src/index.css *\/
 *   ```
 *
 * If no block has a usable filename, the first tsx/ts/jsx/js block is treated
 * as `/App.tsx`.
 */

const FENCE_RE = /```([^\n`]*)\n([\s\S]*?)```/g;

const CODE_LANGS = /^(tsx|ts|jsx|js)$/i;

/** A filename candidate must look like a path (no spaces, allowed chars). */
const FILE_PATH_RE = /^[A-Za-z0-9_./@-]+$/;
/** Must have a real extension, or be a known dot/config file. */
const FILE_EXT_RE =
  /\.(tsx|ts|jsx|js|mjs|cjs|json|jsonc|css|html|md|txt|svg|png|jpe?g|webp|gif)$/i;

function normalizePath(path: string): string {
  const trimmed = path.trim();
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function cleanCode(code: string): string {
  return code.replace(/^\n/, "").replace(/\s+$/, "");
}

/**
 * Detects a comment-style file label on the first line of a code block
 * (`// server.ts`, `# .env.example`, `/* src/index.css *\/`). Returns the
 * filename and the code with that label line removed, or null when the first
 * line is not a path label (e.g. a prose comment).
 */
function labelFromFirstLine(code: string): { filename: string; code: string } | null {
  const lines = code.replace(/^\n/, "").split("\n");
  const first = (lines[0] ?? "").trim();
  const m = first.match(/^(?:\/\/|#|<!--?|\/\*)\s*(.*?)\s*(?:\*\/|-->)?$/);
  if (!m) {
    return null;
  }
  const candidate = m[1].trim();
  if (!candidate || !FILE_PATH_RE.test(candidate)) {
    return null;
  }
  const isFile =
    FILE_EXT_RE.test(candidate) ||
    /^package\.json$/i.test(candidate) ||
    /^\.env(\.[a-z0-9-]+)?$/i.test(candidate);
  if (!isFile) {
    return null;
  }
  return {
    filename: candidate,
    code: cleanCode(lines.slice(1).join("\n")),
  };
}

interface CodeBlock {
  lang: string;
  filename?: string;
  code: string;
}

export function extractProjectFiles(
  markdown: string,
): Record<string, string> | null {
  if (!markdown) {
    return null;
  }

  const blocks: CodeBlock[] = [];
  let match: RegExpExecArray | null;

  FENCE_RE.lastIndex = 0;
  while ((match = FENCE_RE.exec(markdown)) !== null) {
    const info = match[1] ?? "";
    const lang = info.split(/\s+/)[0] ?? "";
    const filenameMatch = info.match(/filename=["']([^"']+)["']/i);
    let filename = filenameMatch?.[1];
    let code = cleanCode(match[2] ?? "");
    if (!filename) {
      const label = labelFromFirstLine(code);
      if (label) {
        filename = label.filename;
        code = label.code;
      }
    }
    blocks.push({ lang, filename, code });
  }

  // Preferred: blocks annotated with `filename="..."`.
  const namedBlocks = blocks.filter((b) => b.filename);
  if (namedBlocks.length > 0) {
    const files: Record<string, string> = {};
    for (const block of namedBlocks) {
      if (block.filename && block.code) {
        files[normalizePath(block.filename)] = block.code;
      }
    }
    return Object.keys(files).length > 0 ? files : null;
  }

  // Fallback: a single code block with no filename → use as the app entry.
  const firstCodeBlock = blocks.find((b) => CODE_LANGS.test(b.lang));
  if (firstCodeBlock && firstCodeBlock.code) {
    return { "/App.tsx": firstCodeBlock.code };
  }

  return null;
}

/** Returns the filename attribute value for a block info string. */
export function getFencedFilename(info: string): string | undefined {
  const match = info.match(/filename=["']([^"']+)["']/i);
  return match?.[1];
}
