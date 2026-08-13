"use client";

import {
  ExternalLink,
  Loader2,
  Minimize,
  Monitor,
  RefreshCw,
  Rocket,
  Square,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getBackendUrl, subscribeBackendUrl } from "@/lib/backend-store";
import { extractProjectFiles } from "@/lib/extract-files";
import { buildPreviewHtml } from "@/lib/preview-bundler";
import { parseScopeTag } from "@/lib/scope";

type DeployState =
  | { status: "idle" }
  | { status: "deploying" }
  | { status: "running"; url: string; sandboxId: string }
  | { status: "error"; message: string };

interface PreviewPanelProps {
  sourceCode: string | null;
  onClose: () => void;
  chatId?: string | null;
}

type PreviewStatus = "idle" | "building" | "ready" | "empty";

const MAX_BUILD_ATTEMPTS = 3;
const BUILD_RETRY_DELAY_MS = 800;
/** Wait for Tailwind Play CDN to compile + React to paint before capturing. */
const CAPTURE_DELAY_MS = 1500;

export function PreviewPanel({
  sourceCode,
  onClose,
  chatId,
}: PreviewPanelProps) {
  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [srcdoc, setSrcdoc] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const attemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // Per-render guard so each freshly built preview is captured once.
  const captureReqRef = useRef(false);

  // Standalone deploy (frontend-only apps) — deploys the built app to an E2B
  // URL so it runs completely outside the HELION origin (its own /login,
  // localStorage & cookies). Fullstack apps are deployed from the backend
  // panel, which also serves the frontend from the same E2B URL.
  const [deploy, setDeploy] = useState<DeployState>({ status: "idle" });

  const canDeployStandalone = useMemo(() => {
    const scope = parseScopeTag(sourceCode ?? "");
    return scope !== "backend" && scope !== "fullstack";
  }, [sourceCode]);

  const projectFiles = useMemo(
    () => extractProjectFiles(sourceCode ?? ""),
    [sourceCode],
  );

  const deployStandalone = useCallback(async () => {
    if (!projectFiles || !srcdoc) {
      return;
    }
    setDeploy({ status: "deploying" });
    try {
      const res = await fetch("/api/e2b/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: projectFiles,
          projectId: chatId ?? undefined,
          frontendHtml: srcdoc,
        }),
      });
      const data = (await res.json()) as {
        url?: string;
        sandboxId?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Deploy failed");
      }
      if (!data.url) {
        throw new Error("Deploy finished but URL not found");
      }
      setDeploy({
        status: "running",
        url: data.url,
        sandboxId: data.sandboxId ?? "",
      });
    } catch (err) {
      setDeploy({
        status: "error",
        message: err instanceof Error ? err.message : "Deploy failed",
      });
    }
  }, [projectFiles, srcdoc, chatId]);

  const stopStandalone = useCallback(async () => {
    if (deploy.status !== "running") {
      return;
    }
    const { sandboxId } = deploy;
    setDeploy({ status: "idle" });
    try {
      await fetch("/api/e2b/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sandboxId }),
      });
    } catch {
      // best-effort stop
    }
  }, [deploy]);

  // When the E2B backend URL becomes available (fullstack projects), rebuild
  // the iframe so the generated frontend can reach the backend sandbox.
  useEffect(() => {
    return subscribeBackendUrl(() => {
      setRefreshKey((prev) => prev + 1);
    });
  }, []);

  useEffect(() => {
    if (!projectFiles) {
      setStatus("idle");
      setSrcdoc(null);
      return;
    }

    let cancelled = false;
    attemptRef.current = 0;

    const tryBuild = async () => {
      if (cancelled) {
        return;
      }
      setStatus("building");
      try {
        const html = await buildPreviewHtml(projectFiles, getBackendUrl());
        if (!cancelled) {
          captureReqRef.current = false;
          setSrcdoc(html);
          setStatus("ready");
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        attemptRef.current += 1;
        if (attemptRef.current < MAX_BUILD_ATTEMPTS) {
          retryTimerRef.current = setTimeout(() => {
            void tryBuild();
          }, BUILD_RETRY_DELAY_MS);
        } else {
          // Build errors are logged to the console only — never shown in the
          // UI (keeps the preview clean for end users).
          console.error(
            "Preview build failed:",
            err instanceof Error ? err.message : String(err),
          );
          setStatus("empty");
        }
      }
    };

    void tryBuild();

    return () => {
      cancelled = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, [projectFiles, refreshKey]);

  // When the preview first appears, ask the iframe (which captured itself via
  // the injected script) for a PNG and store it as the project thumbnail.
  const saveScreenshot = useCallback(
    async (dataUrl: string) => {
      if (!chatId) {
        return;
      }
      try {
        await fetch(`/api/screenshots/${chatId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl }),
        });
      } catch (error) {
        console.error("Save screenshot failed:", error);
      }
    },
    [chatId],
  );

  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || captureReqRef.current) {
      return;
    }
    captureReqRef.current = true;

    // Give Tailwind + React a moment to settle, then request the capture.
    const timer = setTimeout(() => {
      const onResult = (ev: MessageEvent) => {
        if (ev.data?.type === "helion:capture-result" && ev.data.dataUrl) {
          window.removeEventListener("message", onResult);
          void saveScreenshot(ev.data.dataUrl);
        }
      };
      window.addEventListener("message", onResult);
      try {
        iframe.contentWindow?.postMessage({ type: "helion:capture" }, "*");
      } catch {
        window.removeEventListener("message", onResult);
      }
    }, CAPTURE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [saveScreenshot]);

  return (
    <div className="fixed inset-0 z-50 flex h-full w-full flex-col bg-gray-50 dark:bg-black">
      {/* Toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="font-medium text-sm">Preview</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2 text-xs"
          onClick={() => setRefreshKey((prev) => prev + 1)}
          disabled={!projectFiles}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
        <span className="min-w-0 flex-1" />

        {canDeployStandalone ? (
          deploy.status === "idle" ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs"
              onClick={() => void deployStandalone()}
              disabled={!projectFiles || !srcdoc}
              title="Deploy this app to its own URL (outside HELION)"
            >
              <Rocket className="h-3.5 w-3.5" />
              Deploy App
            </Button>
          ) : deploy.status === "deploying" ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs"
              disabled
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Deploying…
            </Button>
          ) : deploy.status === "running" ? (
            <>
              <Button
                asChild
                size="sm"
                variant="default"
                className="h-8 gap-1.5 px-2 text-xs"
              >
                <a href={deploy.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open App
                </a>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 px-2 text-xs text-destructive"
                onClick={() => void stopStandalone()}
              >
                <Square className="h-3.5 w-3.5" />
                Stop
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 px-2 text-xs"
                onClick={() => void deployStandalone()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Try again
              </Button>
              <span className="max-w-[180px] truncate text-xs text-destructive">
                {deploy.message}
              </span>
            </>
          )
        ) : null}

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2 text-xs"
          onClick={onClose}
        >
          <Minimize className="h-3.5 w-3.5" />
          Minimize
        </Button>
      </div>

      {/* Preview body */}
      <div className="min-h-0 flex-1">
        {status === "ready" && srcdoc ? (
          <iframe
            ref={iframeRef}
            title="Live preview"
            sandbox="allow-scripts allow-forms allow-modals"
            srcDoc={srcdoc}
            onLoad={handleIframeLoad}
            className="h-full w-full border-0 bg-white"
          />
        ) : status === "building" ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Building preview...
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-border dark:text-input">
              <div className="mb-2">
                <Monitor className="mx-auto h-12 w-12 stroke-border text-border dark:stroke-input dark:text-input" />
              </div>
              <p className="font-medium text-sm">Preview unavailable</p>
              <p className="text-xs">
                {status === "empty"
                  ? "We couldn't build a preview for this response"
                  : "Generate an app to see it here"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


