"use client"

import { cn } from "@/lib/utils"
import { BrainIcon, ChevronDownIcon } from "lucide-react"
import { createContext, useContext, useMemo, useState } from "react"
import { Markdown } from "./markdown";

type ReasoningContextType = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

const ReasoningContext = createContext<ReasoningContextType | undefined>(
  undefined
)

function useReasoningContext() {
  const context = useContext(ReasoningContext)
  if (!context) {
    throw new Error(
      "useReasoningContext must be used within a Reasoning provider"
    )
  }
  return context
}

export type ReasoningProps = {
  children: React.ReactNode
  className?: string
  isStreaming?: boolean
}
function Reasoning({
  children,
  className,
  isStreaming,
}: ReasoningProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false)
  const defaultOpen = isStreaming || isOpen;
  const contextValue = useMemo(
    () => ({ isOpen: defaultOpen, onOpenChange: setIsOpen }),
    [defaultOpen],
  )

  return (
    <ReasoningContext.Provider value={contextValue}>
      <div
        data-state={isStreaming ? "streaming" : "static"}
        data-open={defaultOpen}
        className={cn("group/reasoning", className)}
      >
        {children}
      </div>
    </ReasoningContext.Provider>
  )
}

export type ReasoningTriggerProps = {
  children: React.ReactNode
  className?: string
} & React.HTMLAttributes<HTMLButtonElement>

function ReasoningTrigger({
  children,
  className,
  ...props
}: ReasoningTriggerProps) {
  const { isOpen, onOpenChange } = useReasoningContext()

  return (
    <button
      type="button"
      className={cn("flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground", className)}
      onClick={() => onOpenChange(!isOpen)}
      {...props}
    >
      <BrainIcon className="size-4" />
      <span className="group-data-[state=streaming]/reasoning:shimmer">
        {children}
      </span>
      <ChevronDownIcon
        className={cn(
          "size-4 transition-transform",
          isOpen ? "rotate-180" : "rotate-0"
        )}
      />
    </button>
  )
}

export type ReasoningContentProps = {
  children: string;
  className?: string;
  contentClassName?: string
} & React.HTMLAttributes<HTMLDivElement>

function ReasoningContent({
  children,
  className,
  contentClassName,
  ...props
}: ReasoningContentProps) {
  return (
    <div
      className={cn(
        "overflow-y-auto transition-[height] flex group-data-[state=streaming]/reasoning:flex-col-reverse h-0 group-data-open/reasoning:h-30 duration-150 ease-out max-h-30 scrollbar-thin scrollbar-gutter-stable group-data-[state=static]/reasoning:scroll-fade-y",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "text-muted-foreground prose prose-sm",
          contentClassName
        )}
      >
        <Markdown mode="static">
          {children}
        </Markdown>
      </div>
    </div>
  )
}

export { Reasoning, ReasoningTrigger, ReasoningContent }
