"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { CheckCircle2, KeyRound, Loader2, Lock, RefreshCw, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Credential = {
  key: string;
  label: string;
  description: string;
  secret: boolean;
  requiresRestart: boolean;
  group: string;
  set: boolean;
  value: string;
};

const GROUP_LABELS: Record<string, string> = {
  ai: "AI Provider",
  backend: "Backend Sandbox (E2B)",
  database: "Database",
  auth: "Authentication / OAuth",
  supabase: "Supabase",
  other: "Other",
};

export function CredentialsEditor() {
  const { data, isLoading, error } = useSWR<{ credentials: Credential[] }>(
    "/api/admin/credentials",
  );
  const [editing, setEditing] = useState<Credential | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const close = () => {
    setEditing(null);
    setValue("");
    setNotice(null);
  };

  // Non-secret config (endpoint, model, etc.) is prefilled with the current
  // value so it's easy to see & tweak; secret values are never prefilled.
  const openEdit = (c: Credential) => {
    setEditing(c);
    setValue(c.secret ? "" : (c.value ?? ""));
    setNotice(null);
  };

  const save = async (clear: boolean) => {
    if (!editing) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: editing.key, value: clear ? "" : value }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice(body?.error ?? "Failed to save.");
        return;
      }
      await mutate("/api/admin/credentials");
      setNotice(
        clear
          ? "Credential cleared."
          : body.requiresRestart
            ? "Saved ✓ — changes require a dev server restart to fully apply."
            : "Saved ✓ — active immediately.",
      );
      setValue("");
      setTimeout(close, 1800);
    } catch {
      setNotice("Network error.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Failed to load credentials.
        </CardContent>
      </Card>
    );
  }

  const groups = new Map<string, Credential[]>();
  for (const c of data.credentials) {
    groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
  }

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4" /> Credentials &amp; API Keys
            </CardTitle>
            <CardDescription>
              Change values in <code>.env</code> right here. Non-secret values
              (endpoint, model, etc.) are shown; secret values only show their
              status (set / empty).
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => mutate("/api/admin/credentials")}
            aria-label="Refresh status"
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {[...groups.entries()].map(([group, creds]) => (
            <div key={group} className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {GROUP_LABELS[group] ?? group}
              </h3>
              <div className="divide-y rounded-lg border">
                {creds.map((c) => (
                  <div
                    key={c.key}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    <Lock
                      className={cn(
                        "size-4 shrink-0",
                        c.secret
                          ? "text-muted-foreground"
                          : "text-primary/70",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{c.label}</p>
                        <code className="text-[11px] text-muted-foreground">
                          {c.key}
                        </code>
                        {c.requiresRestart ? (
                          <Badge variant="outline" className="text-[10px]">
                            restart required
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.description}
                      </p>
                      {c.value && !c.secret ? (
                        <p className="truncate font-mono text-[11px] text-muted-foreground">
                          Value: {c.value}
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      variant={c.set ? "default" : "outline"}
                      className={cn("shrink-0", !c.set && "text-muted-foreground")}
                    >
                      {c.set ? (c.secret ? "•••• Set" : "Set") : "Empty"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => openEdit(c)}
                    >
                      Change
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Keys read at server start (AI provider, OAuth, database) require a{" "}
            <span className="font-medium">dev server restart</span>. Other keys
            (E2B, admin emails) take effect immediately.
          </p>
        </CardContent>
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change {editing?.label}</DialogTitle>
            <DialogDescription>
              <code>{editing?.key}</code> — {editing?.description}
              {editing?.requiresRestart
                ? " Changes require a dev server restart."
                : " Changes take effect immediately."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="cred-value" className="text-sm font-medium">
              {editing?.set
                ? editing.secret
                  ? "New value (replace)"
                  : "Change current value"
                : "Value"}
            </label>
            {editing && !editing.secret && editing.value ? (
              <p className="text-xs text-muted-foreground">
                Current value:{" "}
                <code className="font-mono text-[11px]">{editing.value}</code>
              </p>
            ) : null}
            <Input
              id="cred-value"
              type={editing?.secret ? "password" : "text"}
              autoComplete="new-password"
              placeholder={editing?.secret ? "••••••••" : "Enter new value"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && value && !saving) void save(false);
              }}
            />
            {notice ? (
              <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" />
                {notice}
              </p>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={saving || !editing?.set}
              onClick={() => void save(true)}
            >
              <RotateCcw className="size-3.5" />
              Clear
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={close} disabled={saving}>
                <X className="size-3.5" />
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void save(false)}
                disabled={saving || !value}
              >
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-3.5" />
                )}
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
