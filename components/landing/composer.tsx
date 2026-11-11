"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { saveLandingDraft } from "@/lib/prompt-draft";
import { cn } from "@/lib/utils";

const examples = [
  { label: "Web apps", prompt: "A recipe app with a searchable collection and detail pages..." },
  { label: "Websites", prompt: "A portfolio site with a project gallery and an about page..." },
  { label: "Dashboards", prompt: "A dashboard with charts and filters for my monthly expenses..." },
  { label: "Internal tools", prompt: "An inventory tracker with a searchable product table..." },
];

/** The landing prompt box. The prompt travels with the visitor through sign-up into their first project. */
export function Composer({ id, buildHref, className }: { id: string; buildHref: string; className?: string }) {
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState(0);
  const router = useRouter();

  return (
    <form
      className={cn(
        "rounded-[7px] bg-card p-4 text-left text-foreground shadow-[0_1px_0_rgba(0,0,0,.04),0_18px_40px_-28px_rgba(0,0,0,.35)] focus-within:outline-2 focus-within:outline-offset-[3px] focus-within:outline-ring max-md:p-[14px]",
        className,
      )}
      onSubmit={(event) => {
        event.preventDefault();
        saveLandingDraft(prompt.trim());
        router.push(buildHref);
      }}
    >
      <label htmlFor={id} className="sr-only">
        Describe what you want to build
      </label>
      <Textarea
        id={id}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder={examples[category].prompt}
        maxLength={8000}
        rows={2}
        className="h-[76px] min-h-[76px] resize-none rounded-none border-0 px-2 py-1.5 text-base shadow-none focus-visible:ring-0 focus-visible:shadow-none focus-visible:outline-none md:text-base"
      />
      <div className="mt-1 flex h-10 items-center justify-between gap-3">
        <span className="pl-2 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase max-sm:hidden">
          Enter to build
        </span>
        <div className="ml-auto flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" className="gap-1 px-1.5 font-normal" />}>
              {examples[category].label} <ChevronDown className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                {examples.map((example, index) => (
                  <DropdownMenuItem key={example.label} onClick={() => setCategory(index)}>
                    {example.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="submit"
            size="icon"
            className="size-10 rounded-[6px] border-0 bg-primary text-[15px] text-primary-foreground hover:bg-bloom-deep"
            aria-label="Build this app"
          >
            <ArrowUpRight className="size-5" />
          </Button>
        </div>
      </div>
    </form>
  );
}
