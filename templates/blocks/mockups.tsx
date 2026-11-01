import { useId, type ReactNode } from "react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { surfaceClass, type Surface } from "@/components/blocks/section"

type Tone = 1 | 2 | 3 | 4 | 5

const TONE_BG: Record<Tone, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
}

const TONE_TEXT: Record<Tone, string> = {
  1: "text-chart-1",
  2: "text-chart-2",
  3: "text-chart-3",
  4: "text-chart-4",
  5: "text-chart-5",
}

/**
 * Rounded backdrop that frames a product visual. Children are centered; use
 * align="bottom" to let a device bleed off the bottom edge.
 */
export function Stage({
  children,
  surface,
  pattern = "none",
  align = "center",
  className,
}: {
  children: ReactNode
  surface?: Surface
  pattern?: "none" | "dots" | "grid" | "rings"
  align?: "center" | "bottom"
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative isolate flex min-h-80 w-full justify-center overflow-hidden rounded-card px-6 md:px-10",
        surface ? surfaceClass(surface) : "bg-ink/5 ring-1 ring-inset ring-ink/10",
        align === "bottom" ? "items-end pt-12 md:pt-16" : "items-center py-12 md:py-16",
        className,
      )}
    >
      {pattern === "dots" ? (
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(var(--ink)_1px,transparent_1px)] bg-size-[22px_22px] opacity-[0.12] mask-[radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      ) : null}
      {pattern === "grid" ? (
        <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--ink)_1px,transparent_1px),linear-gradient(to_bottom,var(--ink)_1px,transparent_1px)] bg-size-[48px_48px] opacity-[0.07] mask-[radial-gradient(ellipse_at_center,black_35%,transparent_80%)]" />
      ) : null}
      {pattern === "rings" ? (
        <div aria-hidden className="absolute inset-0 -z-10 flex items-center justify-center">
          {[1, 2, 3, 4].map((ring) => (
            <div key={ring} className="absolute rounded-full ring-1 ring-ink/10" style={{ width: `${ring * 22}%`, aspectRatio: "1" }} />
          ))}
        </div>
      ) : null}
      {children}
    </div>
  )
}

/** Modern phone frame; children render on the screen (use the Screen* primitives). */
export function PhoneFrame({
  children,
  surface,
  className,
  tilt = "none",
}: {
  children: ReactNode
  surface?: Surface
  className?: string
  tilt?: "none" | "left" | "right"
}) {
  return (
    <div
      className={cn(
        "relative w-[min(300px,78vw)] shrink-0 rounded-[3rem] bg-foreground p-2.5 shadow-2xl ring-1 ring-ink/15",
        tilt === "left" && "-rotate-6",
        tilt === "right" && "rotate-6",
        className,
      )}
    >
      <div className={cn("relative flex aspect-[9/19.2] flex-col overflow-hidden rounded-[2.4rem]", surface ? surfaceClass(surface) : "surface-base")}>
        <div aria-hidden className="absolute top-2.5 left-1/2 z-10 h-6.5 w-24 -translate-x-1/2 rounded-full bg-foreground" />
        <div className="flex flex-1 flex-col gap-3 px-4 pt-12 pb-5">{children}</div>
      </div>
    </div>
  )
}

/** Desktop browser/app window. Pass sidebar items to get an app shell. */
export function BrowserFrame({
  children,
  url,
  surface,
  className,
}: {
  children: ReactNode
  url?: string
  surface?: Surface
  className?: string
}) {
  return (
    <div className={cn("w-full overflow-hidden rounded-2xl bg-canvas shadow-2xl ring-1 ring-ink/10", surface && surfaceClass(surface), className)}>
      <div className="flex h-11 items-center gap-2 border-b border-ink/10 bg-ink/5 px-4">
        <span className="size-3 rounded-full bg-ink/15" />
        <span className="size-3 rounded-full bg-ink/15" />
        <span className="size-3 rounded-full bg-ink/15" />
        {url ? (
          <span className="mx-auto rounded-md bg-ink/5 px-10 py-1 font-mono text-xs text-ink-muted ring-1 ring-ink/10">{url}</span>
        ) : null}
      </div>
      <div className="relative">{children}</div>
    </div>
  )
}

