"use client"

import * as React from "react"
import { IconPlus } from "@tabler/icons-react"
import { cn } from "cn"

import type { DataPart } from "@/ai/message/data-part"
import { Button } from "@/components/ui/button"
import { NumberFlow } from "@/components/ui/number-flow"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { contextMeter } from "@/lib/context-meter"

import { usePromptInput } from "./prompt-input"

function PromptInputAddButton({ label = "Add photos and files" }: {
  label?: string
}) {
  const context = usePromptInput("PromptInputAddButton")

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={label}
            disabled={context.disabled}
            onClick={context.openFileDialog}
          />
        }
      >
        <IconPlus />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function formatTokens(tokens: number) {
  if (tokens < 1000) return String(tokens)
  if (tokens < 1_000_000) {
    const value = tokens / 1000
    return `${value < 100 ? value.toFixed(1).replace(/\.0$/, "") : Math.round(value)}k`
  }
  return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
}

type ContextUsage = DataPart["context-usage"]

const tokenKinds = [
  { kind: "input", label: "Input", className: "bg-chart-1" },
  { kind: "cached", label: "Cached input", className: "bg-chart-2" },
  { kind: "output", label: "Output", className: "bg-chart-4" },
  { kind: "reasoning", label: "Reasoning", className: "bg-chart-5" },
  { kind: "other", label: "Other reported tokens", className: "bg-chart-3" },
] as const

function toPercent(value: number) {
  return `${Math.max(0, Math.min(100, value * 100))}%`
}

type ContextSegment = {
  key: string
  share: number
  className: string
}

function ContextBar({ segments }: { segments: ContextSegment[] }) {
  const placed = segments.reduce<(ContextSegment & { start: number })[]>(
    (list, segment) => {
      const last = list.at(-1)
      return [
        ...list,
        { ...segment, start: last ? last.start + last.share : 0 },
      ]
    },
    []
  )
  const end = placed.reduce((total, segment) => total + segment.share, 0)

  return (
    <div
      aria-hidden="true"
      data-slot="prompt-input-context-bar"
      className="relative h-1.5 w-full overflow-hidden rounded-full"
    >
      {placed.map((segment) => (
        <span
          key={segment.key}
          data-kind={segment.key}
          ref={(element) => {
            element?.style.setProperty("--start", toPercent(segment.start))
            element?.style.setProperty(
              "--share",
              `calc(${toPercent(segment.share)} - 2px)`
            )
          }}
          className={cn(
            "absolute inset-y-0 start-(--start) w-(--share) transition-all duration-300 ease-out-cubic motion-reduce:transition-none motion-safe:starting:start-0 motion-safe:starting:w-0 forced-colors:bg-highlight",
            segment.className
          )}
        />
      ))}
      <span
        ref={(element) => element?.style.setProperty("--start", toPercent(end))}
        className="absolute inset-y-0 start-(--start) end-0 bg-muted transition-all duration-300 ease-out-cubic motion-reduce:transition-none motion-safe:starting:start-0 forced-colors:border"
      />
    </div>
  )
}

