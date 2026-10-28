"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { memo } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { motion, type Transition } from "motion/react";
import {
  EllipsisIcon,
  GlobeIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ProjectItemProps = {
  id: string;
  title: string;
} & (
    {
      isEmpty: true;
      isCreating: boolean;
      onCreate: () => void;
    }
    | {
      isEmpty: false;
      href: string;
      image: string | null;
      updatedAt: string;
      isPublic?: boolean;
      onRename: (id: string, title: string) => void;
      onRequestDelete: (id: string, title: string) => void;
    }
  );

const layoutTransition: Transition = {
  bounce: 0.2,
  type: "spring",
  duration: 0.5,
};

export const ProjectItem = memo(function ProjectItem(props: ProjectItemProps) {
  const { id, title, isEmpty } = props;

  const projectDetails = (
    <motion.div
      layout="position"
      transition={{ layout: layoutTransition }}
      className="space-y-1 text-start overflow-hidden px-0.5"
    >
      <p className="truncate text-sm font-semibold">{title}</p>
      {!isEmpty && props.updatedAt && (
        <p className="whitespace-nowrap text-xs text-muted-foreground">
          edited {formatDistanceToNowStrict(new Date(props.updatedAt), { addSuffix: true })}
        </p>
      )}
    </motion.div>
  );

  const projectThumbnail = (
    <motion.div
      layout="preserve-aspect"
      transition={{ layout: layoutTransition }}
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-[10px] group-data-[view=list]:h-14 group-data-[view=list]:aspect-16/10 group-data-[view=grid]:w-full group-data-[view=grid]:aspect-video",
        "border bg-background",
      )}
    >
      {isEmpty ? (
        <span className="grid size-10 place-items-center group-data-[view=list]:size-7">
          <PlusIcon className="size-5" />
        </span>
      ) : props.image ? (
        <Image
          src={props.image}
          alt=""
          fill
          sizes="(min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col gap-2 bg-muted p-5">
          <span className="h-7 w-full rounded-md border bg-background" />
          <div className="flex flex-1 gap-2">
            <span className="w-1/3 rounded-md border bg-background" />
            <div className="flex flex-1 flex-col justify-center gap-1.5 pl-1">
              <span className="h-1.5 w-3/4 rounded-full bg-muted-foreground/20" />
              <span className="h-1.5 w-1/2 rounded-full bg-muted-foreground/10" />
              <span className="mt-1 h-4 w-1/3 rounded bg-muted-foreground/15" />
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );

  return (
    <li className="group/card flex w-full transition-transform hover:-translate-y-0.75 group-data-[view=list]:items-center gap-2 group-data-[view=list]:gap-4 rounded-xl group-data-[view=list]:bg-background group-data-[view=list]:p-3 group-data-[view=grid]:flex-col">
      {isEmpty ? (
        <button
          type="button"
          onClick={props.onCreate}
          disabled={props.isCreating}
          className="flex w-full disabled:cursor-not-allowed disabled:opacity-60 group-data-[view=list]:items-center gap-2 group-data-[view=list]:gap-4 rounded-xl group-data-[view=list]:bg-background group-data-[view=grid]:flex-col"
        >
          {projectThumbnail}
          {projectDetails}
        </button>
      ) : (
        <>
          <Link href={props.href}>
            {projectThumbnail}
          </Link>

          <div className="flex flex-1 items-center justify-between gap-2 overflow-hidden">
            <Link href={props.href} className="overflow-hidden">
              {projectDetails}
            </Link>

            <div className="flex items-center gap-2">
              <Badge
                className={cn(
                  "w-6 sm:w-18.5 gap-1 rounded-md px-0 py-2.75 hidden group-data-[view=list]:flex",
                  props.isPublic ? "bg-muted text-muted-foreground" : "bg-bloom-soft text-bloom",
                )}
              >
                {props.isPublic ? <GlobeIcon /> : <LockIcon />}
                <span className="hidden sm:flex">{props.isPublic ? "Anyone" : "Private"}</span>
              </Badge>

              <DropdownMenu modal={false}>
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Actions for ${title}`}
                      className="opacity-0 transition-opacity duration-200 group-hover/card:opacity-100 aria-expanded:opacity-100 group-data-[view=list]:opacity-100"
                    />
                  }
                >
                  <EllipsisIcon />
                </DropdownMenuTrigger>

                <DropdownMenuContent className="w-44" side="bottom" align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      onClick={() => props.onRename(id, title)}
                      className="w-full justify-start gap-2 text-primary/80 hover:text-primary/80"
                    >
                      <PencilIcon />
                      Rename
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="w-full justify-start gap-2 text-primary/80 hover:text-primary/80"
                    >
                      <GlobeIcon />
                      Make Public
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => props.onRequestDelete(id, title)}
                      className="w-full justify-start"
                    >
                      <Trash2Icon />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </>
      )}
    </li>
  );
});
