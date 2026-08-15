"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { forwardRef } from "react";

import { Button } from "@/components/ui/button";

export const ThemeToggle = forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Button>
>(({ onClick, ...props }, ref) => {
  const { theme, setTheme } = useTheme();

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setTheme(theme === "dark" ? "light" : "dark");
    if (onClick) {
      onClick(event);
    }
  };

  return (
    <Button
      ref={ref}
      variant="ghost"
      type="button"
      size="icon"
      className="cursor-pointer px-2"
      onClick={handleClick}
      aria-label="Theme"
      {...props}
    >
      <Sun className="h-[1.2rem] w-[1.2rem] text-yellow-500 dark:hidden dark:text-yellow-400" />
      <Moon className="hidden h-[1.2rem] w-[1.2rem] text-yellow-500 dark:block dark:text-yellow-400" />
    </Button>
  );
});

ThemeToggle.displayName = "ThemeToggle";
