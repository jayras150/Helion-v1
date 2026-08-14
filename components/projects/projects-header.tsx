import { CheckSquare, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ProjectsHeaderProps {
  projectCount: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCount: number;
  allVisibleSelected: boolean;
  onToggleAll: () => void;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  isBulkDeleting: boolean;
}

export function ProjectsHeader({
  projectCount,
  searchQuery,
  onSearchChange,
  selectedCount,
  allVisibleSelected,
  onToggleAll,
  onClearSelection,
  onBulkDelete,
  isBulkDeleting,
}: ProjectsHeaderProps) {
  return (
    <div className="mb-8 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl text-gray-900 dark:text-white">
            Projects
          </h1>
          <p className="mt-1 text-gray-600 text-sm dark:text-gray-400">
            {projectCount} {projectCount === 1 ? "project" : "projects"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedCount > 0 ? (
            <>
              <Button variant="outline" size="sm" onClick={onClearSelection} disabled={isBulkDeleting}>
                <X className="mr-1.5 size-4" /> Clear
              </Button>
              <Button variant="destructive" size="sm" onClick={onBulkDelete} disabled={isBulkDeleting}>
                {isBulkDeleting ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Trash2 className="mr-1.5 size-4" />}
                Delete {selectedCount}
              </Button>
            </>
          ) : null}
          <Button asChild>
          <Link href="/">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Link>
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={onToggleAll} disabled={isBulkDeleting}>
          <CheckSquare className="mr-1.5 size-4" />
          {allVisibleSelected ? "Deselect visible" : "Select visible"}
        </Button>
        <div className="relative max-w-md flex-1">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          type="text"
          placeholder="Search for a project..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
        </div>
      </div>
    </div>
  );
}
