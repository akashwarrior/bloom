"use client";

import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCallback, useDeferredValue, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ProjectItem } from "@/components/project-item";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, FieldGroup } from "@/components/ui/field";
import { AnimatedBackground } from "@/components/ui/animated-background";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LayoutGridIcon,
  ListIcon,
  PlusIcon,
  Search,
} from "lucide-react";
import {
  type ProjectListItem,
  type ProjectSort,
  useCreateProject,
  useDeleteProject,
  useProjects,
  useRenameProject,
} from "@/hooks/use-projects";
import { useRouter } from "next/navigation";

const sortItems = [
  { label: "Last edited", value: "updatedAt" },
  { label: "Name (A-Z)", value: "title" },
  { label: "Date created", value: "createdAt" },
] as const;

type SortValue = ProjectSort;
type ProjectTarget = Pick<ProjectListItem, "id" | "title">;
type ProjectView = "grid" | "list";

const viewItems = [
  { label: "grid", icon: LayoutGridIcon },
  { label: "list", icon: ListIcon },
] as const;

type ProjectsControlsProps = {
  creating: boolean;
  search: string;
  sortBy: SortValue;
  onCreate: () => void;
  onSearchChange: (value: string) => void;
  onSortChange: (value: SortValue) => void;
  onViewChange: (value: ProjectView) => void;
};

