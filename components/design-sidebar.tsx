"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { PenToolIcon } from "lucide-react";

import type { ElementSelection } from "@/ai/message/metadata";
import { DesignPanel } from "@/components/design-panel";
import type { DesignElement } from "@/lib/design-mode/styles";
import { ELEMENT_SELECTED_EVENT } from "@/lib/design-mode/selection";

type PreviewMessage =
  | { source: "bloom-preview"; type: "ready" | "deselect" }
  | { source: "bloom-preview"; type: "state"; active: boolean }
  | { source: "bloom-preview"; type: "select"; selection: ElementSelection; design?: DesignElement; additive?: boolean }
  | { source: "bloom-preview"; type: "text"; value: string };

type SelectedElement = {
  selection: ElementSelection;
  design: DesignElement;
  frameKey: string;
  version: number;
  revisionId: string | null;
};

export function DesignSidebar({
  projectId,
  revisionId,
  previewUrl,
  frameKey,
  frameRef,
  onOpenChat,
}: {
  projectId: string;
  revisionId: string | null;
  previewUrl: string | null;
  frameKey: string;
  frameRef: RefObject<HTMLIFrameElement | null>;
  onOpenChat: () => void;
}) {
  const [element, setElement] = useState<SelectedElement | null>(null);
  const [inlineText, setInlineText] = useState<string | null>(null);
  const selected = useRef<{ selector: string; url: string } | null>(null);
  const savedRevision = useRef<string | null>(null);

  const origin = previewUrl ? new URL(previewUrl).origin : null;
  const post = useCallback((message: Record<string, unknown>) => {
    if (!origin) return;
    frameRef.current?.contentWindow?.postMessage({ source: "bloom", ...message }, origin);
  }, [frameRef, origin]);

  const clearSelection = useCallback(() => {
    selected.current = null;
    savedRevision.current = null;
    setInlineText(null);
    setElement(null);
  }, []);

  useEffect(() => {
    if (!previewUrl || !origin) return;
    const url = previewUrl;

    function onMessage(event: MessageEvent<PreviewMessage | null>) {
      if (event.origin !== origin || event.source !== frameRef.current?.contentWindow) return;
      const data = event.data;
      if (data?.source !== "bloom-preview") return;

      if (data.type === "ready" || (data.type === "state" && !data.active)) {
        post({ type: "inspect", active: true, persist: true });
        if (selected.current?.url === url) {
          post({ type: "select-selector", selector: selected.current.selector });
        }
      } else if (data.type === "select" && data.selection) {
        if (data.additive || !data.design) {
          window.dispatchEvent(new CustomEvent(ELEMENT_SELECTED_EVENT, { detail: data.selection }));
          return;
        }

        const { selection, design } = data;
        const matchesSelection = selected.current?.url === url &&
          selected.current.selector === selection.selector;
        const currentRevision = (matchesSelection ? savedRevision.current : null) ?? revisionId;
        selected.current = { selector: selection.selector, url };
        savedRevision.current = null;
        setInlineText(null);
        setElement((current) => ({
          selection,
          design,
          frameKey,
          version: (current?.version ?? 0) + 1,
          revisionId: currentRevision,
        }));
      } else if (data.type === "deselect") {
        clearSelection();
      } else if (data.type === "text" && typeof data.value === "string") {
        setInlineText(data.value);
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [clearSelection, frameKey, frameRef, origin, post, previewUrl, revisionId]);

  useEffect(() => {
    if (!origin) return;
    const frame = frameRef.current?.contentWindow;
    frame?.postMessage({ source: "bloom", type: "inspect", active: true, persist: true }, origin);
    return () => {
      frame?.postMessage({ source: "bloom", type: "inspect", active: false }, origin);
    };
  }, [frameRef, origin]);

  function commitSelection(selector: string, nextRevision: string) {
    if (selected.current?.selector !== selector || selected.current.url !== previewUrl) return;
    savedRevision.current = nextRevision;
    post({ type: "commit" });
  }

  return (
    <aside className="flex size-full flex-col" aria-label="Design controls">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-1.5">
        <h2 className="text-xs font-medium">Element inspector</h2>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {previewUrl && element?.frameKey === frameKey ? (
          <DesignPanel
            key={element.version}
            projectId={projectId}
            revisionId={element.revisionId}
            selection={element.selection}
            design={element.design}
            inlineText={inlineText}
            post={post}
            onClose={() => {
              post({ type: "deselect" });
              clearSelection();
            }}
            onCommit={commitSelection}
            onOpenChat={onOpenChat}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-xs text-muted-foreground">
            <PenToolIcon className="size-5" />
            <p>
              {!previewUrl
                ? "Start the preview to edit elements."
                : "Click any element in the preview to edit its layout, type, color and spacing."}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
