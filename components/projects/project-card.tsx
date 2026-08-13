"use client";

import { Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Project } from "@/lib/projects";
import { ProjectThumbnail } from "./project-thumbnail";
import { formatRelativeTime } from "./utils";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleDelete = async () => {
    if (isDeleting) {
      return;
    }
    setIsDeleting(true);
    try {
      const response = await fetch("/api/chat/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: project.id }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete project");
      }

      setIsDialogOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Delete project failed:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-white transition-shadow hover:shadow-lg dark:border-input dark:bg-zinc-900">
      <Link href={`/chats/${project.id}`} className="block">
        <ProjectThumbnail
          chatId={project.id}
          name={project.name}
          hasScreenshot={project.hasScreenshot}
        />
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 font-medium text-gray-900 transition-colors group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
              {project.name}
            </h3>
          </div>
          <p className="mt-1 text-gray-500 text-sm dark:text-gray-400">
            Edited {formatRelativeTime(project.updatedAt)} ·{" "}
            {project.messageCount}{" "}
            {project.messageCount === 1 ? "message" : "messages"}
          </p>
        </div>
      </Link>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-8 w-8 bg-white/80 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 dark:bg-zinc-900/80"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Delete ${project.name}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              This will permanently delete &quot;{project.name}&quot; and all
              of its messages. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
