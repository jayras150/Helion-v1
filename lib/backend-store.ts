"use client";

/**
 * Tiny client-side store for the currently-running E2B backend URL.
 *
 * The backend panel publishes the sandbox URL here after a successful deploy;
 * the preview panel reads/subscribes to it so a fullstack frontend can point
 * its `/api/*` calls at the E2B sandbox instead of the HELION origin.
 */

let backendUrl: string | null = null;
const listeners = new Set<(url: string | null) => void>();

export function setBackendUrl(url: string | null): void {
  if (backendUrl === url) {
    return;
  }
  backendUrl = url;
  for (const listener of listeners) {
    listener(url);
  }
}

export function getBackendUrl(): string | null {
  return backendUrl;
}

export function subscribeBackendUrl(
  listener: (url: string | null) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
