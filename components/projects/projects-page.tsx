"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/shared/app-shell";
import type { Project } from "@/lib/projects";
import { ProjectGrid } from "./project-grid";
import { ProjectsHeader } from "./projects-header";

interface ProjectsPageProps {
  projects: Project[];
}

export function ProjectsPage({ projects }: ProjectsPageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const visibleIds = useMemo(() => filteredProjects.map((project) => project.id), [filteredProjects]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const toggleProject = (projectId: string, selected: boolean) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (selected) next.add(projectId);
      else next.delete(projectId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const bulkDelete = async () => {
    if (!selectedIds.size || isBulkDeleting) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected projects? This cannot be undone.`)) return;
    setIsBulkDeleting(true);
    try {
      const results = await Promise.all(
        [...selectedIds].map((chatId) =>
          fetch("/api/chat/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatId }),
          }),
        ),
      );
      if (results.some((response) => !response.ok)) throw new Error("Some projects could not be deleted");
      setSelectedIds(new Set());
      window.location.reload();
    } catch (error) {
      console.error("Bulk delete failed:", error);
      setIsBulkDeleting(false);
    }
  };

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <ProjectsHeader
          projectCount={filteredProjects.length}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedCount={selectedIds.size}
          allVisibleSelected={allVisibleSelected}
          onToggleAll={toggleAllVisible}
          onClearSelection={() => setSelectedIds(new Set())}
          onBulkDelete={() => void bulkDelete()}
          isBulkDeleting={isBulkDeleting}
        />
        <ProjectGrid projects={filteredProjects} selectedIds={selectedIds} onToggle={toggleProject} />
      </main>
    </AppShell>
  );
}
