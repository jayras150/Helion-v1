"use client";

import { type ReactNode, useState } from "react";
import {
  BookOpenText,
  KeyRound,
  MessageSquareText,
  Server,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type SettingsTabKey = "prompt" | "credentials" | "skills" | "system";

const TABS: Array<{
  key: SettingsTabKey;
  label: string;
  icon: typeof MessageSquareText;
}> = [
  { key: "prompt", label: "System Prompt", icon: MessageSquareText },
  { key: "skills", label: "Skills", icon: BookOpenText },
  { key: "credentials", label: "Credentials", icon: KeyRound },
  { key: "system", label: "System Info", icon: Server },
];

/**
 * Segmented tab bar for the admin settings page. Sections are rendered lazily
 * (only the active tab mounts), so the prompt editor / credentials editor only
 * load their data when the tab is actually opened.
 */
export function SettingsTabs({
  sections,
}: {
  sections: Record<SettingsTabKey, ReactNode>;
}) {
  const [active, setActive] = useState<SettingsTabKey>("credentials");

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Settings"
        className="flex flex-wrap gap-1 rounded-xl border bg-muted/40 p-1"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const selected = active === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => setActive(tab.key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:flex-none",
                selected
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {tab.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">{sections[active]}</div>
    </div>
  );
}
