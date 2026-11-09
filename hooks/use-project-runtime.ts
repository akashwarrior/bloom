"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { readJsonResponse } from "@/lib/http";
import { projectQueryKey } from "@/lib/projects/query";
import type { RuntimeState } from "@/lib/runtime/protocol";

const initialState: RuntimeState = {
  status: "starting",
  previewUrl: null,
  revisionId: null,
  logs: [],
  diagnostics: [],
  error: null,
};

export function useProjectRuntime(projectId: string, visible: boolean) {
  const client = useQueryClient();
  const queryKey = projectQueryKey(projectId, "runtime");
  const endpoint = `/api/projects/${projectId}/runtime/prepare`;
  const status = useQuery<RuntimeState>({
    queryKey,
    enabled: visible,
    placeholderData: (data, previousQuery) => previousQuery?.queryKey[1] === projectId ? data : undefined,
    refetchInterval: 3_000,
    refetchOnWindowFocus: true,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await fetch(endpoint, { signal, cache: "no-store" });
      return readJsonResponse<RuntimeState>(response, "Failed to check preview");
    },
  });
  const activation = useMutation({
    mutationFn: async () => {
      const response = await fetch(endpoint, { method: "POST" });
      return readJsonResponse<RuntimeState>(response, "Failed to start preview");
    },
    onSuccess: (state) => client.setQueryData(queryKey, state),
    onError: (error) => toast.error(error.message),
    onSettled: () => client.invalidateQueries({ queryKey }),
  });
  const state = status.isError
    ? { ...initialState, status: "error" as const, error: status.error.message }
    : status.data ?? initialState;
  return {
    state,
    activate: activation.mutate,
    activating: activation.isPending,
  };
}
