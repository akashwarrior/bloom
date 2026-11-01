import type { ReactNode } from "react"
import { ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"

export type Surface = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

const SURFACE_CLASS: Record<Surface, string> = {
  1: "surface-1",
  2: "surface-2",
  3: "surface-3",
  4: "surface-4",
  5: "surface-5",
  6: "surface-6",
  7: "surface-7",
  8: "surface-8",
}

const TONE_CLASS: Record<Surface, string> = {
  1: "tone-1",
  2: "tone-2",
  3: "tone-3",
  4: "tone-4",
  5: "tone-5",
  6: "tone-6",
  7: "tone-7",
  8: "tone-8",
}

/** Paints a surface and sets canvas/ink/action/highlight for everything inside it. */
export function surfaceClass(surface?: Surface) {
  return surface ? SURFACE_CLASS[surface] : ""
}

/** Sets a surface's canvas/ink/action/highlight colors for descendants without painting a background. */
export function toneClass(surface?: Surface) {
  return surface ? TONE_CLASS[surface] : ""
}

export type Action = {
  label: string
  href: string
  variant?: "primary" | "secondary" | "ghost"
  icon?: ReactNode
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-page px-6 md:px-10", className)}>{children}</div>
}

export function Section({
  id,
  surface,
  spacing = "normal",
  bleed = false,
  className,
  containerClassName,
  children,
}: {
  id?: string
  surface?: Surface
  spacing?: "normal" | "compact" | "none"
  bleed?: boolean
  className?: string
  containerClassName?: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      className={cn(
        "relative isolate overflow-hidden",
        surfaceClass(surface),
        spacing === "normal" && "py-section",
        spacing === "compact" && "py-14 md:py-20",
        className,
      )}
    >
      {bleed ? children : <Container className={containerClassName}>{children}</Container>}
    </section>
  )
}

export function Eyebrow({
  children,
  icon,
  style = "pill",
  className,
}: {
  children: ReactNode
  icon?: ReactNode
  style?: "pill" | "label"
  className?: string
}) {
  if (style === "label") {
    return (
      <p className={cn("inline-flex items-center gap-2 text-eyebrow font-medium uppercase text-ink-muted [&_svg]:size-3.5", className)}>
        {icon}
        {children}
      </p>
    )
  }
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-ink/5 px-3.5 py-1.5 text-sm font-medium text-ink ring-1 ring-inset ring-ink/10 [&_svg]:size-3.5 [&_svg]:text-highlight",
        className,
      )}
    >
      {icon}
      {children}
    </p>
  )
}

/** Renders a headline with one phrase picked out in the surface's highlight color. */
export function Highlighted({ text, highlight }: { text: string; highlight?: string }) {
  if (!highlight || !text.includes(highlight)) return <>{text}</>
  const [before, ...rest] = text.split(highlight)
  return (
    <>
      {before}
      <span className="brand-highlight text-highlight">{highlight}</span>
      {rest.join(highlight)}
    </>
  )
}

const ACTION_SIZE = {
  md: "h-11 gap-2 px-5 text-[0.9375rem]",
  lg: "h-13 gap-2.5 px-7 text-base",
}

export function ActionLink({ action, size = "lg" }: { action: Action; size?: keyof typeof ACTION_SIZE }) {
  const variant = action.variant ?? "primary"
  return (
    <a
      href={action.href}
      className={cn(
        "group/action inline-flex shrink-0 items-center justify-center rounded-button font-medium whitespace-nowrap transition-all duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ink/30 [&_svg]:size-4 [&_svg]:shrink-0",
        ACTION_SIZE[size],
        variant === "primary" && "bg-action text-action-foreground shadow-sm hover:-translate-y-px hover:shadow-md hover:brightness-110",
        variant === "secondary" && "bg-ink/5 text-ink ring-1 ring-inset ring-ink/15 hover:bg-ink/10",
        variant === "ghost" && "px-2 text-ink hover:text-ink-muted",
      )}
    >
      {action.icon}
      {action.label}
      {variant === "ghost" && !action.icon ? (
        <ArrowRight className="transition-transform group-hover/action:translate-x-0.5" />
      ) : null}
    </a>
  )
}