function PromptInputContextUsage({ usage }: { usage?: ContextUsage }) {
  const popupRef = React.useRef<HTMLDivElement>(null)
  const { used, limit, share, counts } = contextMeter(usage)
  const percent = Math.round(share * 100)
  const circumference = 2 * Math.PI * 7
  const tone = share >= 0.95 ? "text-destructive" : share >= 0.8 ? "text-warning" : "text-foreground/70"
  const fill = share >= 0.95 ? "bg-destructive" : share >= 0.8 ? "bg-warning" : "bg-chart-1"
  const rows = counts ? tokenKinds
    .filter(({ kind }) => kind === "input" || kind === "output" || counts[kind] > 0)
    .map(item => ({ ...item, tokens: counts[item.kind] })) : []
  const segments = used && counts
    ? rows.filter(row => row.tokens > 0).map(row => ({ key: row.kind, share: row.tokens / used * share, className: row.className }))
    : [{ key: "used", share, className: fill }]

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={300}
        render={<Button type="button" size="icon-xs" variant="ghost" aria-label={used !== undefined ? `${percent}% of context used` : "Context usage"} />}
      >
        <svg viewBox="0 0 18 18" aria-hidden="true" className={cn("size-4 -rotate-90", tone)}>
          <circle cx="9" cy="9" r="7" fill="none" strokeWidth="2" className="stroke-foreground/15" />
          {share >= 0.01 && (
            <circle
              cx="9" cy="9" r="7" fill="none" strokeWidth="2"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - share)}
              className="stroke-current transition-all duration-300 ease-out-cubic motion-reduce:transition-none"
            />
          )}
        </svg>
      </PopoverTrigger>
      <PopoverContent ref={popupRef} initialFocus={popupRef} side="top" align="end" sideOffset={8} className="w-80">
        <div data-slot="prompt-input-context" className="flex flex-col gap-2 p-0.5 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className={cn("min-w-0 truncate", usage?.model ? "font-medium" : "text-muted-foreground")}>
              {usage?.model ?? "Context window"}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground" title={`Last reported model step. Bloom compacts context at ${limit.toLocaleString()} tokens.`}>
              {used !== undefined ? formatTokens(used) : "—"} / {formatTokens(limit)}
            </span>
          </div>
          <ContextBar segments={segments} />
          {used !== undefined ? (
            <div className="flex items-baseline justify-between gap-3 text-xs tabular-nums text-muted-foreground">
              <NumberFlow value={percent} suffix="% used" />
              <span>{formatTokens(Math.max(0, limit - used))} left</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Usage appears when the model reports token counts.</p>
          )}
          {rows.length > 0 && (
            <table data-slot="prompt-input-context-breakdown" className="mt-1 w-full border-separate border-spacing-0 tabular-nums">
              <caption className="sr-only">Token breakdown for the last model step</caption>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.kind} data-kind={row.kind}>
                    <th scope="row" className="py-0.5 text-start font-normal">
                      <span className="flex min-w-0 items-center gap-2">
                        <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full forced-colors:bg-canvas-text", row.className)} />
                        <span className="truncate">{row.label}</span>
                      </span>
                    </th>
                    <td className="py-0.5 ps-3 text-end text-muted-foreground">{row.tokens.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div data-slot="prompt-input-context-cost" className="flex items-baseline justify-between gap-3 border-t pt-2">
            <span className="text-muted-foreground">Total cost</span>
            <span className="font-medium tabular-nums">Not reported</span>
          </div>
          {share >= 0.8 && (
            <p className="border-t pt-2.5 text-xs text-muted-foreground">
              Bloom automatically summarizes earlier messages at {formatTokens(limit)} tokens.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function PromptInputMeter({ showAt = 0.8 }: { showAt?: number }) {
  const context = usePromptInput("PromptInputMeter")
  const limit = context.maxLength
  const used = context.text.length
  const ratio = limit ? used / limit : 0
  const level = ratio > 1 ? 2 : ratio >= showAt ? 1 : 0
  const previous = React.useRef(level)
  const { announce } = context

  React.useEffect(() => {
    if (!limit) return
    if (level > previous.current) {
      announce(
        level === 2
          ? `Over the ${limit.toLocaleString()} character limit`
          : `${(limit - used).toLocaleString()} characters left`
      )
    }
    previous.current = level
  }, [announce, level, limit, used])

  if (!limit || level === 0) return null
  const left = limit - used

  return (
    <span
      role="img"
      aria-label={
        left >= 0
          ? `${left.toLocaleString()} characters left`
          : `${(-left).toLocaleString()} characters over the limit`
      }
      className={cn(
        "px-1 text-xs tabular-nums motion-safe:animate-in motion-safe:animation-duration-150 motion-safe:fade-in-0",
        ratio > 1 ? "text-destructive" : "text-muted-foreground"
      )}
    >
      {left.toLocaleString()}
    </span>
  )
}

function PromptInputMeta({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="prompt-input-meta"
      className={cn("flex min-h-8 items-center justify-end gap-1 px-1", className)}
      {...props}
    />
  )
}

export {
  PromptInputAddButton,
  PromptInputContextUsage,
  PromptInputMeta,
  PromptInputMeter,
}
