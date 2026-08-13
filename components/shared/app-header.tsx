"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { FolderTree, Monitor } from "lucide-react";
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
        "border-border bg-gray-50 border-b dark:border-input dark:bg-card",
        className,
      )}
    >
      <Suspense fallback={null}>
        <SearchParamsHandler />
      </Suspense>

      <div className="px-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-1.5 py-2 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-0">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-4">
            <Link
              href="/"
              onClick={handleLogoClick}
              className="shrink-0 bg-gradient-to-r from-cyan-500 to-sky-600 bg-clip-text font-bold text-lg tracking-tight text-transparent dark:from-cyan-400 dark:to-sky-500"
            >
              HELION
            </Link>
            <div className="min-w-0">
              <ChatSelector />
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1 sm:ml-0 sm:gap-4">
            <ThemeToggle />
            {onPreview ? (
              <Button
                variant="outline"
                className="h-8 w-8 shrink-0 gap-1.5 p-0 text-sm sm:h-fit sm:w-auto sm:px-3 sm:py-1.5"
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
            {onOpenFiles ? (
              <Button
                variant="outline"
                className="h-8 w-8 shrink-0 gap-1.5 p-0 text-sm sm:h-fit sm:w-auto sm:px-3 sm:py-1.5"
                onClick={onOpenFiles}
                disabled={filesDisabled}
                title="Files"
              >
                <FolderTree className="h-4 w-4" />
                <span className="hidden sm:inline">Files</span>
              </Button>
            ) : null}
            <UserNav session={session} />
          </div>
        </div>
      </div>
    </div>
  );
}
