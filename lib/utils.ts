import { type ClassValue, clsx } from "clsx";
import { nanoid } from "nanoid";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateUUID(): string {
  return nanoid();
}

/**
 * Removes fenced code blocks (``` ... ```) from markdown so the chat shows
 * only the explanation text. The code itself is still stored and used by
 * the preview / file explorer / export, so nothing is lost.
 */
export function stripCodeBlocks(markdown: string): string {
  const withoutFences = markdown
    .replace(/```[^\n]*\n[\s\S]*?```/g, "")
    .replace(/```[^\n]*\n[\s\S]*$/g, "");
  return withoutFences.replace(/\n{3,}/g, "\n\n").trim();
}
