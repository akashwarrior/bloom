"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState, type ReactNode } from "react";
import { readJsonResponse } from "@/lib/http";
import type { ActivityMarker, ChatPart } from "@/lib/project-chat/activity";

function duration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function ChatRunActivity({
  projectId,
  activity,
  liveParts,
  renderParts,
  outcome,
}: {
  projectId: string;
  activity: ActivityMarker["data"];
  liveParts?: ChatPart[];
  renderParts: (parts: ChatPart[]) => ReactNode;
  outcome?: "Stopped" | "Failed";
}) {
  const { runId, startedAt, finishedAt } = activity;
  const live = finishedAt === null;
  const [liveOpen, setLiveOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [now, setNow] = useState(Date.now);
  const detailsId = useId();
  const open = live ? liveOpen : historyOpen;

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live]);

  const history = useQuery({
    queryKey: ["chat-run-activity", projectId, runId],
    enabled: !live && historyOpen,
    staleTime: Infinity,
    queryFn: async ({ signal }) =>
      readJsonResponse<{ parts: ChatPart[] }>(
        await fetch(`/api/projects/${projectId}/chat/runs/${runId}/activity`, {
          signal,
        }),
        "Couldn’t load run activity",
      ),
  });
  const parts = live ? liveParts : history.data?.parts;
  const label = live
    ? "Working for"
    : outcome
      ? `${outcome} after`
      : "Worked for";

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        className="self-center rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() =>
          live ? setLiveOpen(!liveOpen) : setHistoryOpen(!historyOpen)
        }
      >
        {label} {duration((finishedAt ?? now) - startedAt)}
      </button>
      <div id={detailsId} hidden={!open}>
        {open &&
          (parts?.length ? (
            renderParts(parts)
          ) : (
            <div className="text-xs text-muted-foreground">
              {history.isError ? (
                <button type="button" onClick={() => void history.refetch()}>
                  Couldn’t load activity. Retry
                </button>
              ) : live ? null : history.isPending ? (
                "Loading activity…"
              ) : (
                "No saved tool calls."
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