function ProjectsControls({
  creating,
  search,
  sortBy,
  onCreate,
  onSearchChange,
  onSortChange,
  onViewChange,
}: ProjectsControlsProps) {
  return (
    <>
      <div className="flex w-full flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl font-medium tracking-[-0.045em]">Projects</h1>
      </div>

      <div className="flex w-full flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <InputGroup className="w-full py-4.5 sm:max-w-xs">
          <InputGroupInput
            placeholder="Search..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            aria-label="Search projects"
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>

        <div className="flex w-full justify-between gap-4 sm:w-fit">
          <Select
            modal={false}
            value={sortBy}
            defaultValue={sortItems[0].value}
            onValueChange={(value) => onSortChange(value as SortValue)}
          >
            <SelectTrigger className="py-4.5">
              <SelectValue>
                {sortItems.find((item) => item.value === sortBy)?.label ||
                  "Sort by"}
              </SelectValue>
            </SelectTrigger>

            <SelectContent
              align="end"
              sideOffset={8}
              alignItemWithTrigger={false}
              className="w-40"
            >
              <SelectGroup>
                {sortItems.map((item) => (
                  <SelectItem
                    key={item.value}
                    value={item.value}
                    className="aria-selected:text-primary aria-selected:font-semibold py-1.5 px-2"
                  >
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Button
            className="py-4.5"
            onClick={onCreate}
            disabled={creating}
          >
            {creating ? <Spinner /> : <PlusIcon />}
            New project
          </Button>
        </div>
      </div>

      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-4">
          <AnimatedBackground
            defaultValue="All projects"
            onValueChange={(value) => {
              if (value === "Recents") onSortChange("updatedAt");
            }}
            className="mt-auto mx-auto left-0 right-0 h-0.5 w-full bg-primary rounded-full"
          >
            {["All projects", "Recents"].map((tab) => (
              <button
                type="button"
                key={tab}
                data-id={tab}
                className="pb-1.75 text-sm font-semibold transition-colors text-muted-foreground data-checked:text-primary"
              >
                {tab}
              </button>
            ))}
          </AnimatedBackground>
        </div>

        <div className="relative flex gap-1 bg-muted rounded-lg items-center p-0.5">
          <AnimatedBackground
            defaultValue="grid"
            onValueChange={(value) => onViewChange(value as ProjectView)}
            className="h-full rounded-md bg-background shadow-xs"
          >
            {viewItems.map((tab) => (
              <Button
                key={tab.label}
                data-id={tab.label}
                size="icon"
                variant="ghost"
                className="transition-colors text-muted-foreground data-checked:text-primary"
              >
                <tab.icon />
              </Button>
            ))}
          </AnimatedBackground>
        </div>
      </div>
    </>
  );
}

type ProjectDialogsProps = {
  deletePending: boolean;
  deleteTarget: ProjectTarget | null;
  renamePending: boolean;
  renameTarget: ProjectTarget | null;
  renameTitle: string;
  onDelete: () => void;
  onDeleteTargetChange: (target: ProjectTarget | null) => void;
  onRename: (event: React.SubmitEvent<HTMLFormElement>) => void;
  onRenameTargetChange: (target: ProjectTarget | null) => void;
  onRenameTitleChange: (title: string) => void;
};

function ProjectDialogs({
  deletePending,
  deleteTarget,
  renamePending,
  renameTarget,
  renameTitle,
  onDelete,
  onDeleteTargetChange,
  onRename,
  onRenameTargetChange,
  onRenameTitleChange,
}: ProjectDialogsProps) {
  return (
    <>
      <Dialog
        open={Boolean(renameTarget)}
        onOpenChange={(open) => {
          if (!open && !renamePending) onRenameTargetChange(null);
        }}
      >
        <DialogContent>
          <form onSubmit={onRename} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Rename project</DialogTitle>
              <DialogDescription>
                Choose a clear name to help you find this project later.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <Label htmlFor="project-title">Project name</Label>
                <Input
                  id="project-title"
                  value={renameTitle}
                  onChange={(event) =>
                    onRenameTitleChange(event.target.value)
                  }
                  maxLength={120}
                  autoFocus
                  required
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <DialogClose
                render={
                  <Button variant="outline" disabled={renamePending} />
                }
              >
                Cancel
              </DialogClose>
              <Button
                type="submit"
                disabled={renamePending || !renameTitle.trim()}
              >
                {renamePending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deletePending) onDeleteTargetChange(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">
                &quot;{deleteTarget?.title}&quot;
              </span>{" "}
              will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending} variant="outline">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletePending}
              onClick={onDelete}
            >
              {deletePending ? "Deleting…" : "Continue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function ProjectsPage() {
  const router = useRouter();
  const [view, setView] = useState<ProjectView>("grid");
  const [sortBy, setSortBy] = useState<SortValue>("updatedAt");
  const [search, setSearch] = useState("");
  const [renameTarget, setRenameTarget] = useState<ProjectTarget | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ProjectTarget | null>(null);

  const deferredSearch = useDeferredValue(search.trim());
  const {
    projects,
    isLoading,
    isError,
    error,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useProjects({ query: deferredSearch, sort: sortBy });

  const createProject = useCreateProject();
  const renameProject = useRenameProject();
  const deleteProject = useDeleteProject();

  const handleCreate = useCallback(async () => {
    if (createProject.isPending) return;

    try {
      const project = await createProject.mutateAsync({});
      toast.success("Project created");
      router.push('/projects/' + project.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create project");
    }
  }, [createProject, router]);

  const openRenameDialog = useCallback((id: string, title: string) => {
    setRenameTarget({ id, title });
    setRenameTitle(title);
  }, []);

  const openDeleteDialog = useCallback((id: string, title: string) => {
    setDeleteTarget({ id, title });
  }, []);

  const handleRename = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!renameTarget || renameProject.isPending) return;

    const title = renameTitle.trim();
    if (!title || title === renameTarget.title) {
      setRenameTarget(null);
      return;
    }

    try {
      await renameProject.mutateAsync({ id: renameTarget.id, title });
      toast.success("Project renamed");
      setRenameTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename project");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleteProject.isPending) return;

    try {
      await deleteProject.mutateAsync({ id: deleteTarget.id });
      toast.success("Project deleted");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete project");
    }
  };

  return (
    <div className="min-h-svh w-full space-y-8">
      <ProjectsControls
        creating={createProject.isPending}
        search={search}
        sortBy={sortBy}
        onCreate={handleCreate}
        onSearchChange={setSearch}
        onSortChange={setSortBy}
        onViewChange={setView}
      />

      <AnimatePresence initial={false}>
        <ul
          data-view={view}
          className={cn(
            "group w-full overflow-clip py-2",
            view === "grid"
              ? "grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3"
              : "flex flex-col gap-3",
          )}
        >
          <ProjectItem
            id="new-project"
            isEmpty
            title="New Project"
            isCreating={createProject.isPending}
            onCreate={handleCreate}
          />

          {isLoading ?
            Array.from({ length: 5 }).map((_, i) => (
              <li
                key={`skeleton-${i}`}
                aria-hidden="true"
                className={cn(
                  view === "grid" ? "flex flex-col gap-2" : "flex items-center gap-4",
                )}
              >
                <Skeleton
                  className={cn(
                    view === "grid"
                      ? "w-full aspect-video rounded-lg"
                      : "h-14 aspect-16/10 rounded-lg",
                  )}
                />
                <div className="w-full space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </li>
            ))
            : projects.map(project => (
              <ProjectItem
                id={project.id}
                key={project.id}
                image={null}
                isEmpty={false}
                title={project.title}
                updatedAt={project.updatedAt}
                href={`/projects/${project.id}`}
                onRename={openRenameDialog}
                onRequestDelete={openDeleteDialog}
              />
            ))
          }
        </ul>
      </AnimatePresence>

      {isError ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Failed to load projects"}
          </p>
          <Button variant="secondary" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : !isLoading && projects.length === 0 && (
        <div className="rounded-[14px] border py-10 text-center text-sm text-muted-foreground">
          {deferredSearch
            ? `No projects match “${deferredSearch}”.`
            : "Create your first project to get started."}
        </div>
      )}

      {!isError && hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? <Spinner /> : null}
            Load more
          </Button>
        </div>
      )}

      <ProjectDialogs
        deletePending={deleteProject.isPending}
        deleteTarget={deleteTarget}
        renamePending={renameProject.isPending}
        renameTarget={renameTarget}
        renameTitle={renameTitle}
        onDelete={handleDelete}
        onDeleteTargetChange={setDeleteTarget}
        onRename={handleRename}
        onRenameTargetChange={setRenameTarget}
        onRenameTitleChange={setRenameTitle}
      />
    </div>
  );
}
