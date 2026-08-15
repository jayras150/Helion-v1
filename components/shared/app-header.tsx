"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "@/hooks/use-user";
import { ArrowUpRight, FolderTree, Monitor, Sparkles } from "lucide-react";
import { Suspense, useEffect } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChatSelector } from "./chat-selector";

const UserNav = dynamic(
  () => import("@/components/user-nav").then((mod) => mod.UserNav),
  { ssr: false },
);

interface AppHeaderProps {
  className?: string;
  onPreview?: () => void;
  previewActive?: boolean;
  previewDisabled?: boolean;
  onOpenFiles?: () => void;
  filesDisabled?: boolean;
}

// Component that uses useSearchParams - needs to be wrapped in Suspense
function SearchParamsHandler() {
  const searchParams = useSearchParams();
  const { update } = useSession();

  // Force session refresh when redirected after auth
  useEffect(() => {
    const shouldRefresh = searchParams.get("refresh") === "session";

    if (shouldRefresh) {
      // Force session update
      update();

      // Clean up URL without causing navigation
      const url = new URL(window.location.href);
      url.searchParams.delete("refresh");
      window.history.replaceState({}, "", url.pathname);
    }
  }, [searchParams, update]);

  return null;
}

export function AppHeader({
  className = "",
  onPreview,
  previewActive = false,
  previewDisabled = false,
  onOpenFiles,
  filesDisabled = false,
}: AppHeaderProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isHomepage = pathname === "/";

  // Handle logo click - reset UI if on homepage, otherwise navigate to homepage
  const handleLogoClick = (e: React.MouseEvent) => {
    if (isHomepage) {
      e.preventDefault();
      // Add reset parameter to trigger UI reset
      window.location.href = "/?reset=true";
    }
    // If not on homepage, let the Link component handle navigation normally
  };

  return (
    <div
      className={cn(
        "sticky top-0 z-40 relative border-white/60 bg-gradient-to-r from-white/75 via-cyan-50/65 to-indigo-50/75 border-b shadow-[0_14px_45px_-24px_rgba(79,70,229,0.45)] backdrop-blur-2xl dark:border-white/10 dark:from-slate-950/80 dark:via-cyan-950/45 dark:to-indigo-950/65",
        className,
      )}
    >
      <Suspense fallback={null}>
        <SearchParamsHandler />
      </Suspense>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-400 via-violet-500 to-pink-400 opacity-90" />
      <div className="px-3 sm:px-6 lg:px-8">
        <div className="flex min-h-16 flex-col gap-2 py-2 sm:h-[4.5rem] sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:py-0">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-5">
            <div className="shrink-0">
              <ChatSelector />
            </div>
            <div className="hidden h-7 w-px bg-border sm:block" />
            <Link
              href="/"
              onClick={handleLogoClick}
              className="group flex shrink-0 items-center gap-2 rounded-xl px-1 py-1 font-bold text-lg tracking-tight"
            >
              <span className="ui-pulse-ring flex size-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-cyan-400 via-violet-500 to-pink-500 text-white shadow-lg shadow-violet-500/30 transition-transform group-hover:rotate-6">
                <Sparkles className="size-4" />
              </span>
              <span className="bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">HELION</span>
            </Link>
          </div>

          <div className="flex w-full items-center justify-end gap-1.5 sm:w-auto sm:shrink-0 sm:gap-2">
            <div className="flex items-center gap-1 rounded-2xl border border-white/50 bg-white/35 p-1 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/[0.05]">
              <ThemeToggle />
            {onPreview ? (
              <Button
                variant="outline"
                className="h-9 w-9 shrink-0 gap-1.5 rounded-xl border-border/70 bg-background/50 p-0 text-sm shadow-sm transition-all hover:-translate-y-0.5 hover:border-cyan-400 hover:shadow-cyan-500/20 sm:h-9 sm:w-auto sm:px-3"
                onClick={onPreview}
                disabled={previewDisabled}
                title={previewActive ? "Previewing" : "Preview"}
              >
                <Monitor className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {previewActive ? "Previewing" : "Preview"}
                </span>
              </Button>
            ) : null}
            </div>
            {onOpenFiles ? (
              <Button
                variant="outline"
                className="h-9 w-9 shrink-0 gap-1.5 rounded-xl border-border/70 bg-background/50 p-0 text-sm shadow-sm transition-all hover:-translate-y-0.5 hover:border-cyan-400 hover:shadow-cyan-500/20 sm:h-9 sm:w-auto sm:px-3"
                onClick={onOpenFiles}
                disabled={filesDisabled}
                title="Files"
              >
                <FolderTree className="h-4 w-4" />
                <span className="hidden sm:inline">Files</span>
              </Button>
            ) : null}
            <Button asChild variant="ghost" className="hidden h-9 rounded-xl px-2 text-xs text-muted-foreground hover:text-foreground sm:inline-flex">
              <Link href="/projects">
                Projects <ArrowUpRight className="ml-1 size-3.5" />
              </Link>
            </Button>
            <div className="flex shrink-0 items-center rounded-2xl border border-white/50 bg-white/35 p-1 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/[0.05]">
              <UserNav session={session} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
