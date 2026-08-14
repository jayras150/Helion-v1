import type { Project } from "@/lib/projects";
import { ProjectCard } from "./project-card";
import { ProjectsEmptyState } from "./projects-empty-state";

interface ProjectGridProps {
  projects: Project[];
  selectedIds: Set<string>;
  onToggle: (projectId: string, selected: boolean) => void;
}

export function ProjectGrid({ projects, selectedIds, onToggle }: ProjectGridProps) {
  if (projects.length === 0) {
    return <ProjectsEmptyState />;
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          selected={selectedIds.has(project.id)}
          onSelect={(selected) => onToggle(project.id, selected)}
        />
      ))}
    </div>
  );
}
