"use client";

import { zip, strToU8 } from "fflate";
import {
  ChevronDown,
  ChevronRight,
  Download,
  File,
  Folder,
  FolderOpen,
  FolderTree,
  Loader2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { extractProjectFiles } from "@/lib/extract-files";

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children: TreeNode[];
}

function buildTree(files: Record<string, string>): TreeNode[] {
  const root: TreeNode[] = [];

  for (const filePath of Object.keys(files)) {
    const segments = filePath.split("/").filter(Boolean);
    let level = root;
    let acc = "";

    segments.forEach((segment, index) => {
      acc += `/${segment}`;
      const isFile = index === segments.length - 1;

      let node = level.find((n) => n.name === segment);
      if (!node) {
        node = {
          name: segment,
          path: acc,
          type: isFile ? "file" : "folder",
          children: [],
        };
        level.push(node);
      }

      if (!isFile) {
        level = node.children;
      }
    });
  }

  return root;
}

function TreeItem({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(true);

  if (node.type === "file") {
    return (
      <div
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        className="flex items-center gap-1.5 rounded py-1 pr-2 text-sm text-muted-foreground hover:bg-muted/60"
      >
        <File className="h-4 w-4 shrink-0 text-muted-foreground/70" />
        <span className="truncate">{node.name}</span>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        className="flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-sm font-medium text-foreground hover:bg-muted/60"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        {open ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-amber-500" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {open &&
        node.children.map((child) => (
          <TreeItem key={child.path} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}

function downloadZip(
  files: Record<string, string>,
  filename: string,
): Promise<void> {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    entries[path.replace(/^\//, "")] = strToU8(content);
  }

  return new Promise((resolve) => {
    zip(entries, { level: 6 }, (err, data) => {
      if (!err && data) {
        const blob = new Blob([data], { type: "application/zip" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${filename || "project"}.zip`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }
      resolve();
    });
  });
}

interface FilesSidebarProps {
  open: boolean;
  sourceCode: string | null;
  onClose: () => void;
}

export function FilesSidebar({ open, sourceCode, onClose }: FilesSidebarProps) {
  const [isExporting, setIsExporting] = useState(false);

  const files = useMemo(
    () => extractProjectFiles(sourceCode ?? ""),
    [sourceCode],
  );
  const tree = useMemo(() => (files ? buildTree(files) : []), [files]);

  if (!open) {
    return null;
  }

  const handleExport = async () => {
    if (!files) {
      return;
    }
    setIsExporting(true);
    try {
      await downloadZip(files, "project");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="absolute top-0 right-0 flex h-full w-80 max-w-[85vw] flex-col border-l border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2 font-medium text-sm">
            <FolderTree className="h-4 w-4" />
            Project Files
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onClose}
            aria-label="Close file explorer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Tree */}
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {files && tree.length > 0 ? (
            tree.map((node) => (
              <TreeItem key={node.path} node={node} depth={0} />
            ))
          ) : (
            <div className="px-3 py-10 text-center text-muted-foreground text-sm">
              No project files yet
            </div>
          )}
        </div>

        {/* Export */}
        <div className="shrink-0 border-t border-border p-3">
          <Button
            className="w-full gap-2"
            onClick={handleExport}
            disabled={!files || isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export zip
          </Button>
        </div>
      </aside>
    </div>
  );
}
