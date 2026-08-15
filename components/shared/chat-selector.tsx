"use client";

import {
  Copy,
  Edit2,
  Eye,
  EyeOff,
  Lock,
  Loader2,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/hooks/use-user";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Chat {
  id: string;
  name?: string;
  privacy?: "public" | "private" | "team" | "team-edit" | "unlisted";
  createdAt: string;
  url?: string;
}

type PrivacyType = "public" | "private" | "team" | "team-edit" | "unlisted";

const getChatDisplayName = (chat: Chat): string =>
  chat.name || `Chat ${chat.id.slice(0, 8)}...`;

const privacyConfig: Record<
  PrivacyType,
  { icon: typeof Eye; label: string; description: string }
> = {
  public: {
    icon: Eye,
    label: "Public",
    description: "Anyone can see this chat",
  },
  private: {
    icon: EyeOff,
    label: "Private",
    description: "Only you can see this chat",
  },
  team: {
    icon: Users,
    label: "Team",
    description: "Team members can see this chat",
  },
  "team-edit": {
    icon: Users,
    label: "Team Edit",
    description: "Team members can see and edit this chat",
  },
  unlisted: {
    icon: Lock,
    label: "Unlisted",
    description: "Only people with the link can see this chat",
  },
};

const getPrivacyIcon = (privacy: string) => {
  const config = privacyConfig[privacy as PrivacyType] || privacyConfig.private;
  const Icon = config.icon;
  return <Icon className="h-4 w-4" />;
};

const getPrivacyDisplayName = (privacy: string) =>
  privacyConfig[privacy as PrivacyType]?.label || "Private";

