"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { HistoryIcon, Loader2Icon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Revision = {
  id: string;
  parentRevisionId: string | null;
  authorType: "SYSTEM" | "AGENT" | "USER" | "RESTORE";
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
  const [revisionState, setRevisionState] = useState<{
    projectId: string;
    revisions: Revision[];
    currentRevisionId: string | null;
  } | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void fetch(`/api/projects/${projectId}/revisions`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load versions");
        return response.json() as Promise<{
          currentRevisionId: string | null;
          revisions: Revision[];
        }>;
      })
      .then((result) => {
        setRevisionState({ projectId, ...result });
      })
      .catch((error) => {
        setRevisionState({ projectId, revisions: [], currentRevisionId: null });
        toast.error(
          error instanceof Error ? error.message : "Failed to load versions",
        );
      });
  }, [open, projectId]);

  const loading = revisionState?.projectId !== projectId;
  const revisions = loading ? [] : revisionState.revisions;
  const currentRevisionId = loading ? null : revisionState.currentRevisionId;

  const restore = async (revisionId: string) => {
    if (restoringId) return;
    setRestoringId(revisionId);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/revisions/${revisionId}/restore`,
        { method: "POST" },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to restore version");
      }
      const revision = (await response.json()) as { id: string };
      setRevisionState((current) =>
        current?.projectId === projectId
          ? { ...current, currentRevisionId: revision.id }
          : current,
      );
      window.dispatchEvent(new Event("bloom:revision-changed"));
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
            Every successful agent change creates one restorable version.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-32 overflow-y-auto max-h-[70vh] scrollbar-thin scrollbar-gutter-stable scrollbar-thumb-muted pr-2">
          {loading ? (
            <Loader2Icon className="mx-auto mt-10 size-5 animate-spin" />
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
