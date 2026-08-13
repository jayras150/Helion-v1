"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { ExternalLink, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AdminChat = {
  id: string;
  title: string;
  userEmail: string | null;
  scope: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

const SCOPE_STYLES: Record<string, string> = {
  frontend: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  backend: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  fullstack: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  text: "border-border bg-muted text-muted-foreground",
};

const SCOPE_LABELS: Record<string, string> = {
  frontend: "Frontend",
  backend: "Backend",
  fullstack: "Fullstack",
  text: "Text",
};

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AdminChats() {
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const query = userId ? `/api/admin/chats?userId=${userId}` : "/api/admin/chats";
  const { data, isLoading, error } = useSWR<{ chats: AdminChat[] }>(query);

  if (isLoading) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Failed to load chats.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Projects & Chats</CardTitle>
        <div className="flex items-center gap-2">
          {userId ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/chats" className="gap-1">
                <X className="size-3.5" />
                All chats
              </Link>
            </Button>
          ) : null}
          <Badge variant="secondary">{data.chats.length} project</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead className="text-center">Messages</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.chats.map((chat) => (
              <TableRow key={chat.id}>
                <TableCell className="max-w-[220px] truncate font-medium">
                  {chat.title || "Untitled"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {chat.userEmail ?? "-"}
                </TableCell>
                <TableCell>
                  {chat.scope ? (
                    <Badge variant="outline" className={cn(SCOPE_STYLES[chat.scope])}>
                      {SCOPE_LABELS[chat.scope] ?? chat.scope}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-center">{chat.messageCount}</TableCell>
                <TableCell className="text-muted-foreground">
                  {fmtDate(chat.createdAt)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {fmtDate(chat.updatedAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/chats/${chat.id}`} className="gap-1">
                      <ExternalLink className="size-3.5" />
                      Open
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