export function AppShell({
  nav,
  active = 0,
  title,
  actions,
  children,
}: {
  nav: Array<{ label: string; icon?: ReactNode }>
  active?: number
  title: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="grid min-h-[420px] grid-cols-[200px_1fr] text-ink max-md:grid-cols-1">
      <aside className="flex flex-col gap-1 border-r border-ink/10 bg-ink/[0.03] p-3 max-md:hidden">
        {nav.map((item, index) => (
          <div
            key={item.label}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm [&_svg]:size-4",
              index === active ? "bg-canvas font-medium text-ink shadow-sm ring-1 ring-ink/10" : "text-ink-muted",
            )}
          >
            {item.icon}
            {item.label}
          </div>
        ))}
      </aside>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <p className="font-display text-lg font-semibold">{title}</p>
          {actions}
        </div>
        {children}
      </div>
    </div>
  )
}

export function ScreenHeader({ title, subtitle, trailing }: { title: string; subtitle?: string; trailing?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        {subtitle ? <p className="text-[11px] text-ink-muted">{subtitle}</p> : null}
        <p className="text-sm font-semibold text-ink">{title}</p>
      </div>
      {trailing}
    </div>
  )
}

export function Delta({ value, trend = "up" }: { value: string; trend?: "up" | "down" }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", trend === "up" ? "text-positive" : "text-negative")}>
      {trend === "up" ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {value}
    </span>
  )
}

export function MetricCard({
  label,
  value,
  delta,
  trend = "up",
  children,
  className,
}: {
  label: string
  value: string
  delta?: string
  trend?: "up" | "down"
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("rounded-2xl bg-ink/5 p-4 ring-1 ring-inset ring-ink/10", className)}>
      <p className="text-xs text-ink-muted">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="font-display text-2xl font-semibold tracking-tight text-ink tabular-nums">{value}</p>
        {delta ? <Delta value={delta} trend={trend} /> : null}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  )
}

/** Colored circle with a short symbol or initials, for tokens, apps, or people. */
export function TokenIcon({ symbol, tone = 1, className }: { symbol: string; tone?: Tone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tracking-tight text-on-chart ring-2 ring-canvas",
        TONE_BG[tone],
        className,
      )}
    >
      {symbol.slice(0, 3).toUpperCase()}
    </span>
  )
}