export function ChatSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const [chats, setChats] = useState<Chat[]>([]);
  const [_isLoading, setIsLoading] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [isVisibilityDialogOpen, setIsVisibilityDialogOpen] = useState(false);
  const [renameChatName, setRenameChatName] = useState("");
  const [selectedVisibility, setSelectedVisibility] = useState<
    "public" | "private" | "team" | "team-edit" | "unlisted"
  >("private");
  const [isRenamingChat, setIsRenamingChat] = useState(false);
  const [isDeletingChat, setIsDeletingChat] = useState(false);
  const [isDuplicatingChat, setIsDuplicatingChat] = useState(false);
  const [isChangingVisibility, setIsChangingVisibility] = useState(false);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Get current chat ID if on a chat page
  const currentChatId = pathname?.startsWith("/chats/")
    ? pathname.split("/")[2]
    : null;

  // Fetch user's chats
  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    const fetchChats = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/chats");
        if (response.ok) {
          const data = await response.json();
          setChats(data.data || []);
        }
      } catch (error) {
        console.error("Failed to fetch chats:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchChats();
  }, [session?.user?.id]);

  const handleValueChange = useCallback(
    (chatId: string) => {
      setHistoryOpen(false);
      router.push(`/chats/${chatId}`);
    },
    [router],
  );

  const handleRenameChat = useCallback(async () => {
    if (!(renameChatName.trim() && currentChatId)) {
      return;
    }

    setIsRenamingChat(true);
    try {
      const response = await fetch(`/api/chats/${currentChatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameChatName.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to rename chat");
      }

      const updatedChat = await response.json();
      setChats((prev) =>
        prev.map((c) =>
          c.id === currentChatId ? { ...c, name: updatedChat.name } : c,
        ),
      );
      setIsRenameDialogOpen(false);
      setRenameChatName("");
    } catch (error) {
      console.error("Error renaming chat:", error);
    } finally {
      setIsRenamingChat(false);
    }
  }, [renameChatName, currentChatId]);

  const handleDeleteChat = useCallback(async () => {
    if (!currentChatId) {
      return;
    }

    setIsDeletingChat(true);
    try {
      const response = await fetch(`/api/chats/${currentChatId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete chat");
      }

      setChats((prev) => prev.filter((c) => c.id !== currentChatId));
      setIsDeleteDialogOpen(false);
      router.push("/");
    } catch (error) {
      console.error("Error deleting chat:", error);
    } finally {
      setIsDeletingChat(false);
    }
  }, [currentChatId, router]);

  const handleDeleteChatFromList = useCallback(
    async (chat: Chat) => {
      if (deletingChatId) return;
      const confirmed = window.confirm(
        `Delete "${getChatDisplayName(chat)}"? This will permanently remove the chat and all its messages.`,
      );
      if (!confirmed) return;

      setDeletingChatId(chat.id);
      try {
        const response = await fetch(`/api/chats/${chat.id}`, {
          method: "DELETE",
        });
        if (!response.ok) throw new Error("Failed to delete chat");

        setChats((previous) => previous.filter((item) => item.id !== chat.id));
        if (chat.id === currentChatId) {
          router.push("/");
        }
      } catch (error) {
        console.error("Error deleting chat from selector:", error);
      } finally {
        setDeletingChatId(null);
      }
    },
    [currentChatId, deletingChatId, router],
  );

  const handleDuplicateChat = useCallback(async () => {
    if (!currentChatId) {
      return;
    }

    setIsDuplicatingChat(true);
    try {
      const response = await fetch("/api/chat/fork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: currentChatId }),
      });

      if (!response.ok) {
        throw new Error("Failed to duplicate chat");
      }

      const result = await response.json();
      setIsDuplicateDialogOpen(false);
      router.push(`/chats/${result.id}`);
    } catch (error) {
      console.error("Error duplicating chat:", error);
    } finally {
      setIsDuplicatingChat(false);
    }
  }, [currentChatId, router]);

  const handleChangeVisibility = useCallback(async () => {
    if (!currentChatId) {
      return;
    }

    setIsChangingVisibility(true);
    try {
      const response = await fetch(`/api/chats/${currentChatId}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privacy: selectedVisibility }),
      });

      if (!response.ok) {
        throw new Error("Failed to change chat visibility");
      }

      const updatedChat = await response.json();
      setChats((prev) =>
        prev.map((c) =>
          c.id === currentChatId ? { ...c, privacy: updatedChat.privacy } : c,
        ),
      );
      setIsVisibilityDialogOpen(false);
    } catch (error) {
      console.error("Error changing chat visibility:", error);
    } finally {
      setIsChangingVisibility(false);
    }
  }, [currentChatId, selectedVisibility]);

  const isAnyActionPending =
    isRenamingChat ||
    isDeletingChat ||
    isDuplicatingChat ||
    isChangingVisibility || deletingChatId !== null;

  // Don't show if user is not authenticated
  if (!session?.user?.id) {
    return null;
  }

  const currentChat = currentChatId
    ? chats.find((c) => c.id === currentChatId)
    : null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 rounded-xl border-cyan-400/30 bg-cyan-500/10 shadow-sm hover:border-cyan-400 hover:bg-cyan-500/15"
        onClick={() => setHistoryOpen(true)}
        aria-label="Open chat history"
      >
        <Menu className="size-4" />
      </Button>

      {historyOpen ? (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-sm"
            onClick={() => setHistoryOpen(false)}
            aria-label="Close chat history"
          />
          <aside className="glass-panel absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col rounded-none border-y-0 border-l-0 p-4 shadow-2xl dark:bg-slate-950/90">
            <div className="flex items-center justify-between border-b border-border/60 pb-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-600 dark:text-cyan-300">Workspace</p>
                <h2 className="mt-1 text-lg font-semibold">Chat history</h2>
              </div>
              <Button type="button" variant="ghost" size="icon" className="rounded-xl" onClick={() => setHistoryOpen(false)} aria-label="Close chat history">
                <X className="size-4" />
              </Button>
            </div>
            <div className="mt-4 flex-1 space-y-1 overflow-y-auto">
              {chats.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No chat history yet.</p>
              ) : (
                chats.slice(0, 30).map((chat) => {
                  const active = chat.id === currentChatId;
                  return (
                    <div key={chat.id} className={`group flex items-center gap-1 rounded-xl p-1 transition-all ${active ? "bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-lg shadow-cyan-500/20" : "hover:bg-accent"}`}>
                      <button type="button" onClick={() => handleValueChange(chat.id)} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm">
                        <MessageSquare className="size-4 shrink-0" />
                        <span className="min-w-0 truncate">{getChatDisplayName(chat)}</span>
                      </button>
                      <button type="button" onClick={() => void handleDeleteChatFromList(chat)} className="mr-1 hidden size-7 shrink-0 items-center justify-center rounded-lg text-current/60 hover:bg-destructive/15 hover:text-destructive group-hover:flex" aria-label={`Delete ${getChatDisplayName(chat)}`} disabled={deletingChatId !== null}>
                        {deletingChatId === chat.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <Button type="button" variant="outline" className="mt-4 w-full justify-start rounded-xl" onClick={() => { setHistoryOpen(false); router.push("/"); }}>
              <MessageSquare className="size-4" /> New chat
            </Button>
          </aside>
        </div>
      ) : null}

      {/* Rename Chat Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Chat</DialogTitle>
            <DialogDescription>
              Enter a new name for this chat.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Chat name"
              value={renameChatName}
              onChange={(e) => setRenameChatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isRenamingChat) {
                  handleRenameChat();
                }
              }}
              disabled={isRenamingChat}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsRenameDialogOpen(false);
                setRenameChatName("");
              }}
              disabled={isRenamingChat}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRenameChat}
              disabled={isRenamingChat || !renameChatName.trim()}
            >
              {isRenamingChat ? "Renaming..." : "Rename Chat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Chat Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Chat</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this chat? This action cannot be
              undone and will permanently remove the chat and all its messages.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeletingChat}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteChat}
              disabled={isDeletingChat}
            >
              {isDeletingChat ? "Deleting..." : "Delete Chat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Chat Dialog */}
      <Dialog
        open={isDuplicateDialogOpen}
        onOpenChange={setIsDuplicateDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate Chat</DialogTitle>
            <DialogDescription>
              This will create a copy of the current chat. You'll be redirected
              to the new chat once it's created.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDuplicateDialogOpen(false)}
              disabled={isDuplicatingChat}
            >
              Cancel
            </Button>
            <Button onClick={handleDuplicateChat} disabled={isDuplicatingChat}>
              {isDuplicatingChat ? "Duplicating..." : "Duplicate Chat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Visibility Dialog */}
      <Dialog
        open={isVisibilityDialogOpen}
        onOpenChange={setIsVisibilityDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Chat Visibility</DialogTitle>
            <DialogDescription>
              Choose who can see and access this chat.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select
              value={selectedVisibility}
              onValueChange={(
                value: "public" | "private" | "team" | "team-edit" | "unlisted",
              ) => setSelectedVisibility(value)}
            >
              <SelectTrigger>
                <SelectValue>
                  <div className="flex items-center gap-2">
                    {getPrivacyIcon(selectedVisibility)}
                    <span>{getPrivacyDisplayName(selectedVisibility)}</span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">
                  <div className="flex items-center gap-2">
                    <EyeOff className="h-4 w-4" />
                    <div>
                      <div>Private</div>
                      <div className="text-muted-foreground text-xs">
                        Only you can see this chat
                      </div>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="public">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    <div>
                      <div>Public</div>
                      <div className="text-muted-foreground text-xs">
                        Anyone can see this chat
                      </div>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="team">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <div>
                      <div>Team</div>
                      <div className="text-muted-foreground text-xs">
                        Team members can see this chat
                      </div>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="team-edit">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <div>
                      <div>Team Edit</div>
                      <div className="text-muted-foreground text-xs">
                        Team members can see and edit this chat
                      </div>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="unlisted">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    <div>
                      <div>Unlisted</div>
                      <div className="text-muted-foreground text-xs">
                        Only people with the link can see this chat
                      </div>
                    </div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsVisibilityDialogOpen(false)}
              disabled={isChangingVisibility}
            >
              Cancel
            </Button>
            <Button
              onClick={handleChangeVisibility}
              disabled={isChangingVisibility}
            >
              {isChangingVisibility ? "Changing..." : "Change Visibility"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
