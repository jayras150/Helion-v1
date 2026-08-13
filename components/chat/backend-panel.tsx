"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Loader2,
  RefreshCw,
  Server,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { setBackendUrl } from "@/lib/backend-store";
import { buildPreviewHtml } from "@/lib/preview-bundler";
import { cn } from "@/lib/utils";

type Status =
  | "checking"
  | "deploying"
  | "running"
  | "stopped"
  | "error"
  | "disabled";

interface BackendPanelProps {
  files: Record<string, string> | null;
  scope: "backend" | "fullstack";
  chatId: string;
  className?: string;
}

const AUTOSAVE_MS = 30_000;

/**
 * Runs the backend part of a project in an E2B sandbox and keeps it alive.
 *
 * - Auto-deploys on mount; reuses the project snapshot when one exists so the
 *   app comes back in the exact same state as before (data runtime included).
 * - Auto-snapshots every 30s while running; "Stop" takes a final snapshot and
 *   kills the sandbox (no E2B cost while idle).
 * - "Redeploy" restores the saved state into a fresh sandbox.
 */
export function BackendPanel({ files, scope, chatId, className }: BackendPanelProps) {
  const [status, setStatus] = useState<Status>("checking");
  const [url, setUrl] = useState<string | null>(null);
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [message, setMessage] = useState("");
  const autosaveTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopAutosave = useCallback(() => {
    if (autosaveTimer.current) {
      clearInterval(autosaveTimer.current);
      autosaveTimer.current = null;
    }
  }, []);

  const startAutosave = useCallback(
    (id: string) => {
      stopAutosave();
      autosaveTimer.current = setInterval(() => {
        fetch("/api/e2b/snapshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sandboxId: id, projectId: chatId }),
        })
          .then(async (res) => {
            // Sandbox got paused/disappeared (E2B pauses idle sandboxes) — stop
            // autosaving and mark the backend as stopped so we don't spam 500s.
            if (res.ok) {
              const data = (await res.json()) as { paused?: boolean };
              if (data.paused) {
                stopAutosave();
                setStatus("stopped");
                setUrl(null);
                setBackendUrl(null);
                setSandboxId(null);
                setHasSnapshot(true);
                setMessage(
                  "Sandbox paused automatically — state saved. You can redeploy anytime.",
                );
              }
            }
          })
          .catch(() => {
            /* autosave is best-effort */
          });
      }, AUTOSAVE_MS);
    },
    [chatId, stopAutosave],
  );

  const deploy = useCallback(
    async (useSnapshot: boolean) => {
      if (!files) {
        return;
      }
      setStatus("deploying");
      setMessage(
        useSnapshot
          ? "Restoring saved state & deploying to sandbox…"
          : "Deploying app to E2B sandbox…",
      );
      try {
        // For fullstack apps, bundle the frontend (standalone — no backend
        // shim) and serve it from the E2B URL so the WHOLE app runs on its
        // own origin. Its /login, localStorage & cookies then belong to the
        // deployed app, not to HELION.
        let frontendHtml: string | null = null;
        if (scope === "fullstack") {
          try {
            frontendHtml = await buildPreviewHtml(files, null);
          } catch {
            frontendHtml = null; // fall back to backend-only deploy
          }
        }
        const res = await fetch("/api/e2b/deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files,
            projectId: chatId,
            useSnapshot,
            frontendHtml,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Deploy failed");
        }
        setSandboxId(data.sandboxId);
        setUrl(data.url);
        setBackendUrl(data.url);
        setHasSnapshot(useSnapshot || data.sandboxId !== null);
        setStatus("running");
        setMessage("");
        startAutosave(data.sandboxId);
      } catch (error) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Deploy failed");
      }
    },
    [files, scope, chatId, startAutosave],
  );

  const handleStop = useCallback(async () => {
    if (!sandboxId) {
      return;
    }
    setStatus("checking");
    setMessage("Saving state & stopping sandbox…");
    try {
      await fetch("/api/e2b/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sandboxId, projectId: chatId }),
      });
    } catch {
      // proceed to stopped state anyway
    }
    stopAutosave();
    setStatus("stopped");
    setUrl(null);
    setBackendUrl(null);
    setSandboxId(null);
    setHasSnapshot(true);
    setMessage("");
  }, [sandboxId, chatId, stopAutosave]);

  // Auto-deploy on mount — reuse a saved snapshot if it exists.
  const bootRef = useRef(false);
  useEffect(() => {
    if (!files) {
      setStatus("disabled");
      return;
    }
    // Guard against React StrictMode's double effect invocation in dev.
    if (bootRef.current) {
      return;
    }
    bootRef.current = true;
    (async () => {
      let useSnapshot = false;
      try {
        const res = await fetch(`/api/e2b/snapshot?projectId=${chatId}`);
        const info = await res.json();
        useSnapshot = Boolean(info?.exists);
      } catch {
        useSnapshot = false;
      }
      setHasSnapshot(useSnapshot);
      await deploy(useSnapshot);
    })();
    return () => {
      stopAutosave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, chatId]);

  const disabled = status === "deploying" || status === "checking";

  return (
    <div
      className={cn(
        "border-border mx-auto w-full max-w-3xl border-t bg-muted/30 px-4 py-3 backdrop-blur",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground",
            status === "running" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            status === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {status === "deploying" || status === "checking" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Server className="size-4" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="uppercase tracking-wide text-[10px] text-muted-foreground">
              Backend · {scope === "fullstack" ? "Fullstack" : "API"}
            </span>
            {status === "running" && url ? (
              <span className="text-emerald-600 dark:text-emerald-400">● Live</span>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {status === "running" && url
              ? url.replace(/^https:\/\//, "")
              : message ||
                (status === "stopped"
                  ? "Backend stopped — state saved. You can redeploy anytime."
                  : status === "error"
                    ? "Deploy failed"
                    : "Preparing sandbox…")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {status === "running" && url ? (
            <>
              <Button
                asChild
                size="sm"
                variant="default"
                className="gap-1.5"
              >
                {/* Fullstack deploys now serve the frontend from E2B too, so
                    the URL IS the standalone app — no HELION iframe involved. */}
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" />
                  Open
                </a>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-destructive"
                onClick={handleStop}
              >
                <Square className="size-3.5" />
                Stop
              </Button>
            </>
          ) : null}

          {status === "error" || status === "stopped" ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={!files}
              onClick={() => deploy(hasSnapshot)}
            >
              <RefreshCw className="size-3.5" />
              {status === "stopped" ? "Redeploy & Resume" : "Try again"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
