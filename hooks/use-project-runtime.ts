"use client";

import { useEffect, useState } from "react";

import type { RuntimeState } from "@/lib/runtime/protocol";

const initialState: RuntimeState = {
  status: "preparing",
  previewUrl: null,
  revisionId: null,
  logs: [],
  diagnostics: [],
  error: null,
};

async function runtimeResponse(response: Response): Promise<RuntimeState> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "Failed to start runtime";
    throw new Error(message);
  }
  return body as RuntimeState;
}

export function useProjectRuntime(projectId: string) {
  const [state, setState] = useState<RuntimeState>(initialState);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const reload = () => {
      setState((current) => ({
        ...current,
        status: "preparing",
        error: null,
      }));
      setReloadKey((value) => value + 1);
    };
    window.addEventListener("bloom:revision-changed", reload);
    return () => window.removeEventListener("bloom:revision-changed", reload);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/projects/${projectId}/runtime/prepare`, {
      method: "POST",
      signal: controller.signal,
    })
      .then(runtimeResponse)
      .then(setState)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState((current) => ({
          ...current,
          status: "error",
          error:
            error instanceof Error
              ? error.message
              : "Failed to start runtime",
        }));
      });

    return () => {
      controller.abort();
    };
  }, [projectId, reloadKey]);

  return {
    state,
    setState,
  }
}
