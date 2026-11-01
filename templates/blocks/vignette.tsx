import type { CSSProperties, ReactNode } from "react"
import { ArrowUp, Asterisk, Check, ChevronDown, ChevronRight, PanelLeft } from "lucide-react"

import { cn } from "@/lib/utils"
import { hueColor, type Hue } from "@/components/blocks/art"

const MARKER_LINE: CSSProperties = {
  backgroundImage: "linear-gradient(to bottom, var(--highlight) 50%, transparent 0)",
  backgroundSize: "1px 6px",
}

function percent(value: number) {
  return `${Math.min(Math.max(value, 0), 1) * 100}%`
}

/**
 * Product UI card: a tinted shell holding an icon + title header and a crisp
 * inner panel. A string badge renders as a mono chip ("2 need you"); pass a node for anything else.
 */
export function VignetteCard({
  icon,
  title,
  subtitle,
  badge,
  children,
  footer,
  className,
}: {
  icon?: ReactNode
  title: string
  subtitle?: string
  badge?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex w-full max-w-md flex-col rounded-2xl bg-canvas text-left text-[13px] text-ink shadow-xl ring-1 shadow-ink/10 ring-ink/10", className)}>
      <div className="flex flex-1 flex-col rounded-[inherit] bg-ink/[0.035] p-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-2.5 pt-1.5 pb-3">
          {icon ? (
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-canvas text-highlight shadow-sm ring-1 ring-ink/10 [&_svg]:size-4">{icon}</span>
          ) : null}
          <div className="min-w-[8rem] flex-1">
            <p className="text-sm leading-snug font-medium text-balance">{title}</p>
            {subtitle ? <p className="leading-snug text-ink-muted">{subtitle}</p> : null}
          </div>
          {typeof badge === "string" ? (
            <span className="shrink-0 rounded-md bg-highlight/10 px-1.5 py-0.5 font-mono text-xs text-highlight">{badge}</span>
          ) : (
            badge
          )}
        </div>
        {children || footer ? (
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl bg-canvas shadow-sm ring-1 ring-ink/[0.07]">
            {children ? <div className="flex flex-1 flex-col gap-4 p-4">{children}</div> : null}
            {footer ? <div className="mt-auto flex items-center justify-end gap-2 border-t border-ink/10 px-4 py-3">{footer}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Row of labelled figures with hairline dividers; `emphasis` paints one value in the highlight color. */
export function StatRow({
  items,
  className,
}: {
  items: Array<{ label: string; value: string; note?: string; emphasis?: boolean }>
  className?: string
}) {
  return (
    <div className={cn("grid divide-x divide-ink/10", className)} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0 px-4 first:pl-0 last:pr-0">
          <p className="truncate text-[13px] text-ink-muted">{item.label}</p>
          <p className={cn("mt-1 truncate font-mono text-xl tracking-tight tabular-nums", item.emphasis ? "text-highlight" : "text-ink")}>{item.value}</p>
          {item.note ? <p className="mt-0.5 truncate text-xs text-ink-muted">{item.note}</p> : null}
        </div>
      ))}
    </div>
  )
}

/**
 * Timeline rows: label + mono sub, a bar spanning `span` (0-1) of the track filled to `progress`,
 * and a mono amount. `marker` (0-1) draws a dashed "today" line through every row.
 */
export function TimelineBar({
  rows,
  marker,
  markerLabel = "Today",
  className,
}: {
  rows: Array<{ label: string; sub?: string; progress: number; span?: [number, number]; amount?: string; pending?: boolean; selected?: boolean }>
  marker?: number
  markerLabel?: string
  className?: string
}) {
  const grid = "grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_auto] items-center gap-4 px-2"
  return (
    <div className={cn("text-[13px]", className)}>
      {marker === undefined ? null : (
        <div className={cn(grid, "pb-1")}>
          <span />
          <div className="relative h-5">
            <span className="absolute top-0 -translate-x-1/2 rounded-md bg-highlight px-1.5 py-1 font-mono text-[11px] leading-none whitespace-nowrap text-canvas" style={{ left: percent(marker) }}>
              {markerLabel}
            </span>
          </div>
          <span />
        </div>
      )}
      {rows.map((row) => {
        const [start, end] = row.span ?? [0, 1]
        return (
          <div key={row.label} className={cn(grid, "rounded-lg py-2.5", row.selected && "bg-highlight/[0.06]")}>
            <div className="min-w-0">
              <p className="truncate text-sm text-ink">{row.label}</p>
              {row.sub ? <p className="truncate font-mono text-[11px] text-ink-muted">{row.sub}</p> : null}
            </div>
            <div className="relative flex items-center self-stretch">
              {marker === undefined ? null : <span aria-hidden className="absolute -top-2.5 -bottom-2.5 w-px" style={{ left: percent(marker), ...MARKER_LINE }} />}
              <div
                className={cn("absolute h-2 rounded-full", row.pending ? "border border-dashed border-ink/30" : "bg-highlight/15")}
                style={{ left: percent(start), right: `calc(100% - ${percent(end)})` }}
              >
                {row.pending ? null : <div className="h-full rounded-full bg-highlight" style={{ width: percent(row.progress) }} />}
                <span className={cn("absolute top-1/2 left-full size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-canvas ring-2", row.pending ? "ring-ink/30" : "ring-highlight")} />
              </div>
            </div>
            <p className="text-right font-mono text-ink tabular-nums">{row.amount}</p>
          </div>
        )
      })}
    </div>
  )
}

const WAFFLE_SHADES = [1, 0.62, 0.4, 0.22, 0.12]

/** Waffle chart filled column by column; pass one count or several (each a lighter shade). Empty cells are dashed. */
export function Waffle({
  cells = 50,
  filled,
  cols = 10,
  tone = "highlight",
  className,
}: {
  cells?: number
  filled: number | number[]
  cols?: number
  tone?: Hue
  className?: string
}) {
  const shades = (typeof filled === "number" ? [filled] : filled).flatMap((count, segment) =>
    Array.from({ length: count }, () => WAFFLE_SHADES[Math.min(segment, WAFFLE_SHADES.length - 1)]),
  )
  return (
    <div
      aria-hidden
      className={cn("grid gap-1.5", className)}
      style={{ gridTemplateRows: `repeat(${Math.ceil(cells / cols)}, auto)`, gridAutoFlow: "column", gridAutoColumns: "minmax(0, 1fr)" }}
    >
      {Array.from({ length: cells }, (_, index) => {
        const shade = shades[index]
        return (
          <span
            key={index}
            className={cn("aspect-square rounded-[5px]", shade === undefined && "border border-dashed border-ink/20")}
            style={shade === undefined ? undefined : { backgroundColor: hueColor(tone), opacity: shade }}
          />
        )
      })}
    </div>
  )
}

/**
 * Raw numbers render as spark bars (bars inside `active` [from, to] stay colored, the rest go quiet).
 * Labelled values render as meter rows: label, mono note, and a thin bar.
 */
export function MiniBars({
  values,
  active,
  tone = "highlight",
  className,
}: {
  values: number[] | Array<{ label: string; value: number; note?: string }>
  active?: [number, number]
  tone?: Hue
  className?: string
}) {
  const color = hueColor(tone)
  const numbers = values.map((item) => (typeof item === "number" ? item : item.value))
  const max = Math.max(...numbers, 1)
  if (values.every((item) => typeof item === "number")) {
    return (
      <div aria-hidden className={cn("flex h-16 items-end gap-[3px]", className)}>
        {numbers.map((value, index) => {
          const on = !active || (index >= active[0] && index <= active[1])
          return (
            <span
              key={index}
              className={cn("flex-1 rounded-[2px]", !on && "bg-ink/12")}
              style={{ height: `${Math.max((value / max) * 100, 6)}%`, ...(on ? { backgroundColor: color } : {}) }}
            />
          )
        })}
      </div>
    )
  }
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {values.map((item, index) =>
        typeof item === "number" ? null : (
          <div key={item.label} className="space-y-2">
            <div className="flex items-baseline justify-between gap-4 text-[13px]">
              <span className="truncate text-ink">{item.label}</span>
              {item.note ? <span className={cn("shrink-0 font-mono tabular-nums", index === 0 ? "text-ink" : "text-ink-muted")}>{item.note}</span> : null}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink/8">
              <div className="h-full rounded-full" style={{ width: `${(item.value / max) * 100}%`, backgroundColor: color, opacity: index === 0 ? 1 : 0.45 }} />
            </div>
          </div>
        ),
      )}
    </div>
  )
}

/** Checkbox row: label, mono meta underneath, and a right-hand value (string renders mono, or pass a node such as a Tag). */
export function CheckRow({
  checked = false,
  label,
  meta,
  value,
  className,
}: {
  checked?: boolean
  label: string
  meta?: string
  value?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-3 py-1.5 text-[13px]", className)}>
      <span className={cn("grid size-[18px] shrink-0 place-items-center rounded-[5px]", checked ? "bg-highlight text-canvas" : "bg-canvas ring-1 ring-ink/20 ring-inset")}>
        {checked ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{label}</p>
        {meta ? <p className="truncate font-mono text-xs text-ink-muted tabular-nums">{meta}</p> : null}
      </div>
      {typeof value === "string" ? <span className="shrink-0 font-mono text-xs text-ink-muted tabular-nums">{value}</span> : value}
    </div>
  )
}

/** Detail rows (label left, value right) separated by hairlines. */
export function KeyValue({ rows, className }: { rows: Array<{ label: string; value: ReactNode }>; className?: string }) {
  return (
    <dl className={cn("divide-y divide-ink/10 text-[13px]", className)}>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 py-3">
          <dt className="text-ink/80">{row.label}</dt>
          <dd className="flex items-center gap-2 text-right font-medium text-ink tabular-nums [&_svg]:size-4">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Compact product-UI button (decorative). Solid uses the action color; ghost is a white hairline button. */
export function PillButton({
  children,
  variant = "solid",
  className,
}: {
  children: ReactNode
  variant?: "solid" | "ghost"
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium whitespace-nowrap shadow-sm ring-1 ring-ink/10 [&_svg]:size-3.5",
        variant === "solid" ? "bg-action text-action-foreground" : "bg-canvas text-ink",
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Tabs with optional counts: a segmented control, or underline tabs. */
export function SegmentTabs({
  items,
  active = 0,
  variant = "segment",
  className,
}: {
  items: Array<string | { label: string; count?: string | number }>
  active?: number
  variant?: "segment" | "underline"
  className?: string
}) {
  const tabs = items.map((item) => (typeof item === "string" ? { label: item, count: undefined } : item))
  if (variant === "underline") {
    return (
      <div className={cn("flex gap-6 border-b border-ink/10 text-sm", className)}>
        {tabs.map((tab, index) => (
          <span
            key={tab.label}
            className={cn("-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 whitespace-nowrap", index === active ? "border-highlight text-ink" : "border-transparent text-ink-muted")}
          >
            {tab.label}
            {tab.count === undefined ? null : <span className={cn("font-mono text-xs", index === active ? "text-highlight" : "text-ink-muted/70")}>{tab.count}</span>}
          </span>
        ))}
      </div>
    )
  }
  return (
    <div className={cn("inline-flex w-fit items-center gap-0.5 rounded-lg bg-ink/5 p-0.5 text-[13px]", className)}>
      {tabs.map((tab, index) => (
        <span
          key={tab.label}
          className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 whitespace-nowrap", index === active ? "bg-canvas text-ink shadow-sm ring-1 ring-ink/10" : "text-ink-muted")}
        >
          {tab.label}
          {tab.count === undefined ? null : <span className={cn("font-mono text-xs", index === active ? "text-highlight" : "text-ink-muted/70")}>{tab.count}</span>}
        </span>
      ))}
    </div>
  )
}

/** Assistant chat card: agent replies as soft text (inline Tags welcome), user turns as bubbles, a composer with tool chips. */
export function ChatPanel({
  title,
  messages,
  placeholder = "Ask anything…",
  thinking,
  tools,
  className,
}: {
  title?: string
  messages: Array<{ from: "user" | "agent"; content: ReactNode }>
  placeholder?: string
  thinking?: string
  tools?: string[]
  className?: string
}) {
  return (
    <div className={cn("flex w-full max-w-md flex-col overflow-hidden rounded-3xl bg-canvas text-left text-ink shadow-2xl ring-1 shadow-ink/15 ring-ink/10", className)}>
      {title ? (
        <div className="flex items-center gap-2.5 px-5 pt-4 text-sm font-medium">
          <PanelLeft className="size-4.5 text-ink-muted" />
          {title}
        </div>
      ) : null}
      <div className="flex flex-col gap-4 px-5 pt-6 pb-5 text-sm leading-relaxed">
        {messages.map((message, index) =>
          message.from === "user" ? (
            <p key={index} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-ink/5 px-3.5 py-2 text-ink">
              {message.content}
            </p>
          ) : (
            <div key={index} className="text-ink/70">
              {message.content}
            </div>
          ),
        )}
        {thinking ? (
          <p className="flex items-center gap-2.5 text-ink-muted">
            <Asterisk className="size-4 text-ink" />
            {thinking}
          </p>
        ) : null}
      </div>
      <div className="border-t border-ink/10 px-4 pt-4 pb-3">
        <p className="px-1 text-sm text-ink-muted/80">{placeholder}</p>
        <div className="mt-5 flex items-center gap-2">
          {tools?.map((tool) => (
            <span key={tool} className="inline-flex items-center gap-1 rounded-lg bg-ink/5 px-2.5 py-1.5 text-[13px] text-ink">
              {tool}
              <ChevronDown className="size-3.5 text-ink-muted" />
            </span>
          ))}
          <span className="ml-auto grid size-8 place-items-center rounded-full bg-ink/5 text-ink">
            <ArrowUp className="size-4" />
          </span>
        </div>
      </div>
    </div>
  )
}

/** Frosted list card: colored dot (or icon disc) + label + muted right value, with an optional "Next ›" footer row. */
export function ListPanel({
  items,
  footer,
  className,
}: {
  items: Array<{ label: string; value?: string; tone?: Hue; icon?: ReactNode }>
  footer?: { label: string; action?: string }
  className?: string
}) {
  return (
    <div className={cn("w-full max-w-md overflow-hidden rounded-2xl bg-canvas/85 text-left text-ink shadow-xl ring-1 shadow-ink/10 ring-ink/10 backdrop-blur-xl", className)}>
      <ul className="flex flex-col p-2">
        {items.map((item, index) => {
          const color = hueColor(item.tone ?? (((index % 5) + 1) as Hue))
          return (
            <li key={item.label} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm">
              {item.icon ? (
                <span className="grid size-7 shrink-0 place-items-center rounded-full text-on-chart [&_svg]:size-3.5" style={{ backgroundColor: color }}>
                  {item.icon}
                </span>
              ) : (
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              )}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.value ? <span className="shrink-0 text-ink-muted tabular-nums">{item.value}</span> : null}
            </li>
          )
        })}
      </ul>
      {footer ? (
        <div className="flex items-center justify-between gap-4 border-t border-ink/10 px-5 py-3.5 text-sm">
          <span>{footer.label}</span>
          {footer.action ? (
            <span className="inline-flex items-center gap-1 font-medium">
              {footer.action}
              <ChevronRight className="size-4" />
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
