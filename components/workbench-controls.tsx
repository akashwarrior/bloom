"use client";

import { useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  Code2Icon,
  ExternalLinkIcon,
  Globe2Icon,
  MousePointer2Icon,
  RefreshCcwIcon,
} from "lucide-react";

import { AnimatedBackground } from "@/components/ui/animated-background";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Separator } from "@/components/ui/separator";
import { useProjectRuntime } from "@/hooks/use-project-runtime";
import {
  WORKBENCH_VIEWS,
  openPreviewPathAtom,
  previewPageUrl,
  previewPathAtom,
  reloadPreviewAtom,
  workbenchViewAtom,
  type WorkbenchView,
} from "@/lib/workbench-state";

const viewItems = {
  preview: { label: "Preview", icon: Globe2Icon },
  files: { label: "Files", icon: Code2Icon },
  design: { label: "Design", icon: MousePointer2Icon },
} satisfies Record<WorkbenchView, unknown>;

export function WorkbenchViewSwitch() {
  const [view, setView] = useAtom(workbenchViewAtom);

  return (
    <ButtonGroup
      aria-label="Workbench view"
      className="rounded-full gap-px bg-muted p-0.5"
    >
      <AnimatedBackground
        value={view}
        onValueChange={(next) => setView(next as WorkbenchView)}
        className="bg-background group-first:rounded-l-full! group-last:rounded-r-full!"
      >
        {WORKBENCH_VIEWS.map((item) => {
          const { label, icon: Icon } = viewItems[item];
          return (
            <div key={item} data-id={item} className="group">
              <Button
                type="button"
                variant="ghost"
                aria-label={label}
                aria-pressed={view === item}
                className="group-data-checked:text-primary! transition-colors group-first:rounded-l-full group-last:rounded-r-full hover:bg-background rounded-xs"
              >
                <Icon />
                <span className="hidden group-data-checked:flex">{label}</span>
              </Button>
            </div>
          );
        })}
      </AnimatedBackground>
    </ButtonGroup>
  );
}

export function PreviewAddressBar({ projectId }: { projectId: string }) {
  const view = useAtomValue(workbenchViewAtom);
  const path = useAtomValue(previewPathAtom);
  const openPath = useSetAtom(openPreviewPathAtom);
  const reload = useSetAtom(reloadPreviewAtom);
  const [draft, setDraft] = useState(path);
  const { state } = useProjectRuntime(projectId, view !== "files");
  const url = previewPageUrl(state.previewUrl, path);

  return (
    <form
      role="search"
      aria-label="Preview route"
      className="flex h-9 w-72 items-center gap-0.5 rounded-full bg-muted p-0.5 pl-3"
      onSubmit={(event) => {
        event.preventDefault();
        openPath(draft);
      }}
    >
      <input
        value={draft}
        aria-label="Preview path"
        spellCheck={false}
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none"
        onChange={(event) => setDraft(event.target.value)}
      />
      <Separator orientation="vertical" className="my-auto h-4" />
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="rounded-full hover:bg-background"
        aria-label="Reload preview"
        disabled={!url}
        onClick={() => reload()}
      >
        <RefreshCcwIcon />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        className="rounded-full hover:bg-background"
        disabled={!url}
        nativeButton={false}
        render={
          <a
            href={url ?? undefined}
            aria-label="Open preview in new tab"
            target="_blank"
            rel="noopener noreferrer"
          />
        }
      >
        <ExternalLinkIcon />
      </Button>
    </form>
  );
}
