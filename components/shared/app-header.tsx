"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "@/hooks/use-user";
import { FolderTree, Monitor, PanelLeftOpen } from "lucide-react";
import { Suspense, useEffect } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  /** Opens the navigation sidebar (mobile drawer). */
  onMenuToggle?: () => void;
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

/** HELION nucleus mark — a helium core with orbiting electrons. */
function HelionMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "helion-mark relative grid size-9 shrink-0 place-items-center rounded-xl",
        "bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-cyan-300",
        "shadow-[0_8px_20px_-8px_rgba(34,211,238,0.6),inset_0_1px_0_rgba(255,255,255,0.16)]",
        "ring-1 ring-white/20 transition-transform duration-300 group-hover:rotate-6 group-hover:scale-105",
        "dark:from-cyan-400/90 dark:via-indigo-500/90 dark:to-slate-950 dark:ring-white/10",
        className,
      )}
    >
      <svg viewBox="0 0 40 40" className="size-[22px] overflow-visible">
        <defs>
          <linearGradient id="helion-core-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="55%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#818cf8" />
          </linearGradient>
        </defs>
        <g transform="rotate(-35 20 20)">
          <ellipse
            cx="20"
            cy="20"
            rx="16"
            ry="6.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            opacity="0.7"
          />
          <g>
            <animateMotion
              dur="3.4s"
              repeatCount="indefinite"
              path="M 20 13.8 A 16 6.2 0 1 1 20 26.2 A 16 6.2 0 1 1 20 13.8"
            />
            <circle r="2.3" fill="#67e8f9" />
          </g>
        </g>
        <g transform="rotate(35 20 20)">
          <ellipse
            cx="20"
            cy="20"
            rx="16"
            ry="6.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            opacity="0.4"
          />
          <g>
            <animateMotion
              dur="4.4s"
              begin="-1.8s"
              repeatCount="indefinite"
              path="M 20 13.8 A 16 6.2 0 1 1 20 26.2 A 16 6.2 0 1 1 20 13.8"
            />
            <circle r="1.9" fill="#a5b4fc" />
          </g>
        </g>
        <circle cx="20" cy="20" r="4.4" fill="url(#helion-core-grad)" />
      </svg>
    </span>
  );
}

export function AppHeader({
  className = "",
  onPreview,
  previewActive = false,
  previewDisabled = false,
  onOpenFiles,
  filesDisabled = false,
  onMenuToggle,
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
        "helion-header sticky top-0 z-40 relative border-b border-slate-200/60",
        "bg-white/70 backdrop-blur-2xl",
        "shadow-[0_10px_40px_-24px_rgba(2,6,23,0.28)]",
        "dark:border-white/[0.06] dark:bg-[#0a0e17]/80",
        className,
      )}
    >
      {/* Soft ambient glow from the top corners */}
      <div className="helion-glow pointer-events-none absolute inset-0" />
      {/* Top rim light */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
      {/* Sweeping plasma hairline */}
      <div className="helion-hairline pointer-events-none absolute inset-x-0 bottom-0 h-px" />

      <Suspense fallback={null}>
        <SearchParamsHandler />
      </Suspense>

      <div className="px-3 sm:px-6 lg:px-8">
        <div className="flex min-h-16 items-center gap-2 py-2 sm:h-[4.5rem] sm:gap-5 sm:py-0">
          {/* Brand */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-4">
            {onMenuToggle ? (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
                onClick={onMenuToggle}
                aria-label="Open sidebar"
                title="Open sidebar"
              >
                <PanelLeftOpen className="size-5" />
              </Button>
            ) : null}
            <Link
              href="/"
              onClick={handleLogoClick}
              className="group flex shrink-0 items-center gap-2.5 rounded-xl px-1 py-1"
            >
              <HelionMark />
              <span className="flex flex-col leading-none">
                <span className="bg-gradient-to-r from-cyan-600 via-sky-500 to-indigo-500 bg-clip-text text-lg font-bold tracking-[0.3em] text-transparent dark:from-cyan-300 dark:via-sky-400 dark:to-indigo-400">
                  HELION
                </span>
                <span className="mt-1 hidden font-mono text-[9px] font-semibold uppercase tracking-[0.3em] text-slate-400 sm:block dark:text-slate-500">
                  AI app builder
                </span>
              </span>
            </Link>
          </div>

          {/* Actions: theme toggle, preview/files, user profile — each its own group */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {/* Dark / light mode toggle */}
            <div className="flex items-center rounded-2xl border border-white/50 bg-white/40 p-1 shadow-[0_10px_30px_-14px_rgba(79,70,229,0.4)] backdrop-blur-md dark:border-white/[0.06] dark:bg-white/[0.05]">
              <ThemeToggle />
            </div>

            {onPreview ? (
              <Button
                variant="outline"
                className={cn(
                  "h-9 shrink-0 gap-1.5 rounded-xl border-border/70 bg-background/50 px-2 text-sm shadow-sm transition-all hover:-translate-y-0.5 hover:border-cyan-400 hover:shadow-cyan-500/20 sm:px-3",
                  previewActive &&
                    "border-cyan-400 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300",
                )}
                onClick={onPreview}
                disabled={previewDisabled}
                title={previewActive ? "Previewing" : "Preview"}
              >
                <Monitor className="size-4" />
                <span className="hidden sm:inline">
                  {previewActive ? "Previewing" : "Preview"}
                </span>
              </Button>
            ) : null}

            {onOpenFiles ? (
              <Button
                variant="outline"
                className="h-9 shrink-0 gap-1.5 rounded-xl border-border/70 bg-background/50 px-2 text-sm shadow-sm transition-all hover:-translate-y-0.5 hover:border-cyan-400 hover:shadow-cyan-500/20 sm:px-3"
                onClick={onOpenFiles}
                disabled={filesDisabled}
                title="Files"
              >
                <FolderTree className="size-4" />
                <span className="hidden sm:inline">Files</span>
              </Button>
            ) : null}

            {/* User profile */}
            <div className="flex shrink-0 items-center rounded-2xl border border-white/50 bg-white/40 p-1 shadow-[0_10px_30px_-14px_rgba(79,70,229,0.4)] backdrop-blur-md dark:border-white/[0.06] dark:bg-white/[0.05]">
              <UserNav session={session} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
