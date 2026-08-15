"use client";

import { useEffect, useRef, useState } from "react";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { cn } from "@/lib/utils";

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

interface AppShellProps {
  children: React.ReactNode;
  headerProps?: Omit<
    React.ComponentProps<typeof AppHeader>,
    "onMenuToggle"
  >;
  className?: string;
}

/**
 * Shared app shell for the main HELION pages: header on top, navigation
 * sidebar on the left (togglable via the header hamburger on desktop, drawer
 * on mobile), scrollable content on the right.
 */
export function AppShell({
  children,
  headerProps,
  className,
}: AppShellProps) {
  const isDesktop = useIsDesktop();
  const [collapsed, setCollapsed] = useState(false);
  // Sidebar starts closed — only opens when the user clicks the toggle.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const handleMenuToggle = () => {
    if (isDesktop) {
      // Desktop: open/close the sidebar rail
      setSidebarOpen((current) => !current);
    } else {
      // Mobile: open the drawer
      setMobileOpen(true);
    }
  };

  // Auto-close the desktop sidebar when clicking anywhere outside of it,
  // except on the header toggle button (which handles its own toggle).
  useEffect(() => {
    if (!isDesktop || !sidebarOpen) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideSidebar = sidebarRef.current?.contains(target);
      const onToggle = (event.target as HTMLElement | null)?.closest?.(
        'button[aria-label="Open sidebar"]',
      );
      if (!insideSidebar && !onToggle) {
        setSidebarOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDesktop, sidebarOpen]);

  return (
    <div
      className={cn(
        "helion-canvas relative flex h-dvh flex-col overflow-hidden dark:bg-transparent",
        className,
      )}
    >
      <AppHeader {...headerProps} onMenuToggle={handleMenuToggle} />

      <div className="flex min-h-0 flex-1">
        <div ref={sidebarRef} className="contents">
          <AppSidebar
            open={isDesktop ? sidebarOpen : false}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((current) => !current)}
            mobileOpen={mobileOpen}
            onCloseMobile={() => setMobileOpen(false)}
          />
        </div>

        <main className="relative min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
