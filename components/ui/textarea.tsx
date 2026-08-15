import type * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-sizing-content flex min-h-16 w-full rounded-xl border border-white/60 bg-white/45 px-3 py-2 text-base shadow-xs outline-none backdrop-blur-md transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-cyan-400/70 focus-visible:ring-[3px] focus-visible:ring-cyan-400/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:border-white/[0.07] dark:bg-white/[0.06] dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
