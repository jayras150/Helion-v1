"use client";

import {
  FolderKanban,
  LogOut,
  MessageSquare,
  ShieldCheck,
  User,
} from "lucide-react";
import Link from "next/link";
import type { Session } from "next-auth";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserNavProps {
  session: Session | null;
}

export function UserNav({ session }: UserNavProps) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(
    session?.user?.role === "admin" ? true : null,
  );

  // Old JWTs don't carry a role — check once against the server so the Admin
  // link still appears without requiring a fresh login.
  useEffect(() => {
    if (isAdmin !== null || !session?.user?.id) {
      return;
    }
    let active = true;
    fetch("/api/admin/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { isAdmin?: boolean }) => {
        if (active) setIsAdmin(Boolean(d.isAdmin));
      })
      .catch(() => {
        if (active) setIsAdmin(false);
      });
    return () => {
      active = false;
    };
  }, [isAdmin, session?.user?.id]);

  const displayName = session?.user?.name || "User";
  const initials =
    session?.user?.name
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") ||
    session?.user?.email?.split("@")[0]?.slice(0, 2)?.toUpperCase() ||
    "U";

  const isSignedOut = !session;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            {session?.user?.image ? (
              <AvatarImage src={session.user.image} alt={displayName} />
            ) : null}
            <AvatarFallback className="bg-primary text-primary-foreground">
              {isSignedOut ? <User className="h-4 w-4" /> : initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="font-medium text-sm leading-none">
              {isSignedOut ? "Not signed in" : displayName}
            </p>
            {session?.user?.email && (
              <p className="text-muted-foreground text-xs leading-none">
                {session.user.email}
              </p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!isSignedOut && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/projects" className="cursor-pointer">
                <FolderKanban className="mr-2 h-4 w-4" />
                <span>Projects</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/chats" className="cursor-pointer">
                <MessageSquare className="mr-2 h-4 w-4" />
                <span>Chats</span>
              </Link>
            </DropdownMenuItem>
            {isAdmin ? (
              <DropdownMenuItem asChild>
                <Link href="/admin" className="cursor-pointer">
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  <span>Admin Dashboard</span>
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
          </>
        )}
        {isSignedOut && (
          <>
            <DropdownMenuItem asChild>
              <a href="/register" className="cursor-pointer">
                <span>Create Account</span>
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/login" className="cursor-pointer">
                <span>Sign In</span>
              </a>
            </DropdownMenuItem>
          </>
        )}
        {!isSignedOut && (
          <DropdownMenuItem
            onClick={async () => {
              // Clear any local session data first
              await signOut({ callbackUrl: "/", redirect: true });
            }}
            className="cursor-pointer"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sign out</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