export function ListRow({
  leading,
  title,
  subtitle,
  value,
  meta,
  trend,
}: {
  leading?: ReactNode
  title: string
  subtitle?: string
  value?: string
  meta?: string
  trend?: "up" | "down"
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-1 py-2">
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{title}</p>
        {subtitle ? <p className="truncate text-xs text-ink-muted">{subtitle}</p> : null}
      </div>
      {value || meta ? (
        <div className="text-right">
          {value ? <p className="text-sm font-medium text-ink tabular-nums">{value}</p> : null}
          {meta ? (
            trend ? <Delta value={meta} trend={trend} /> : <p className="text-xs text-ink-muted">{meta}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function smoothPath(points: Array<[number, number]>) {
  return points.reduce((path, [x, y], index) => {
    if (index === 0) return `M ${x} ${y}`
    const [px, py] = points[index - 1]
    const cx = (px + x) / 2
    return `${path} C ${cx} ${py}, ${cx} ${y}, ${x} ${y}`
  }, "")
}

/** Smooth area chart drawn from raw values. */
export function AreaChart({
  values,
  tone = 1,
  height = 120,
  className,
}: {
  values: number[]
  tone?: Tone
  height?: number
  className?: string
}) {
  const id = useId()
  const width = 320
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const points = values.map((value, index): [number, number] => [
    (index / Math.max(values.length - 1, 1)) * width,
    8 + (1 - (value - min) / range) * (height - 16),
  ])
  const line = smoothPath(points)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={cn("h-28 w-full", TONE_TEXT[tone], className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L ${width} ${height} L 0 ${height} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2.25" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  )
}

export function BarChart({
  values,
  highlight,
  tone = 1,
  className,
}: {
  values: number[]
  highlight?: number
  tone?: Tone
  className?: string
}) {
  const max = Math.max(...values) || 1
  return (
    <div className={cn("flex h-28 items-end gap-1.5", className)} aria-hidden>
      {values.map((value, index) => (
        <div
          key={index}
          className={cn("flex-1 rounded-t-md", index === highlight ? TONE_BG[tone] : "bg-ink/12")}
          style={{ height: `${Math.max((value / max) * 100, 4)}%` }}
        />
      ))}
    </div>
  )
}

export function Progress({ label, value, tone = 1 }: { label?: string; value: number; tone?: Tone }) {
  return (
    <div className="space-y-1.5">
      {label ? (
        <div className="flex justify-between text-xs">
          <span className="text-ink-muted">{label}</span>
          <span className="font-medium text-ink tabular-nums">{value}%</span>
        </div>
      ) : null}
      <div className="h-2 overflow-hidden rounded-full bg-ink/10">
        <div className={cn("h-full rounded-full", TONE_BG[tone])} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

export function Toggle({ label, on = true }: { label: string; on?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm text-ink">
      <span>{label}</span>
      <span className={cn("flex h-6 w-10 items-center rounded-full p-0.5 transition-colors", on ? "bg-action" : "bg-ink/15")}>
        <span className={cn("size-5 rounded-full bg-canvas shadow-sm transition-transform", on && "translate-x-4")} />
      </span>
    </div>
  )
}

export function MockButton({
  children,
  variant = "primary",
  className,
}: {
  children: ReactNode
  variant?: "primary" | "secondary"
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex h-10 items-center justify-center gap-2 rounded-button px-4 text-sm font-medium [&_svg]:size-4",
        variant === "primary" ? "bg-action text-action-foreground" : "bg-ink/5 text-ink ring-1 ring-inset ring-ink/10",
        className,
      )}
    >
      {children}
    </div>
  )
}

export function Tag({ children, tone, className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium [&_svg]:size-3",
        tone ? cn(TONE_TEXT[tone], "bg-current/10") : "bg-ink/8 text-ink",
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Avatar({ name, tone = 1, className }: { name: string; tone?: Tone; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase()
  return (
    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-on-chart ring-2 ring-canvas", TONE_BG[tone], className)}>
      {initials}
    </span>
  )
}

export function AvatarStack({ names }: { names: string[] }) {
  return (
    <div className="flex -space-x-2">
      {names.map((name, index) => (
        <Avatar key={name} name={name} tone={((index % 5) + 1) as Tone} />
      ))}
    </div>
  )
}

export function ChatBubble({ from = "them", children }: { from?: "me" | "them"; children: ReactNode }) {
  return (
    <div className={cn("flex", from === "me" ? "justify-end" : "justify-start")}>
      <p
        className={cn(
          "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
          from === "me" ? "rounded-br-md bg-action text-action-foreground" : "rounded-bl-md bg-ink/8 text-ink",
        )}
      >
        {children}
      </p>
    </div>
  )
}

export function CodeBlock({ lines, title }: { lines: string[]; title?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-foreground text-background shadow-xl ring-1 ring-ink/10">
      {title ? <div className="border-b border-background/10 px-4 py-2.5 font-mono text-xs opacity-60">{title}</div> : null}
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
        {lines.map((line, index) => (
          <div key={index} className="flex gap-4">
            <span className="w-4 shrink-0 text-right opacity-35 select-none">{index + 1}</span>
            <span className="whitespace-pre">{line}</span>
          </div>
        ))}
      </pre>
    </div>
  )
}

/** Small card that floats over a visual for depth. Position it with className (e.g. "-left-8 top-16"). */
export function Floating({
  children,
  className,
  animate = true,
}: {
  children: ReactNode
  className?: string
  animate?: boolean
}) {
  return (
    <div
      className={cn(
        "absolute z-20 rounded-2xl bg-canvas/95 p-3.5 text-ink shadow-2xl ring-1 ring-ink/10 backdrop-blur-md max-md:hidden",
        animate && "animate-float",
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Tinted rounded square holding an icon, for feature cards and lists. */
export function IconTile({ icon, className }: { icon: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex size-11 items-center justify-center rounded-xl bg-highlight/15 text-highlight [&_svg]:size-5", className)}>
      {icon}
    </span>
  )
}

/** Icons arranged on concentric rings around a center element, for integrations or networks. */
export function Orbit({ center, items, className }: { center: ReactNode; items: ReactNode[]; className?: string }) {
  const inner = items.slice(0, Math.ceil(items.length / 2))
  const outer = items.slice(inner.length)
  const place = (list: ReactNode[], radius: number, offset: number) =>
    list.map((item, index) => {
      const angle = (index / list.length) * Math.PI * 2 + offset
      return (
        <div
          key={`${radius}-${index}`}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${50 + Math.cos(angle) * radius}%`, top: `${50 + Math.sin(angle) * radius}%` }}
        >
          {item}
        </div>
      )
    })
  return (
    <div className={cn("relative mx-auto aspect-square w-full max-w-md", className)}>
      <div className="absolute inset-[18%] rounded-full ring-1 ring-ink/10" />
      <div className="absolute inset-0 rounded-full ring-1 ring-ink/10" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">{center}</div>
      {place(inner, 32, 0.4)}
      {place(outer, 50, 0)}
    </div>
  )
}

/** A generated photo that fills its container (give the container a size or aspect ratio). */
export function Photo({ src, alt = "", className }: { src: string; alt?: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={cn("size-full rounded-card object-cover", className)} />
  )
}
