import type { QueryClient } from "@tanstack/react-query";

export function projectQueryKey(projectId: string, ...scope: string[]) {
  return ["project", projectId, ...scope];
}

export function refreshProject(client: QueryClient, projectId: string) {
  return client.invalidateQueries({
    queryKey: projectQueryKey(projectId),
    predicate: ({ queryKey }) => queryKey[2] !== "file",
  });
}
