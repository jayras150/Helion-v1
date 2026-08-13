"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ExternalLink,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type AdminUser = {
  id: string;
  email: string | null;
  name: string | null;
  provider: string;
  role: string;
  createdAt: string;
  chatCount: number;
};

const PROVIDER_LABELS: Record<string, string> = {
  credentials: "Email",
  google: "Google",
  github: "GitHub",
};

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AdminUsers() {
  const { data, isLoading, error, mutate } = useSWR<{ users: AdminUser[] }>(
    "/api/admin/users",
  );

  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [pwdTarget, setPwdTarget] = useState<AdminUser | null>(null);
  const [delTarget, setDelTarget] = useState<AdminUser | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openEdit = (u: AdminUser) => {
    setName(u.name ?? "");
    setEmail(u.email ?? "");
    setNotice(null);
    setEditTarget(u);
  };

  const openPwd = (u: AdminUser) => {
    setPassword("");
    setNotice(null);
    setPwdTarget(u);
  };

  const runAction = async (
    fn: () => Promise<{ ok: boolean; error?: string }>,
  ): Promise<boolean> => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setNotice(res.error ?? "Failed.");
        return false;
      }
      await mutate();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const toggleRole = async (u: AdminUser) => {
    const next = u.role === "admin" ? "user" : "admin";
    try {
      const res = await fetch(`/api/admin/users/${u.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: next }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        alert(body?.error ?? "Failed to change role.");
        return;
      }
      await mutate();
    } catch {
      alert("Failed to change role.");
    }
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    const ok = await runAction(async () => {
      const res = await fetch(`/api/admin/users/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      return res.ok
        ? { ok: true }
        : { ok: false, error: (await res.json().catch(() => null))?.error };
    });
    if (ok) setEditTarget(null);
  };

  const savePassword = async () => {
    if (!pwdTarget) return;
    const ok = await runAction(async () => {
      const res = await fetch(`/api/admin/users/${pwdTarget.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      return res.ok
        ? { ok: true }
        : { ok: false, error: (await res.json().catch(() => null))?.error };
    });
    if (ok) setPwdTarget(null);
  };

  const confirmDelete = async () => {
    if (!delTarget) return;
    const ok = await runAction(async () => {
      const res = await fetch(`/api/admin/users/${delTarget.id}`, {
        method: "DELETE",
      });
      return res.ok
        ? { ok: true }
        : { ok: false, error: (await res.json().catch(() => null))?.error };
    });
    if (ok) setDelTarget(null);
  };

  if (isLoading) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Failed to load users.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Users</CardTitle>
          <Badge variant="secondary">{data.users.length} users</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-center">Chats</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.users.map((user) => {
                const isAdmin = user.role === "admin";
                const nameShown = user.name || user.email || "No name";
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {nameShown.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{nameShown}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {user.email ?? "-"}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {PROVIDER_LABELS[user.provider] ?? user.provider}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={isAdmin ? "default" : "secondary"}
                        className={cn(isAdmin && "gap-1")}
                      >
                        {isAdmin ? (
                          <>
                            <ShieldCheck className="size-3" /> Admin
                          </>
                        ) : (
                          "User"
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{user.chatCount}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {fmtDate(user.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions for ${nameShown}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel>{nameShown}</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/admin/chats?userId=${user.id}`}
                              className="cursor-pointer"
                            >
                              <ExternalLink className="mr-2 size-4" />
                              View Chats ({user.chatCount})
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void toggleRole(user)}>
                            <ShieldCheck className="mr-2 size-4" />
                            {isAdmin ? "Demote to User" : "Make Admin"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(user)}>
                            <Pencil className="mr-2 size-4" />
                            Edit Name / Email
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openPwd(user)}>
                            <KeyRound className="mr-2 size-4" />
                            Reset Password
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDelTarget(user)}
                          >
                            <Trash2 className="mr-2 size-4" />
                            Delete User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog
        open={Boolean(editTarget)}
        onOpenChange={(o) => !o && setEditTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User Profile</DialogTitle>
            <DialogDescription>
              {editTarget?.email ?? "Update the user's name and email."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="edit-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="edit-email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="edit-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {notice ? <p className="text-xs text-destructive">{notice}</p> : null}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditTarget(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void saveEdit()}
              disabled={busy || !name.trim() || !email.trim()}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Pencil className="size-3.5" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog
        open={Boolean(pwdTarget)}
        onOpenChange={(o) => !o && setPwdTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Create a new password for {pwdTarget?.email ?? pwdTarget?.name ?? "user"}.
              The user can sign in with it immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="pwd" className="text-sm font-medium">
                New password
              </label>
              <Input
                id="pwd"
                type="password"
                autoComplete="new-password"
                placeholder="Minimum 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {notice ? <p className="text-xs text-destructive">{notice}</p> : null}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setPwdTarget(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void savePassword()}
              disabled={busy || password.length < 6}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <KeyRound className="size-3.5" />
              )}
              Save Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={Boolean(delTarget)}
        onOpenChange={(o) => !o && setDelTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete User?</DialogTitle>
            <DialogDescription>
              This action{" "}
              <span className="font-medium text-destructive">
                permanently deletes
              </span>{" "}
              the account {delTarget?.email ?? delTarget?.name ?? "user"} along
              with all of its chats and projects ({delTarget?.chatCount} chats).
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {notice ? <p className="text-xs text-destructive">{notice}</p> : null}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDelTarget(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              Yes, Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
