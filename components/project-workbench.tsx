"use client";

import { useRef, type ReactNode } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { AlertTriangleIcon, Loader2Icon } from "lucide-react";

import { cn } from "@/lib/utils";
import { ProjectFiles } from "@/components/project-files";
import { Button } from "@/components/ui/button";
import { useProjectRuntime } from "@/hooks/use-project-runtime";
import { DesignSidebar } from "@/components/design-sidebar";
import {
  previewPageUrl,
  previewPathAtom,
  previewReloadAtom,
  workbenchViewAtom,
} from "@/lib/workbench-state";

const statusLabels = {
  idle: "Waiting to start",
  preparing: "Preparing isolated runtime",
  installing: "Installing dependencies",
  starting: "Starting development server",
  ready: "Preview ready",
  error: "Preview failed",
  busy: "The local workspace is busy",
} as const;

export function ProjectWorkbench({
  projectId,
  chat,
}: {
  projectId: string;
  chat: ReactNode;
}) {
  const view = useAtomValue(workbenchViewAtom);
  const setView = useSetAtom(workbenchViewAtom);
  const path = useAtomValue(previewPathAtom);
  const reloadKey = useAtomValue(previewReloadAtom);
  const designMode = view === "design";
  const { state, activate, activating } = useProjectRuntime(
    projectId,
    view !== "files",
  );
  const url = previewPageUrl(state.previewUrl, path);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const previewFrameKey = `${url}-${state.revisionId ?? ""}-${reloadKey}`;

  return (
    <div className="flex min-h-0 w-full flex-1 overflow-hidden">
      <div
        className={cn(
          "relative min-w-0 flex-1 flex-col items-center overflow-hidden bg-background",
          designMode ? "hidden" : "flex",
        )}
      >
        {chat}
      </div>
      {designMode && (
        <div className="relative flex min-w-0 flex-1 flex-col items-center overflow-hidden bg-background">
          <DesignSidebar
            projectId={projectId}
            revisionId={state.revisionId}
            previewUrl={url}
            frameKey={previewFrameKey}
            frameRef={frameRef}
            onOpenChat={() => setView("preview")}
          />
        </div>
      )}

      <div className="h-full min-w-2/3 flex-1 overflow-hidden p-2">
        <section className="relative size-full overflow-hidden rounded-xl border bg-muted/30 shadow">
          {view === "files" ? null : url ? (
            <iframe
              ref={frameRef}
              key={previewFrameKey}
              src={url}
              title="Project preview"
              allow="cross-origin-isolated"
              className="size-full border-0"
            />
          ) : (
            <div className="grid size-full place-items-center bg-muted/40">
              <div className="max-w-sm px-6 text-center">
                {activating || state.status === "starting" ? (
                  <Loader2Icon className="mx-auto mb-4 size-8 animate-spin text-bloom" />
                ) : state.status === "error" ? (
                  <AlertTriangleIcon className="mx-auto mb-4 size-8 text-destructive" />
                ) : null}
                <p className="text-sm font-medium">
                  {statusLabels[state.status]}
                </p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {state.error ??
                    "The first start can take a moment while project dependencies are installed."}
                </p>
                {(state.status === "idle" || state.status === "error") &&
                  !activating && (
                    <Button
                      className="mt-3"
                      size="sm"
                      onClick={() => activate()}
                    >
                      {state.status === "error"
                        ? "Restart preview"
                        : "Start preview"}
                    </Button>
                  )}
              </div>
            </div>
          )}
          <div hidden={view !== "files"} className="size-full">
            <ProjectFiles projectId={projectId} active={view === "files"} />
          </div>
        </section>
      </div>
    </div>
  );
}
