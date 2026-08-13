"use client";

import { Monitor } from "lucide-react";
import { useState } from "react";

interface ProjectThumbnailProps {
  chatId: string;
  name: string;
  hasScreenshot: boolean;
}

/**
 * Shows a real screenshot of the app, captured automatically in the browser
 * the first time the preview is rendered (see PreviewPanel) and stored on the
 * server. Projects that were never previewed show a neutral placeholder.
 */
export function ProjectThumbnail({
  chatId,
  name,
  hasScreenshot,
}: ProjectThumbnailProps) {
  const [failed, setFailed] = useState(false);

  if (!hasScreenshot || failed) {
    return (
      <div className="flex aspect-[3/2] items-center justify-center bg-gray-100 dark:bg-zinc-800">
        <div className="text-center text-gray-400 dark:text-gray-500">
          <Monitor className="mx-auto h-8 w-8" />
          <p className="mt-2 text-xs">No preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative aspect-[3/2] overflow-hidden bg-gray-100 dark:bg-zinc-800">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/screenshots/${chatId}`}
        alt={name}
        className="h-full w-full object-cover object-top transition-transform group-hover:scale-105"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
