"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { BookOpenText, Loader2, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type SkillRow = {
  name: string;
  description: string;
  domain: string;
  enabled: boolean;
  isDefault: boolean;
};

type SkillsData = {
  skills: SkillRow[];
  enabled: string[];
};

const DOMAIN_LABELS: Record<string, string> = {
  frontend: "Frontend",
  backend: "Backend",
  fullstack: "Fullstack",
  database: "Database",
  testing: "Testing",
  devops: "DevOps",
  security: "Security",
  data: "Data/ML",
  mobile: "Mobile",
  infra: "Infra",
  language: "Language",
  platform: "Platform",
  other: "Other",
};

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={cn(
          "inline-block size-3.5 translate-x-0.5 rounded-full bg-background shadow-sm transition-transform",
          checked && "translate-x-[18px]",
        )}
      />
    </button>
  );
}

/**
 * Browse and toggle the AI skills (vendored SKILL.md) that HELION injects into
 * the model's system prompt. Persisted to the DB.
 */
export function SkillsManager() {
  const { data, isLoading, error, mutate } = useSWR<SkillsData>(
    "/api/admin/skills",
  );
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(
    null,
  );

  const filtered = useMemo(() => {
    const list = data?.skills ?? [];
    if (!query.trim()) {
      return list;
    }
    const q = query.trim().toLowerCase();
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.domain.toLowerCase().includes(q),
    );
  }, [data, query]);

  const enabledCount = data?.enabled.length ?? 0;
  const totalCount = data?.skills.length ?? 0;

  const toggle = async (name: string, enabled: boolean) => {
    setSaving(name);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, enabled }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice({ text: body?.error ?? "Failed to save.", error: true });
        return;
      }
      await mutate();
      setNotice({ text: `Skill "${name}" ${enabled ? "enabled" : "disabled"}.` });
    } catch {
      setNotice({ text: "Network error.", error: true });
    } finally {
      setSaving(null);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Failed to load skills.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <BookOpenText className="size-4" />
            AI Skills
          </CardTitle>
          <CardDescription>
            {enabledCount} of {totalCount} skills active — SKILL.md files that
            match the user&apos;s request are injected into the system prompt.
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => mutate()}
          aria-label="Refresh"
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills… (name, description, domain)"
            className="pl-8"
          />
        </div>

        {notice ? (
          <p
            className={
              notice.error
                ? "text-xs text-destructive"
                : "text-xs text-emerald-600 dark:text-emerald-400"
            }
          >
            {notice.text}
          </p>
        ) : null}

        <div className="divide-y rounded-lg border">
          {filtered.map((s) => (
            <div key={s.name} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{s.name}</p>
                  {s.domain ? (
                    <Badge variant="outline" className="text-[10px]">
                      {DOMAIN_LABELS[s.domain] ?? s.domain}
                    </Badge>
                  ) : null}
                  {s.isDefault && !s.enabled ? (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      default
                    </Badge>
                  ) : null}
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {s.description}
                </p>
              </div>
              {saving === s.name ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : (
                <Toggle
                  checked={s.enabled}
                  onChange={(next) => void toggle(s.name, next)}
                />
              )}
            </div>
          ))}
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No skills match your search.
            </p>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          Skills are sourced from{" "}
          <code className="text-[11px]">github.com/Jeffallan/claude-skills</code>{" "}
          (MIT), vendored at <code className="text-[11px]">content/skills</code>.
          Enable as needed — the more skills are active, the larger the system
          prompt sent.
        </p>
      </CardContent>
    </Card>
  );
}
