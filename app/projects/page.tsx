import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth";
import { ProjectsPage } from "@/components/projects/projects-page";
import { getProjectsByUserId } from "@/lib/projects";

export default async function Projects() {
  const user = await getServerUser();

  if (!user?.id) {
    redirect("/login");
  }

  const projects = await getProjectsByUserId(user.id);

  return <ProjectsPage projects={projects} />;
}
