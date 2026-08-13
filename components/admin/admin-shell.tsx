"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  MessagesSquare,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const NAV = [
  { title: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { title: "Users", href: "/admin/users", icon: Users },
  { title: "Chats", href: "/admin/chats", icon: MessagesSquare },
  { title: "Settings", href: "/admin/settings", icon: Settings },
];

const TITLES: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/users": "Users",
  "/admin/chats": "Chats",
  "/admin/settings": "Settings",
};

interface AdminShellProps {
  children: React.ReactNode;
}

export function AdminShell({ children }: AdminShellProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const displayName = session?.user?.name || "Admin";
  const initials =
    session?.user?.name
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "A";

  const title = TITLES[pathname] ?? "Admin";

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 px-4">
        <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
          <ShieldCheck className="size-4" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm leading-tight font-semibold">HELION</p>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">
              Admin Panel
            </p>
          </div>
        )}
      </div>
      <Separator />
      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-1 p-2">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? item.title : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  collapsed && "justify-center px-0",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.title}</span>}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
      <Separator />
      <div className={cn("p-3", collapsed && "flex justify-center")}>
        <div className="flex items-center gap-2">
          <Avatar className="size-8">
            {session?.user?.image ? (
              <AvatarImage src={session.user.image} alt={displayName} />
            ) : null}
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm leading-tight font-medium">
                {displayName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {session?.user?.email}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-background flex h-dvh overflow-hidden">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "bg-sidebar text-sidebar-foreground hidden border-r transition-[width] duration-200 md:block",
          collapsed ? "w-16" : "w-64",
        )}
      >
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="bg-sidebar text-sidebar-foreground absolute inset-y-0 left-0 w-72 shadow-xl">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="size-4" />
            </Button>
            {sidebar}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </Button>
          <h1 className="text-base font-semibold">{title}</h1>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/" className="gap-1.5">
                <LayoutDashboard className="size-4" />
                <span className="hidden sm:inline">Back to App</span>
              </Link>
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
