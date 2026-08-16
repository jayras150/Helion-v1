"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/hooks/use-user";
import {
  FolderKanban,
  House,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ChatItem {
  id: string;
  name?: string;
}

interface AppSidebarProps {
  /** Desktop rail visibility (fully closed when false). */
  open: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV = [
  { title: "Home", href: "/", icon: House, exact: true },
  { title: "Chats", href: "/chats", icon: MessagesSquare },
  { title: "Projects", href: "/projects", icon: FolderKanban },
];

const chatDisplayName = (chat: ChatItem) =>
  chat.name || `Chat ${chat.id.slice(0, 8)}`;

export function AppSidebar({
  open,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(
    session?.user?.role === "admin" ? true : null,
  );
  const [chats, setChats] = useState<ChatItem[]>([]);

  // Old JWTs don't carry a role — check once against the server so the Admin
  // link still appears without requiring a fresh login.
  useEffect(() => {
    if (isAdmin !== null || !session?.user?.id) {
      return;
    }
    let active = true;
    fetch("/api/admin/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { isAdmin?: boolean }) => {
        if (active) setIsAdmin(Boolean(d.isAdmin));
      })
      .catch(() => {
        if (active) setIsAdmin(false);
      });
    return () => {
      active = false;
    };
  }, [isAdmin, session?.user?.id]);

  // Recent chats for quick navigation
  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }
    let active = true;
    fetch("/api/chats")
      .then((r) => r.json())
      .then((d: { data?: ChatItem[] }) => {
        if (active) setChats((d.data || []).slice(0, 8));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const navItems = [
    ...NAV,
    ...(isAdmin
      ? [{ title: "Admin", href: "/admin", icon: ShieldCheck, exact: false }]
      : []),
  ];

  const renderBody = (showLabels: boolean, inDrawer: boolean) => (
    <div
      className={cn(
        "flex min-h-0 flex-col gap-4",
        showLabels ? "flex-1 p-3" : "p-2",
      )}
    >
      {/* New chat */}
      <Link
        href="/"
        onClick={inDrawer ? onCloseMobile : undefined}
        title={!showLabels ? "New Chat" : undefined}
        className={cn(
          "group flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 text-white shadow-lg shadow-cyan-500/25 transition-all hover:shadow-cyan-500/40 hover:brightness-105",
          showLabels ? "px-3 py-2.5" : "justify-center py-2.5",
        )}
      >
        <Plus className="size-4 shrink-0" />
        {showLabels ? (
          <span className="truncate text-sm font-semibold">New Chat</span>
        ) : null}
      </Link>

      {/* Navigation */}
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={inDrawer ? onCloseMobile : undefined}
              title={!showLabels ? item.title : undefined}
              className={cn(
                "group flex items-center gap-2.5 rounded-xl py-2 text-sm font-medium transition-all",
                showLabels ? "px-3" : "justify-center px-0",
                active
                  ? "bg-gradient-to-r from-cyan-500 to-indigo-500 text-white shadow-md shadow-cyan-500/25"
                  : "text-muted-foreground hover:bg-white/60 hover:text-foreground dark:hover:bg-white/[0.06]",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {showLabels ? (
                <span className="truncate">{item.title}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* Recent chats */}
      {showLabels ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
            Recent
          </p>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
            {chats.length === 0 ? (
              <p className="px-3 py-1 text-xs text-muted-foreground/70">
                No chats yet
              </p>
            ) : (
              chats.map((chat) => {
                const href = `/chats/${chat.id}`;
                return (
                  <Link
                    key={chat.id}
                    href={href}
                    onClick={inDrawer ? onCloseMobile : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs transition-colors",
                      pathname === href
                        ? "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                        : "text-muted-foreground hover:bg-white/60 hover:text-foreground dark:hover:bg-white/[0.06]",
                    )}
                  >
                    <Sparkles className="size-3 shrink-0 opacity-60" />
                    <span className="truncate">{chatDisplayName(chat)}</span>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside
        className={cn(
          "hidden min-w-0 shrink-0 flex-col overflow-hidden border-r border-slate-200/80 bg-white md:flex",
          "transition-[width] duration-200 dark:border-white/[0.1] dark:bg-[#0a1326]",
          !open
            ? "w-0 border-r-0"
            : collapsed
              ? "w-[4.5rem]"
              : "w-64",
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {renderBody(!collapsed, false)}
        </div>
        <div className="border-t border-slate-200/60 p-2 dark:border-white/[0.06]">
          <Button
            variant="ghost"
            className={cn(
              "h-9 text-xs text-muted-foreground hover:text-foreground",
              collapsed ? "w-9 px-0" : "w-full gap-2 px-2",
            )}
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <>
                <PanelLeftClose className="size-4" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={onCloseMobile}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-slate-200/80 bg-white shadow-2xl dark:border-white/[0.1] dark:bg-[#0a1326]">
            <div className="flex items-center justify-between border-b border-slate-200/60 px-4 py-3 dark:border-white/[0.06]">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                Menu
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={onCloseMobile}
                aria-label="Close menu"
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              {renderBody(true, true)}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
