"use client";

import { useMemo } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

export type ProjectListItem = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type ProjectListPage = {
  projects: ProjectListItem[];
  nextCursor: string | null;
};

export type ProjectSort = "updatedAt" | "createdAt" | "title";

export const projectsQueryKey = ["projects"] as const;

async function readResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    throw Object.assign(
      new Error((await response.json())?.error || fallbackMessage),
      { status: response.status },
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function useProjects({ query, sort }: { query: string; sort: ProjectSort }) {
  const projectsQuery = useInfiniteQuery({
    queryKey: [...projectsQueryKey, query, sort],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam: cursor, signal }) => {
      const searchParams = new URLSearchParams({ sort });

      if (cursor) searchParams.set("cursor", cursor);
      if (query) searchParams.set("query", query);

      const response = await fetch(`/api/projects?${searchParams}`, { signal });
      return readResponse<ProjectListPage>(response, "Failed to load projects");
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    placeholderData: keepPreviousData,
    retry: (failureCount, error) =>
      failureCount < 2 &&
      (!("status" in error) ||
        typeof error.status !== "number" ||
        error.status >= 500),
  });

  const projects = useMemo(() => projectsQuery.data?.pages.flatMap(d => d.projects) ?? [], [projectsQuery.data]);

  return {
    ...projectsQuery,
    projects,
    isFetchingNextPage: projectsQuery.isFetchingNextPage || projectsQuery.isPlaceholderData,
  };
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables?: { title?: string }) => {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(variables?.title ? { title: variables.title } : {}),
      });
      return readResponse<ProjectListItem>(response, "Failed to create project");
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectsQueryKey }),
  });
}

export function useRenameProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, title }: { id: string, title: string }) => {
      const response = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      return readResponse(response, "Failed to rename project");
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectsQueryKey }),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await readResponse(response, "Failed to delete project");
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectsQueryKey }),
  });
}
