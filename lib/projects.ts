import "server-only";

import { getProjectSummariesByUserId } from "@/lib/db/queries";
import { screenshotExists } from "@/lib/screenshot-storage";

export interface Project {
  id: string;
  name: string;
  demoUrl: string | null;
  hasScreenshot: boolean;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export async function getProjectsByUserId(userId: string): Promise<Project[]> {
  const summaries = await getProjectSummariesByUserId(userId);

  return Promise.all(
    summaries.map(async (summary) => ({
      id: summary.id,
      name: summary.firstUserMessage?.slice(0, 50) || "Untitled Project",
      demoUrl: null,
      hasScreenshot: await screenshotExists(summary.id),
      createdAt: summary.createdAt.toISOString(),
      updatedAt: summary.updatedAt.toISOString(),
      messageCount: summary.messageCount,
    })),
  );
}
