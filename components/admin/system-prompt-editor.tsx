"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Loader2,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  Save,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const MAX_LEN = 20_000;

type SettingsData = {
  prompt: string;
  isDefault: boolean;
  defaultPrompt: string;
};

/**
 * Edits the AI system prompt from the admin dashboard. The value is persisted
 * to the DB (`app_settings.system_prompt`) and takes effect immediately on the
 * next chat request — no restart needed.
 */
export function SystemPromptEditor() {
  const { data, isLoading, error, mutate } = useSWR<SettingsData>(
    "/api/admin/settings",
  );
  const [value, setValue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(
    null,
  );

  const prompt = value ?? data?.prompt ?? "";
  const dirty = data ? value !== null && value !== data.prompt : false;

  const save = async (reset: boolean) => {
    if (!data || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reset ? { reset: true } : { value: prompt }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice({ text: body?.error ?? "Failed to save.", error: true });
        return;
      }
      await mutate();
      setValue(null);
      setNotice({
        text: reset
          ? "Prompt reset to the built-in default."
          : "Prompt saved to database ✓ — active immediately.",
      });
    } catch {
      setNotice({ text: "Network error.", error: true });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-80 w-full rounded-xl" />;
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Failed to load system prompt.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MessageSquareText className="size-4" />
            AI System Prompt
          </CardTitle>
          <CardDescription>
            The prompt sent to the model on every chat. Stored in the database —
            active immediately, no restart needed.
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
        <textarea
          value={prompt}
          onChange={(e) => setValue(e.target.value)}
          rows={18}
          spellCheck={false}
          className="w-full resize-y rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed outline-none focus:border-primary/50"
        />
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {prompt.length.toLocaleString("en-US")} /{" "}
            {MAX_LEN.toLocaleString("en-US")} characters
          </span>
          {data.isDefault ? (
            <Badge variant="outline">built-in default</Badge>
          ) : (
            <Badge>custom (DB)</Badge>
          )}
          {dirty ? (
            <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
              not saved yet
            </Badge>
          ) : null}
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

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => save(false)}
            disabled={saving || !dirty}
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            Save to DB
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => save(true)}
            disabled={saving || data.isDefault}
          >
            <RotateCcw className="size-3.5" />
            Reset to default
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
