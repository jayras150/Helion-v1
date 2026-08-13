"use client";

import Link from "next/link";
import useSWR from "swr";
import {
  CalendarDays,
  FolderKanban,
  MessagesSquare,
  Rocket,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { AdminStats } from "@/lib/db/queries";

const SCOPE_LABELS: Record<string, string> = {
  frontend: "Frontend",
  backend: "Backend",
  fullstack: "Fullstack",
  text: "Text",
};

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Zero-fills chats-per-day over the last 14 days. */
function buildSeries(chatsPerDay: AdminStats["chatsPerDay"]): { label: string; count: number }[] {
  const map = new Map(chatsPerDay.map((c) => [c.day, c.count]));
  const out: { label: string; count: number }[] = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({
      label: d.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
      count: map.get(key) ?? 0,
    });
  }
  return out;
}

export default function AdminDashboard() {
  const { data, isLoading, error } = useSWR<AdminStats>("/api/admin/stats");

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Failed to load statistics.
        </CardContent>
      </Card>
    );
  }

  const series = buildSeries(data.chatsPerDay);
  const maxCount = Math.max(...series.map((s) => s.count), 1);
  const totalScope = data.scopeBreakdown.reduce((a, b) => a + b.count, 0) || 1;

  const cards = [
    {
      title: "Total Users",
      value: fmtCount(data.totalUsers),
      icon: Users,
      hint: "Registered accounts",
    },
    {
      title: "Total Chats",
      value: fmtCount(data.totalChats),
      icon: FolderKanban,
      hint: "Projects & conversations",
    },
    {
      title: "Total Messages",
      value: fmtCount(data.totalMessages),
      icon: MessagesSquare,
      hint: "AI & user messages",
    },
    {
      title: "E2B Active",
      value: fmtCount(data.totalDeployments),
      icon: Rocket,
      hint: "Backends currently running in a sandbox",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="py-4">
              <CardHeader className="flex-row items-center justify-between px-4 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg">
                  <Icon className="size-4" />
                </div>
              </CardHeader>
              <CardContent className="px-4">
                <div className="text-2xl font-bold">{card.value}</div>
                <p className="text-xs text-muted-foreground">{card.hint}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-7">
        {/* Chart */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-4" /> 14-Day Activity
            </CardTitle>
            <CardDescription>Chats created per day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-48 items-end gap-1.5">
              {series.map((s) => (
                <div
                  key={s.label}
                  className="group flex flex-1 flex-col items-center gap-1"
                  title={`${s.label}: ${s.count}`}
                >
                  <span className="text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                    {s.count}
                  </span>
                  <div
                    className={cn(
                      "w-full rounded-t-sm transition-colors",
                      s.count > 0
                        ? "bg-primary hover:bg-primary/80"
                        : "bg-muted",
                    )}
                    style={{ height: `${Math.max((s.count / maxCount) * 100, 3)}%` }}
                  />
                  <span className="w-full truncate text-center text-[10px] text-muted-foreground">
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Scope breakdown */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Project Scope</CardTitle>
            <CardDescription>Project type distribution</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.scopeBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              data.scopeBreakdown.map((s) => {
                const pct = Math.round((s.count / totalScope) * 100);
                return (
                  <div key={s.scope} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{SCOPE_LABELS[s.scope] ?? s.scope}</span>
                      <span className="text-muted-foreground">
                        {s.count} · {pct}%
                      </span>
                    </div>
                    <div className="bg-muted h-2 overflow-hidden rounded-full">
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent chats */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Projects</CardTitle>
            <CardDescription>8 most recent projects</CardDescription>
          </div>
          <Badge variant="secondary">{data.totalChats} total</Badge>
        </CardHeader>
        <CardContent className="space-y-1">
          {data.recentChats.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No projects yet.
            </p>
          ) : (
            data.recentChats.map((chat) => (
              <Link
                key={chat.id}
                href={`/chats/${chat.id}`}
                className="hover:bg-muted/50 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors"
              >
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {chat.userEmail?.slice(0, 2).toUpperCase() ?? "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {chat.title || "Untitled"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {chat.userEmail ?? "no email"} · {fmtDate(String(chat.createdAt))}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {chat.messageCount} messages
                </Badge>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