export function Actions({
  actions,
  size = "lg",
  align = "start",
  className,
}: {
  actions?: Action[]
  size?: keyof typeof ACTION_SIZE
  align?: "start" | "center"
  className?: string
}) {
  if (!actions?.length) return null
  return (
    <div className={cn("flex flex-wrap items-center gap-3", align === "center" && "justify-center", className)}>
      {actions.map((action) => (
        <ActionLink key={action.label} action={action} size={size} />
      ))}
    </div>
  )
}

export type SectionHeadingProps = {
  eyebrow?: string
  eyebrowIcon?: ReactNode
  eyebrowStyle?: "pill" | "label"
  title: string
  highlight?: string
  description?: string
  align?: "left" | "center" | "split"
  actions?: Action[]
  className?: string
}

export function SectionHeading({
  eyebrow,
  eyebrowIcon,
  eyebrowStyle = "pill",
  title,
  highlight,
  description,
  align = "left",
  actions,
  className,
}: SectionHeadingProps) {
  const eyebrowNode = eyebrow ? (
    <Eyebrow icon={eyebrowIcon} style={eyebrowStyle}>
      {eyebrow}
    </Eyebrow>
  ) : null
  const titleNode = (
    <h2 className="font-display text-headline text-ink">
      <Highlighted text={title} highlight={highlight} />
    </h2>
  )
  if (align === "split") {
    return (
      <div className={cn("grid gap-6 md:grid-cols-12 md:items-end md:gap-10", className)}>
        <div className="flex flex-col items-start gap-5 md:col-span-7">
          {eyebrowNode}
          {titleNode}
        </div>
        <div className="flex flex-col items-start gap-6 md:col-span-5 md:pb-2">
          {description ? <p className="text-lead text-ink-muted">{description}</p> : null}
          <Actions actions={actions} size="md" />
        </div>
      </div>
    )
  }
  const centered = align === "center"
  return (
    <div className={cn("flex max-w-3xl flex-col gap-5", centered ? "mx-auto items-center text-center" : "items-start", className)}>
      {eyebrowNode}
      {titleNode}
      {description ? <p className="max-w-2xl text-lead text-ink-muted">{description}</p> : null}
      <Actions actions={actions} size="md" align={centered ? "center" : "start"} className="mt-2" />
    </div>
  )
}

/** Simple geometric logo mark built from the brand's initial. */
export function BrandMark({
  name,
  shape = "square",
  className,
}: {
  name: string
  shape?: "square" | "circle" | "spark"
  className?: string
}) {
  if (shape === "spark") {
    return (
      <span className={cn("inline-flex size-9 items-center justify-center rounded-xl bg-action text-action-foreground", className)}>
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
          <path d="M12 2c.6 4.9 3.1 7.4 8 8-4.9.6-7.4 3.1-8 8-.6-4.9-3.1-7.4-8-8 4.9-.6 7.4-3.1 8-8Z" />
        </svg>
      </span>
    )
  }
  return (
    <span
      className={cn(
        "inline-flex size-9 items-center justify-center bg-action font-display text-base font-semibold text-action-foreground",
        shape === "circle" ? "rounded-full" : "rounded-xl",
        className,
      )}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}

export function Brand({ name, mark, className }: { name: string; mark?: ReactNode; className?: string }) {
  return (
    <a href="#" className={cn("inline-flex shrink-0 items-center gap-2.5 font-display text-lg font-semibold tracking-tight whitespace-nowrap text-ink", className)}>
      {mark ?? <BrandMark name={name} />}
      <span>{name}</span>
    </a>
  )
}
