"use client";

import { useState } from "react";
import { AppHeader } from "@/components/shared/app-header";
import type { Project } from "@/lib/projects";
import { ProjectGrid } from "./project-grid";
import { ProjectsHeader } from "./projects-header";

interface ProjectsPageProps {
  projects: Project[];
}

export function ProjectsPage({ projects }: ProjectsPageProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-transparent">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <ProjectsHeader
          projectCount={filteredProjects.length}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
        <ProjectGrid projects={filteredProjects} />
      </main>
    </div>
  );
}
