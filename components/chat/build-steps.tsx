"use client";

import { Check, Loader2 } from "lucide-react";
import { useMemo } from "react";

interface BuildStepsProps {
  /** Accumulated streamed text, used to detect generated files. */
  text: string;
}

/**
 * Detects generated file paths from the streamed markdown. Models emit them
 * either as a `filename="..."` attribute on the fenced block, OR as a comment
 * on the first code line (`// src/App.tsx`, `/* src/App.tsx *​/`, `# server.ts`).
 * Supporting both keeps the "Creating <file>" steps accurate regardless of the
 * model's output style — otherwise a long generation looks frozen.
 */
const FILE_LABEL_RE = /^(?:\/\/|#|<!--?|\/\*)\s*([^\s`*]+\.(?:tsx|ts|jsx|js|css|json|mjs|cjs|html|md|env(?:\.\w+)?))\b/;

function extractFileNames(text: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  // 1) filename="..." attributes on fence openers.
  const attrRe = /filename="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(text ?? "")) !== null) {
    if (m[1] && !seen.has(m[1])) {
      seen.add(m[1]);
      names.push(m[1]);
    }
  }
  // 2) Comment-style labels on the first line of each fenced block.
  const fenceRe = /```[^\n]*\n([^\n]+)\n/g;
  while ((m = fenceRe.exec(text ?? "")) !== null) {
    const label = m[1].trim();
    const lm = label.match(FILE_LABEL_RE);
    if (lm && !seen.has(lm[1])) {
      seen.add(lm[1]);
      names.push(lm[1]);
    }
  }
  return names;
}

type StepState = "done" | "active";

interface Step {
  key: string;
  label: string;
  state: StepState;
}

/**
 * Animated build steps shown while the AI is generating the project.
 * File names are detected from the streamed output so the steps reflect
 * the actual files being created. Code itself is never rendered here.
 */
export function BuildSteps({ text }: BuildStepsProps) {
  const files = useMemo(() => extractFileNames(text), [text]);
  const hasContent = (text ?? "").trim().length > 0;

  const steps = useMemo<Step[]>(() => {
    const list: Step[] = [
      {
        key: "analyze",
        label: "Analyzing your request",
        state: hasContent ? "done" : "active",
      },
    ];

    for (const file of files) {
      list.push({ key: `file:${file}`, label: `Creating ${file}`, state: "done" });
    }

    list.push({ key: "preview", label: "Preparing preview", state: "active" });

    return list;
  }, [files, hasContent]);

  return (
    <div className="flex flex-col gap-2.5 py-2">
      {steps.map((step) => (
        <div
          key={step.key}
          className="flex items-center gap-2.5 text-sm"
        >
          {step.state === "done" ? (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" />
            </span>
          ) : (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-500 dark:text-cyan-400" />
          )}
          <span
            className={
              step.state === "active"
                ? "font-medium text-foreground"
                : "text-muted-foreground"
            }
          >
            {step.label}
          </span>
        </div>
      ))}
      {/* Live progress so a long generation never looks frozen, even before
          file names have streamed in yet. */}
      {hasContent && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-cyan-500 dark:text-cyan-400" />
          <span>Generating… ({text.length.toLocaleString()} chars)</span>
        </div>
      )}
    </div>
  );
}
