import { Fragment, type CSSProperties, type ReactNode } from "react"

import { cn } from "@/lib/utils"

/** A design-token color: chart-1..5 by number, or a contextual surface token. */
export type Hue = 1 | 2 | 3 | 4 | 5 | "highlight" | "action" | "ink" | "canvas"

/** The CSS value of a Hue, for style props (gradients, borders, dots). */
export function hueColor(hue: Hue) {
  return typeof hue === "number" ? `var(--chart-${hue})` : `var(--${hue})`
}

/** Textures sit behind content; their parent must be `relative isolate` (ArtPanel, DitherField, Stage, Section). */
const TEXTURE = "pointer-events-none absolute inset-0 -z-10"

const CORNERS = ["top-0 left-0", "top-0 left-full", "top-full left-0", "top-full left-full"]

const NOISE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`

type Fade = "radial" | "top" | "bottom" | "left" | "right" | "none"

const FADE: Record<Fade, string | undefined> = {
  radial: "radial-gradient(ellipse at center, black 15%, transparent 72%)",
  top: "linear-gradient(to bottom, black, transparent 80%)",
  bottom: "linear-gradient(to top, black, transparent 80%)",
  left: "linear-gradient(to right, black, transparent 80%)",
  right: "linear-gradient(to left, black, transparent 80%)",
  none: undefined,
}

function mask(image: string | undefined): CSSProperties {
  return image ? { maskImage: image, WebkitMaskImage: image } : {}
}

function dashed(color: string, direction: "to right" | "to bottom", dash: number): CSSProperties {
  return {
    backgroundImage: `linear-gradient(${direction}, ${color} 50%, transparent 0)`,
    backgroundSize: direction === "to right" ? `${dash}px 1px` : `1px ${dash}px`,
  }
}

function dashedEdges(color: string, dash: number): CSSProperties {
  const across = `linear-gradient(to right, ${color} 50%, transparent 0)`
  const down = `linear-gradient(to bottom, ${color} 50%, transparent 0)`
  return {
    backgroundImage: `${across}, ${across}, ${down}, ${down}`,
    backgroundSize: `${dash}px 1px, ${dash}px 1px, 1px ${dash}px, 1px ${dash}px`,
    backgroundPosition: "top left, bottom left, top left, top right",
    backgroundRepeat: "repeat-x, repeat-x, repeat-y, repeat-y",
  }
}

/** Film-grain noise over whatever is behind it. */
export function Grain({ opacity = 0.3, className }: { opacity?: number; className?: string }) {
  return <div aria-hidden className={cn(TEXTURE, "mix-blend-overlay", className)} style={{ backgroundImage: NOISE, opacity }} />
}

/** Halftone dot screen. `fade` names where the dots are densest before they dissolve. */
export function Halftone({
  color = "ink",
  dot = 1,
  gap = 8,
  fade = "radial",
  opacity = 0.35,
  className,
}: {
  color?: Hue
  dot?: number
  gap?: number
  fade?: Fade
  opacity?: number
  className?: string
}) {
  return (
    <div
      aria-hidden
      className={cn(TEXTURE, className)}
      style={{
        backgroundImage: `radial-gradient(circle, ${hueColor(color)} ${dot}px, transparent ${dot + 0.5}px)`,
        backgroundSize: `${gap}px ${gap}px`,
        opacity,
        ...mask(FADE[fade]),
      }}
    />
  )
}

/** Diagonal hairline hatching, with optional dashed guide lines at percentage positions. */
export function Hatch({
  color = "ink",
  angle = 135,
  gap = 9,
  opacity = 0.3,
  columns,
  rows,
  className,
}: {
  color?: Hue
  angle?: number
  gap?: number
  opacity?: number
  columns?: number[]
  rows?: number[]
  className?: string
}) {
  const value = hueColor(color)
  const guideOpacity = Math.min(opacity * 2, 1)
  return (
    <div aria-hidden className={cn(TEXTURE, className)}>
      <div className="absolute inset-0" style={{ backgroundImage: `repeating-linear-gradient(${angle}deg, ${value} 0 1px, transparent 1px ${gap}px)`, opacity }} />
      {columns?.map((x) => (
        <div key={`x${x}`} className="absolute inset-y-0 w-px" style={{ left: `${x}%`, opacity: guideOpacity, ...dashed(value, "to bottom", 8) }} />
      ))}
      {rows?.map((y) => (
        <div key={`y${y}`} className="absolute inset-x-0 h-px" style={{ top: `${y}%`, opacity: guideOpacity, ...dashed(value, "to right", 8) }} />
      ))}
    </div>
  )
}

type Placement = "diagonal" | "corner" | "center" | "fill"

const DITHER_LAYOUT: Record<Placement, Array<[x: number, y: number, w: number, h: number]>> = {
  diagonal: [[20, 88, 38, 30], [48, 58, 40, 30], [76, 30, 40, 30], [98, 6, 34, 26]],
  corner: [[100, 100, 60, 62], [78, 82, 38, 34], [100, 52, 30, 34], [62, 100, 34, 28]],
  center: [[50, 50, 46, 42], [38, 60, 30, 26], [62, 40, 30, 26], [50, 50, 24, 22]],
  fill: [[0, 0, 75, 75], [100, 0, 75, 75], [100, 100, 75, 75], [0, 100, 75, 75], [50, 50, 55, 50]],
}

/**
 * Dithered color field: soft gradient blobs printed through a halftone screen.
 * No image needed. Children are centered on top.
 */
export function DitherField({
  colors = [1, 2, 3],
  placement = "diagonal",
  dot = 1.3,
  gap = 4,
  children,
  className,
}: {
  colors?: Hue[]
  placement?: Placement
  dot?: number
  gap?: number
  children?: ReactNode
  className?: string
}) {
  const field = DITHER_LAYOUT[placement]
    .map(([x, y, w, h], index) => `radial-gradient(ellipse ${w}% ${h}% at ${x}% ${y}%, ${hueColor(colors[index % colors.length] ?? 1)}, transparent)`)
    .join(", ")
  const screen = `radial-gradient(circle, black ${dot}px, transparent ${dot + 0.4}px)`
  return (
    <div className={cn("relative isolate flex min-h-80 w-full flex-col items-center justify-center gap-4 overflow-clip p-6 sm:p-10 md:p-16", className)}>
      <div aria-hidden className={cn(TEXTURE, "opacity-40 blur-2xl")} style={{ backgroundImage: field }} />
      <div
        aria-hidden
        className={TEXTURE}
        style={{ backgroundImage: field, ...mask(screen), maskSize: `${gap}px ${gap}px`, WebkitMaskSize: `${gap}px ${gap}px` }}
      />
      {children}
    </div>
  )
}

/**
 * Art-directed panel: a photo or painting fills it edge to edge, an optional
 * texture sits on the art, and children (usually one crisp UI card) float centered on top.
 */
export function ArtPanel({
  src,
  alt = "",
  children,
  rounded = true,
  overlay = "grain",
  focus,
  aspect,
  className,
}: {
  src: string
  alt?: string
  children?: ReactNode
  rounded?: boolean
  overlay?: "none" | "grain" | "halftone" | "hatch" | "scrim"
  focus?: string
  aspect?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative isolate flex w-full flex-col items-center justify-center gap-4 overflow-clip px-5 py-16 sm:p-10 md:p-16",
        rounded && "rounded-card",
        !aspect && "min-h-[32rem]",
        className,
      )}
      style={aspect ? { aspectRatio: aspect } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="absolute inset-0 -z-20 size-full object-cover" style={focus ? { objectPosition: focus } : undefined} />
      {overlay === "grain" ? <Grain opacity={0.35} /> : null}
      {overlay === "halftone" ? <Halftone color="canvas" fade="none" gap={6} opacity={0.3} /> : null}
      {overlay === "hatch" ? <Hatch color="canvas" opacity={0.4} /> : null}
      {overlay === "scrim" ? <div aria-hidden className={cn(TEXTURE, "bg-linear-to-t from-foreground/55 via-foreground/10 to-transparent")} /> : null}
      {children}
    </div>
  )
}

/** Monospace diagram box: dashed edges, "+" corners, and a centered [ LABEL ] cut into the top edge. */
export function DashedFrame({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative px-6 py-10 font-mono text-[13px] text-ink sm:px-12 sm:py-12", className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 text-ink/25" style={dashedEdges("currentColor", 14)} />
      {CORNERS.map((corner) => (
        <span key={corner} aria-hidden className={cn("absolute -translate-x-1/2 -translate-y-1/2 leading-none text-ink/40", corner)}>
          +
        </span>
      ))}
      {label ? (
        <p className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-canvas px-3 text-sm tracking-[0.08em] whitespace-nowrap text-highlight uppercase">
          [ {label} ]
        </p>
      ) : null}
      {children}
    </div>
  )
}

/** Two-column monospace table for a DashedFrame: optional header and a dashed rule. */
export function MonoTable({
  rows,
  head,
  className,
}: {
  rows: Array<[ReactNode, ReactNode]>
  head?: [string, string]
  className?: string
}) {
  return (
    <div className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-x-10 gap-y-2 font-mono text-[13px] leading-relaxed text-ink/85", className)}>
      {head ? (
        <>
          <p className="text-ink-muted/80">{head[0]}</p>
          <p className="text-ink-muted/80">{head[1]}</p>
          <div aria-hidden className="col-span-2 my-1.5 h-px text-ink/20" style={dashed("currentColor", "to right", 12)} />
        </>
      ) : null}
      {rows.map(([left, right], index) => (
        <Fragment key={index}>
          <p>{left}</p>
          <p>{right}</p>
        </Fragment>
      ))}
    </div>
  )
}

/** Viewfinder-style L marks on the four corners of its child. */
export function CornerBrackets({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      {children}
      <span aria-hidden className="pointer-events-none absolute -top-1 -left-1 size-3.5 border-t-[1.5px] border-l-[1.5px] border-ink/70" />
      <span aria-hidden className="pointer-events-none absolute -top-1 -right-1 size-3.5 border-t-[1.5px] border-r-[1.5px] border-ink/70" />
      <span aria-hidden className="pointer-events-none absolute -bottom-1 -left-1 size-3.5 border-b-[1.5px] border-l-[1.5px] border-ink/70" />
      <span aria-hidden className="pointer-events-none absolute -right-1 -bottom-1 size-3.5 border-r-[1.5px] border-b-[1.5px] border-ink/70" />
    </div>
  )
}

/** Grid of square (or round) cells; `filled` returns on/off or a 0-1 intensity per cell. */
export function DotMatrix({
  rows,
  cols,
  filled,
  tone = "highlight",
  empty = "dim",
  shape = "square",
  cell = 10,
  rowLabels,
  className,
}: {
  rows: number
  cols: number
  filled: ((row: number, col: number) => boolean | number) | number[][]
  tone?: Hue
  empty?: "dim" | "outline"
  shape?: "square" | "circle"
  cell?: number
  rowLabels?: string[]
  className?: string
}) {
  const gap = Math.max(2, Math.round(cell * 0.4))
  const color = hueColor(tone)
  return (
    <div className={cn("flex max-w-full gap-3 overflow-hidden font-mono text-[11px] text-ink-muted", className)}>
      {rowLabels ? (
        <div className="grid shrink-0" style={{ gridTemplateRows: `repeat(${rows}, ${cell}px)`, rowGap: gap, fontSize: Math.min(Math.max(cell, 8), 11) }}>
          {rowLabels.map((label, index) => (
            <span key={index} className="flex items-center leading-none">
              {label}
            </span>
          ))}
        </div>
      ) : null}
      <div className="grid shrink-0" style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gridAutoRows: `${cell}px`, gap }}>
        {Array.from({ length: rows * cols }, (_, index) => {
          const row = Math.floor(index / cols)
          const col = index % cols
          const raw = typeof filled === "function" ? filled(row, col) : (filled[row]?.[col] ?? 0)
          const level = typeof raw === "boolean" ? Number(raw) : Math.min(Math.max(raw, 0), 1)
          return (
            <span
              key={index}
              className={cn(
                shape === "circle" ? "rounded-full" : "rounded-[2px]",
                level === 0 && (empty === "outline" ? "ring-1 ring-ink/25 ring-inset" : "bg-ink/10"),
              )}
              style={level > 0 ? { backgroundColor: color, opacity: 0.3 + level * 0.7 } : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}

/** Design-editor selection: dashed outline with square (or dot) handles on the corners. */
export function SelectionHandles({
  children,
  tone = "highlight",
  handles = "square",
  label,
  className,
}: {
  children: ReactNode
  tone?: Hue
  handles?: "square" | "dot"
  label?: string
  className?: string
}) {
  const color = hueColor(tone)
  return (
    <div className={cn("relative inline-flex h-fit w-fit", className)}>
      {children}
      <div aria-hidden className="pointer-events-none absolute -inset-2" style={dashedEdges(color, 8)}>
        {CORNERS.map((corner) => (
          <span
            key={corner}
            className={cn("absolute size-2 -translate-x-1/2 -translate-y-1/2", handles === "dot" && "rounded-full", corner)}
            style={handles === "dot" ? { backgroundColor: color } : { backgroundColor: "var(--canvas)", border: `1px solid ${color}` }}
          />
        ))}
      </div>
      {label ? (
        <span className="absolute -top-3 left-[-0.5rem] -translate-y-full rounded-sm px-1.5 py-0.5 font-mono text-[10px] leading-none whitespace-nowrap text-canvas" style={{ backgroundColor: color }}>
          {label}
        </span>
      ) : null}
    </div>
  )
}

/** Dashed line with a dot on each end. Size and place it with className. */
export function Connector({
  orientation = "horizontal",
  tone = "ink",
  className,
}: {
  orientation?: "horizontal" | "vertical"
  tone?: Hue
  className?: string
}) {
  const color = hueColor(tone)
  const horizontal = orientation === "horizontal"
  const dot = "absolute size-2 rounded-full"
  return (
    <div aria-hidden className={cn("relative shrink-0", horizontal ? "h-px w-full" : "h-full w-px", className)} style={dashed(color, horizontal ? "to right" : "to bottom", 8)}>
      <span className={cn(dot, horizontal ? "top-1/2 left-0 -translate-x-1/2 -translate-y-1/2" : "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2")} style={{ backgroundColor: color }} />
      <span className={cn(dot, horizontal ? "top-1/2 right-0 translate-x-1/2 -translate-y-1/2" : "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2")} style={{ backgroundColor: color }} />
    </div>
  )
}

/** Soft blurred sphere with a light band, for product or tier "planets". Size it with a w-* class. */
export function Orb({ tone = 1, blur = 14, className }: { tone?: Hue; blur?: number; className?: string }) {
  const color = hueColor(tone)
  return (
    <div
      aria-hidden
      className={cn("aspect-square w-40 shrink-0 rounded-full", className)}
      style={{
        backgroundImage: [
          `linear-gradient(155deg, transparent 38%, color-mix(in oklab, ${color} 35%, var(--canvas)) 52%, transparent 66%)`,
          `radial-gradient(circle at 34% 30%, color-mix(in oklab, ${color} 45%, var(--canvas)), ${color} 52%, color-mix(in oklab, ${color} 72%, var(--ink)))`,
        ].join(", "),
        filter: `blur(${blur}px)`,
      }}
    />
  )
}

/** Tiny caption columns for a poster footer; always laid out on a four-column grid. */
export function Captions({ items, className }: { items: string[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-x-8 gap-y-4 text-xs leading-snug text-ink/80 sm:grid-cols-4", className)}>
      {items.slice(0, 4).map((item) => (
        <p key={item} className="max-w-[24ch]">
          {item}
        </p>
      ))}
    </div>
  )
}
