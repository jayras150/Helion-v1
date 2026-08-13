"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildPreviewHtml } from "@/lib/preview-bundler";

type Status = "loading" | "building" | "ready" | "error";

/**
 * Full-screen preview of the generated app — the "Open" target from the
 * backend panel. This is a real URL (`/preview/[chatId]?backend=<e2b-url>`)
 * that bundles the project in the browser (esbuild-wasm) and renders it in a
 * full-viewport iframe, with `/api/*` calls wired to the E2B backend when one
 * is running.
 */
export default function PreviewPage() {
  const params = useParams<{ chatId: string }>();
  const searchParams = useSearchParams();
  const chatId = params.chatId;
  const backend = searchParams.get("backend");

  const [status, setStatus] = useState<Status>("loading");
  const [srcdoc, setSrcdoc] = useState<string | null>(null);
  const [error, setError] = useState("");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const buildSeq = useRef(0);

  const build = useCallback(async () => {
    const seq = ++buildSeq.current;
    setStatus("loading");
    setSrcdoc(null);
    setError("");
    try {
      const res = await fetch(`/api/preview/${chatId}/data`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error === "unauthorized" || res.status === 401
            ? "Please sign in first to open the preview."
            : "Project not found or has no code yet.",
        );
      }
      const { files } = (await res.json()) as { files: Record<string, string> };

      setStatus("building");
      const html = await buildPreviewHtml(files, backend);
      if (seq !== buildSeq.current) {
        return;
      }
      setSrcdoc(html);
      setStatus("ready");
    } catch (err) {
      if (seq !== buildSeq.current) {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to build preview.");
      setStatus("error");
    }
  }, [chatId, backend]);

  useEffect(() => {
    void build();
  }, [build]);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Button asChild size="sm" variant="ghost" className="gap-1.5">
          <Link href={`/chats/${chatId}`}>
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
          <Server className="size-4 shrink-0" />
          <span className="truncate">
            {backend
              ? `App · E2B backend ${backend.replace(/^https?:\/\//, "")}`
              : "App preview (no backend)"}
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={status === "loading" || status === "building"}
          onClick={() => void build()}
        >
          <RefreshCw
            className={`size-4 ${status === "building" ? "animate-spin" : ""}`}
          />
          Reload
        </Button>
      </header>

      <main className="relative min-h-0 flex-1">
        {status === "ready" && srcdoc ? (
          <iframe
            ref={iframeRef}
            className="absolute inset-0 h-full w-full border-0"
            sandbox="allow-scripts allow-forms allow-modals"
            srcDoc={srcdoc}
            title="HELION preview"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            {status === "error" ? (
              <>
                <p className="text-sm text-destructive">{error}</p>
                <Button size="sm" variant="outline" onClick={() => void build()}>
                  Try again
                </Button>
              </>
            ) : (
              <>
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {status === "building"
                    ? "Membangun aplikasi…"
                    : "Memuat project…"}
                </p>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
