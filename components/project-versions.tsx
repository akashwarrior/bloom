"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { HistoryIcon, Loader2Icon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { projectQueryKey, refreshProject } from "@/lib/projects/query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ensureResponseOk, readJsonResponse } from "@/lib/http";

type Revision = {
  id: string;
  parentRevisionId: string | null;
  summary: string;
  createdAt: string;
  fileCount: number;
};

export function ProjectVersions({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const client = useQueryClient();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const versions = useQuery({
    queryKey: projectQueryKey(projectId, "versions"),
    enabled: open,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/projects/${projectId}/revisions`, { signal });
      return readJsonResponse<{ currentRevisionId: string | null; revisions: Revision[] }>(
        response,
        "Failed to load versions",
      );
    },
  });
  const revisions = versions.data?.revisions ?? [];
  const currentRevisionId = versions.data?.currentRevisionId;

  const restore = async (revisionId: string) => {
    if (restoringId) return;
    setRestoringId(revisionId);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/revisions/${revisionId}/restore`,
        { method: "POST" },
      );
      await ensureResponseOk(response, "Failed to restore version");
      void refreshProject(client, projectId);
      toast.success("Project version restored");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to restore version",
      );
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Project versions</DialogTitle>
          <DialogDescription>
            Select a saved version to restore it. Partial agent changes appear here too.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-32 overflow-y-auto max-h-[70vh] scrollbar-thin scrollbar-gutter-stable scrollbar-thumb-muted pr-2">
          {versions.isPending ? (
            <Loader2Icon className="mx-auto mt-10 size-5 animate-spin" />
          ) : versions.isError ? (
            <Button variant="ghost" onClick={() => void versions.refetch()}>Retry loading versions</Button>
          ) : revisions.length ? (
            <div className="divide-y">
              {revisions.map((revision) => {
                const current = revision.id === currentRevisionId;
                return (
                  <div
                    key={revision.id}
                    className="flex items-center gap-3 py-3"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted">
                      <HistoryIcon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {revision.summary}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {revision.fileCount} files ·{" "}
                        {formatDistanceToNow(new Date(revision.createdAt), {
                          addSuffix: true,
                        })}
                        {current ? " · Current" : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={current || Boolean(restoringId)}
                      onClick={() => void restore(revision.id)}
                    >
                      {restoringId === revision.id ? (
                        <Loader2Icon className="animate-spin" />
                      ) : (
                        <RotateCcwIcon />
                      )}
                      Restore
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No versions yet.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
