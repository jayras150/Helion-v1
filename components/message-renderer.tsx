import { Check } from "lucide-react";
import { Response } from "@/components/ai-elements/response";
import { stripCodeBlocks } from "@/lib/utils";

interface MessageRendererProps {
  content: string;
  messageId?: string;
  role: "user" | "assistant";
  className?: string;
}

export function MessageRenderer({
  content,
  role,
  className,
}: MessageRendererProps) {
  // User messages are rendered as plain text.
  if (role === "user") {
    return (
      <div className={className}>
        <p className="mb-0 leading-relaxed">{content}</p>
      </div>
    );
  }

  // Assistant messages are rendered as markdown with code blocks hidden —
  // the code is still available via Preview / Files / Export.
  const visibleContent = stripCodeBlocks(content)
    .replace(
      /<!--\s*scope\s*:\s*(frontend|backend|fullstack|text)\s*-->/gi,
      "",
    )
    .trim();

  if (!visibleContent) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Check className="h-4 w-4 shrink-0 text-emerald-500" />
          Project created — open <b>Files</b> to see the code or{" "}
          <b>Preview</b> to run it.
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <Response>{visibleContent}</Response>
    </div>
  );
}

