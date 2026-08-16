import type { UIMessage } from "ai";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
  avatar?: ReactNode;
  name?: string;
  badge?: ReactNode;
};

export const Message = ({
  className,
  from,
  avatar,
  name,
  badge,
  children,
  ...props
}: MessageProps) => {
  const isUser = from === "user";

  return (
    <div
      className={cn(
        "group flex w-full items-end gap-2.5 py-4",
        isUser ? "flex-row-reverse" : "flex-row",
        className,
      )}
      {...props}
    >
      {avatar}
      <div
        className={cn(
          "flex min-w-0 max-w-[85%] flex-col gap-1",
          isUser ? "items-end" : "items-start",
        )}
      >
        {name || badge ? (
          <div
            className={cn(
              "flex items-center gap-1.5 px-1",
              isUser ? "justify-end" : "justify-start",
            )}
          >
            {name ? (
              <span className="text-xs font-medium text-muted-foreground">
                {name}
              </span>
            ) : null}
            {badge}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
};

export type MessageContentProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const MessageContent = ({
  from,
  className,
  children,
  ...props
}: MessageContentProps) => {
  const isUser = from === "user";

  return (
    <div
      className={cn(
        "rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
        isUser
          ? "rounded-br-md bg-gradient-to-br from-cyan-500 to-indigo-600 text-white shadow-lg shadow-cyan-500/25"
          : "rounded-bl-md border border-white/85 bg-white/92 text-foreground shadow-sm backdrop-blur-xl dark:border-white/[0.12] dark:bg-[#0c1a3a]/85",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export type MessageAvatarProps = ComponentProps<typeof Avatar> & {
  src?: string;
  name?: string;
};

export const MessageAvatar = ({
  src,
  name,
  className,
  ...props
}: MessageAvatarProps) => (
  <Avatar
    className={cn("size-8 shrink-0 ring ring-1 ring-border", className)}
    {...props}
  >
    <AvatarImage alt="" className="mt-0 mb-0" src={src} />
    <AvatarFallback>{name?.slice(0, 2).toUpperCase() || "ME"}</AvatarFallback>
  </Avatar>
);
