"use client";

import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Markdown } from "./markdown";
import {
  ChevronRightIcon,
  FileCode2Icon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  Loader2Icon,
} from "lucide-react";


type FileMetadata = {
  path: string;
  size: number;
  mediaType: string;
};

type TreeNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children: TreeNode[];
};

function buildTree(files: FileMetadata[]) {
  const root: TreeNode = {
    name: "",
    path: "",
    type: "folder",
    children: [],
  };

  for (const file of files) {
    const parts = file.path.split("/");
    let parent = root;
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join("/");
      let node = parent.children.find((child) => child.name === part);
      if (!node) {
        node = {
          name: part,
          path,
          type: index === parts.length - 1 ? "file" : "folder",
          children: [],
        };
        parent.children.push(node);
      }
      parent = node;
    });
  }

  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node) => sort(node.children));
  };
  sort(root.children);
  return root.children;
}

function languageForPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  return (
    {
      ts: "typescript",
      tsx: "tsx",
      js: "javascript",
      jsx: "jsx",
      json: "json",
      css: "css",
      html: "html",
      md: "markdown",
      mjs: "javascript",
      yaml: "yaml",
      yml: "yaml",
    }[extension ?? ""] ?? "text"
  );
}

function fencedCode(path: string, content: string) {
  const longestFence = Math.max(
    3,
    ...Array.from(content.matchAll(/`+/g), (match) => match[0].length + 1),
  );
  const fence = "`".repeat(longestFence);
  return `${fence}${languageForPath(path)}\n${content}\n${fence}`;
}

type FileTreeProps = {
  nodes: TreeNode[];
  depth?: number;
  expanded: Set<string>;
  selectedPath: string | null;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
};

function FileTree({
  nodes,
  depth = 0,
  expanded,
  selectedPath,
  onToggle,
  onSelect,
}: FileTreeProps) {
  return nodes.map((node) => {
    const open = expanded.has(node.path);
    return (
      <div key={node.path}>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-1.5 py-1.5 pr-2 text-left text-xs hover:bg-muted",
            selectedPath === node.path && "bg-bloom-soft text-bloom",
          )}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() =>
            node.type === "folder" ? onToggle(node.path) : onSelect(node.path)
          }
        >
          {node.type === "folder" ? (
            <>
              <ChevronRightIcon
                className={cn("size-3.5 transition-transform", open && "rotate-90")}
              />
              {open ? (
                <FolderOpenIcon className="size-4 text-bloom" />
              ) : (
                <FolderIcon className="size-4 text-bloom" />
              )}
            </>
          ) : (
            <>
              <span className="w-3.5" />
              <FileIcon className="size-3.5 text-muted-foreground" />
            </>
          )}
          <span className="truncate">{node.name}</span>
        </button>

        {node.type === "folder" && open ? (
          <FileTree
            nodes={node.children}
            depth={depth + 1}
            expanded={expanded}
            selectedPath={selectedPath}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ) : null}
      </div>
    );
  });
}

export function ProjectFiles({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(() => new Set<string>());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loadedFile, setLoadedFile] = useState<{
    path: string;
    revisionId: string | null;
    content: string;
  } | null>(null);
  const [loadingTree, setLoadingTree] = useState(true);

  const loadTree = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/files`);
      if (!response.ok) {
        return;
      }
      const result = (await response.json()) as {
        revisionId: string | null;
        files: FileMetadata[];
      };
      setFiles(result.files);
      setRevisionId(result.revisionId);
      setSelectedPath((current) =>
        current && result.files.some((file) => file.path === current)
          ? current
          : null,
      );
    } finally {
      setLoadingTree(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadTree();
    const reload = () => void loadTree();
    window.addEventListener("bloom:revision-changed", reload);
    return () => window.removeEventListener("bloom:revision-changed", reload);
  }, [loadTree]);

  useEffect(() => {
    if (!selectedPath) return;

    const controller = new AbortController();
    const params = new URLSearchParams({ path: selectedPath });
    if (revisionId) params.set("revision", revisionId);
    void fetch(`/api/projects/${projectId}/files?${params}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load file");
        return response.json() as Promise<{ content: string }>;
      })
      .then((file) =>
        setLoadedFile({ path: selectedPath, revisionId, content: file.content }),
      )
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLoadedFile({
            path: selectedPath,
            revisionId,
            content: "Unable to load this file.",
          });
        }
      });

    return () => controller.abort();
  }, [projectId, revisionId, selectedPath]);

  const tree = useMemo(() => buildTree(files), [files]);
  const hasLoadedSelection =
    loadedFile?.path === selectedPath && loadedFile.revisionId === revisionId;
  const content = hasLoadedSelection ? loadedFile.content : "";
  const loadingFile = Boolean(selectedPath && revisionId && !hasLoadedSelection);

  return (
    <div className="flex size-full min-h-0 overflow-hidden">
      <aside className="w-56 shrink-0 overflow-y-auto border-r bg-background/70 py-2">
        {loadingTree ? (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <Loader2Icon className="size-3.5 animate-spin" />
            Loading files
          </div>
        ) : (
          <FileTree
            nodes={tree}
            expanded={expanded}
            selectedPath={selectedPath}
            onToggle={(path) =>
              setExpanded((current) => {
                const next = new Set(current);
                if (next.has(path)) next.delete(path);
                else next.add(path);
                return next;
              })
            }
            onSelect={setSelectedPath}
          />
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-background">
        {selectedPath ? (
          <>
            <div className="flex h-10 shrink-0 items-center border-b px-4 font-mono text-xs text-muted-foreground">
              {selectedPath}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {loadingFile ? (
                <Loader2Icon className="mx-auto mt-10 size-5 animate-spin text-muted-foreground" />
              ) : selectedPath.endsWith(".md") ? (
                <Markdown>
                  {content}
                </Markdown>
              ) : (
                <Markdown>
                  {fencedCode(selectedPath, content)}
                </Markdown>
              )}
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center text-center text-muted-foreground">
            <div>
              <FileCode2Icon className="mx-auto mb-3 size-9 opacity-50" />
              <p className="text-sm font-medium">Select a file to view it</p>
              <p className="mt-1 text-xs">{files.length} project files</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
