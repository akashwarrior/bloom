"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ElementSelection } from "@/ai/message/metadata";
import { cn } from "@/lib/utils";
import { ProjectFiles } from "@/components/project-files";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useProjectRuntime } from "@/hooks/use-project-runtime";
import { DesignPanel } from "@/components/design-panel";
import type { DesignElement } from "@/lib/design-mode/styles";
import { ELEMENT_SELECTED_EVENT } from "@/lib/element-selection";
import {
  Code2Icon,
  Globe2Icon,
  TerminalIcon,
  Trash2Icon,
  XIcon,
  AlertTriangleIcon,
  ExternalLinkIcon,
  Loader2Icon,
  MousePointerClickIcon,
  PenToolIcon,
  RefreshCcwIcon,
} from "lucide-react";

type WorkbenchTab = "preview" | "files";
type InspectMode = "off" | "pick" | "design";

const statusLabels = {
  idle: "Waiting to start",
  preparing: "Preparing isolated runtime",
  installing: "Installing dependencies",
  starting: "Starting development server",
  ready: "Preview ready",
  error: "Preview failed",
} as const;


export function ProjectWorkbench({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<WorkbenchTab>("preview");
  const [consoleOpen, setConsoleOpen] = useState(false);
  const { state, setState } = useProjectRuntime(projectId);

  // preview
  const [path, setPath] = useState("/");
  const [frameKey, setFrameKey] = useState(0);
  const url = state.previewUrl
    ? new URL(path || "/", state.previewUrl).toString()
    : null;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [inspectMode, setInspectMode] = useState<InspectMode>("off");
  const [designed, setDesigned] = useState<{ selection: ElementSelection; design: DesignElement; version: number } | null>(null);
  const [inlineText, setInlineText] = useState<string | null>(null);
  const modeRef = useRef(inspectMode);
  const selectorRef = useRef<string | null>(null);

  const previewOrigin = url ? new URL(url).origin : null;

  const post = useCallback((message: Record<string, unknown>) => {
    if (!previewOrigin) return;
    frameRef.current?.contentWindow?.postMessage({ source: "bloom", ...message }, previewOrigin);
  }, [previewOrigin]);

  useEffect(() => {
    modeRef.current = inspectMode;
    post({ type: "inspect", active: inspectMode !== "off", persist: inspectMode === "design" });
  }, [inspectMode, post]);

  function changeMode(next: InspectMode) {
    setInspectMode(next);
    setDesigned(null);
    selectorRef.current = null;
  }

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as {
        source?: string;
        type?: string;
        active?: boolean;
        additive?: boolean;
        value?: string;
        selection?: ElementSelection;
        design?: DesignElement;
      } | null;
      if (data?.source !== "bloom-preview") return;
      const mode = modeRef.current;
      if (data.type === "ready") {
        if (mode === "off") return;
        post({ type: "inspect", active: true, persist: mode === "design" });
        if (mode === "design" && selectorRef.current) post({ type: "select-selector", selector: selectorRef.current });
      } else if (data.type === "state" && !data.active) {
        setInspectMode("off");
        setDesigned(null);
        selectorRef.current = null;
      } else if (data.type === "select" && data.selection) {
        if (data.design && !data.additive) {
          const { selection, design } = data;
          selectorRef.current = selection.selector;
          setInlineText(null);
          setDesigned((current) => ({ selection, design, version: (current?.version ?? 0) + 1 }));
        } else {
          window.dispatchEvent(new CustomEvent(ELEMENT_SELECTED_EVENT, { detail: data.selection }));
        }
      } else if (data.type === "deselect") {
        selectorRef.current = null;
        setDesigned(null);
      } else if (data.type === "text" && typeof data.value === "string") {
        setInlineText(data.value);
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [post]);

  return (
    <section className="relative flex h-full flex-1 flex-col overflow-hidden border bg-muted/30 rounded-xl shadow">
      <nav className="flex h-11 shrink-0 items-center gap-1 border-b bg-background px-2">
        <Button
          type="button"
          size="sm"
          variant={tab === "preview" ? "secondary" : "ghost"}
          onClick={() => setTab("preview")}
        >
          <Globe2Icon />
          Preview
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "files" ? "secondary" : "ghost"}
          onClick={() => setTab("files")}
        >
          <Code2Icon />
          Files
        </Button>

        <div className={cn("flex items-center gap-0.5", tab !== "preview" && "hidden")}>
          <Button
            type="button"
            size="sm"
            variant={inspectMode === "pick" ? "secondary" : "ghost"}
            disabled={!url}
            aria-pressed={inspectMode === "pick"}
            title="Pick elements to mention in the chat (Shift-click for several, ↑ selects the parent, Esc cancels)"
            onClick={() => changeMode(inspectMode === "pick" ? "off" : "pick")}
          >
            <MousePointerClickIcon />
            Select
          </Button>
          <Button
            type="button"
            size="sm"
            variant={inspectMode === "design" ? "secondary" : "ghost"}
            disabled={!url}
            aria-pressed={inspectMode === "design"}
            title="Edit elements visually: click to select, double-click text to edit it, Esc to deselect"
            onClick={() => changeMode(inspectMode === "design" ? "off" : "design")}
          >
            <PenToolIcon />
            Design
          </Button>
        </div>

        <div className={cn(tab !== "preview" ? "hidden" : "flex flex-1 items-center gap-1 rounded-md border bg-muted/40 px-1 max-w-sm mx-auto")}>
          <input
            value={path}
            aria-label="Preview path"
            className="flex-1 bg-transparent font-mono text-xs outline-none px-2"
            onChange={(event) => setPath(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") setFrameKey((key) => key + 1);
            }}
          />
          <Separator orientation="vertical" />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={!url}
            onClick={() => setFrameKey((key) => key + 1)}
          >
            <RefreshCcwIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={!url}
            nativeButton={false}
            render={
              <a
                href={url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            <ExternalLinkIcon />
          </Button>
        </div>

        <Button
          type="button"
          size="icon-sm"
          variant={consoleOpen ? "secondary" : "ghost"}
          className="ml-auto"
          onClick={() => setConsoleOpen((open) => !open)}
          aria-label="Toggle runtime console"
        >
          <TerminalIcon />
        </Button>
      </nav>

      <div className="size-full">
        {tab === "preview" ? (
          <div className="flex size-full">
            <div className="relative min-w-0 flex-1">
              {url ? (
                <iframe
                  ref={frameRef}
                  key={`${url}-${frameKey}`}
                  src={url}
                  title="Project preview"
                  allow="cross-origin-isolated"
                  className="size-full border-0"
                />
              ) : (
                <div className="grid size-full place-items-center bg-muted/40">
                  <div className="max-w-sm px-6 text-center">
                    {state.status === "error" ? (
                      <AlertTriangleIcon className="mx-auto mb-4 size-8 text-destructive" />
                    ) : (
                      <Loader2Icon className="mx-auto mb-4 size-8 animate-spin text-bloom" />
                    )}
                    <p className="text-sm font-medium">
                      {statusLabels[state.status]}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {state.error ??
                        "The first start can take a moment while project dependencies are installed."}
                    </p>
                  </div>
                </div>
              )}
            </div>
            {inspectMode === "design" && designed ? (
              <DesignPanel
                key={`${designed.selection.selector}:${designed.version}`}
                projectId={projectId}
                selection={designed.selection}
                design={designed.design}
                inlineText={inlineText}
                post={post}
                onClose={() => post({ type: "deselect" })}
              />
            ) : inspectMode === "design" ? (
              <aside className="flex w-72 shrink-0 flex-col items-center justify-center gap-2 border-l bg-background px-6 text-center text-xs text-muted-foreground">
                <PenToolIcon className="size-5" />
                Click any element in the preview to edit its layout, type, color and spacing.
              </aside>
            ) : null}
          </div>
        ) : tab === "files" && (
          <ProjectFiles
            projectId={projectId}
          />
        )}
      </div>

      {consoleOpen ? (
        <div className="absolute inset-x-0 bottom-0 z-20 flex h-2/5 flex-col border-t bg-card shadow-2xl">
          <div className="flex h-9 shrink-0 items-center border-b px-3">
            <p className="text-xs font-medium">Runtime console</p>

            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => setState(prev => ({ ...prev, logs: [] }))}
                aria-label="Close runtime console"
              >
                <Trash2Icon />
              </Button>

              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => setConsoleOpen(false)}
                aria-label="Close runtime console"
              >
                <XIcon />
              </Button>
            </div>
          </div>

          <div className="size-full overflow-auto flex flex-col-reverse">
            <pre className="flex-1 whitespace-pre-wrap p-3 font-mono text-[11px] leading-5">
              {state.logs?.join("") || "Runtime output will appear here."}
            </pre>
          </div>
        </div>
      ) : null}
    </section>
  );
}
