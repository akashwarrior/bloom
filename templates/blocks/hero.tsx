import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import {
  Actions,
  Container,
  Eyebrow,
  Highlighted,
  surfaceClass,
  type Action,
  type Surface,
} from "@/components/blocks/section"

export type HeroProps = {
  variant?: "centered" | "split" | "panel"
  surface?: Surface
  /** panel only: surface of the large rounded hero panel inside the page. */
  panelSurface?: Surface
  eyebrow?: string
  eyebrowIcon?: ReactNode
  title: string
  highlight?: string
  description?: string
  actions?: Action[]
  note?: ReactNode
  visual?: ReactNode
  /** Text-free generated photo (asset localPath). panel: background behind the content; split/centered: the main visual when no visual is given. */
  image?: string
  imageAlt?: string
  /** How the image is framed: tilt = tilted inside an offset accent frame, arch = arched top, bleed (split) = runs to the page edge. */
  frame?: "plain" | "tilt" | "arch" | "bleed"
  backdrop?: "none" | "grid" | "glow"
}

function Backdrop({ kind }: { kind: HeroProps["backdrop"] }) {
  if (kind === "grid") {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--ink)_1px,transparent_1px),linear-gradient(to_bottom,var(--ink)_1px,transparent_1px)] bg-size-[64px_64px] opacity-[0.06] mask-[radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]"
      />
    )
  }
  if (kind === "glow") {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-130 w-240 -translate-x-1/2 rounded-full bg-highlight/20 blur-[120px]" />
      </div>
    )
  }
  return null
}

function Copy({
  eyebrow,
  eyebrowIcon,
  title,
  highlight,
  description,
  actions,
  note,
  align,
}: Pick<HeroProps, "eyebrow" | "eyebrowIcon" | "title" | "highlight" | "description" | "actions" | "note"> & {
  align: "center" | "start"
}) {
  const centered = align === "center"
  return (
    <div
      className={cn(
        "flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-3 duration-700 fill-mode-both",
        centered ? "mx-auto max-w-5xl items-center text-center" : "items-start",
      )}
    >
      {eyebrow ? <Eyebrow icon={eyebrowIcon}>{eyebrow}</Eyebrow> : null}
      <h1
        className={cn(
          "font-display text-display text-ink",
          centered ? "max-w-[18ch]" : "lg:[font-size:max(2.5rem,min(var(--text-display),var(--display-split-vw,5.4vw)))]",
        )}
      >
        <Highlighted text={title} highlight={highlight} />
      </h1>
      {description ? (
        <p className={cn("text-lead text-ink-muted", centered ? "max-w-2xl" : "max-w-xl")}>{description}</p>
      ) : null}
      <Actions actions={actions} align={centered ? "center" : "start"} className="mt-3" />
      {note ? <div className="text-sm text-ink-muted">{note}</div> : null}
    </div>
  )
}

export function Hero({
  variant = "centered",
  surface,
  panelSurface,
  eyebrow,
  eyebrowIcon,
  title,
  highlight,
  description,
  actions,
  note,
  visual,
  image,
  imageAlt = "",
  frame = "plain",
  backdrop = "none",
}: HeroProps) {
  const copy = { eyebrow, eyebrowIcon, title, highlight, description, actions, note }
  const photo = (aspect: string) => {
    if (!image) return null
    // eslint-disable-next-line @next/next/no-img-element
    const img = (className: string) => <img src={image} alt={imageAlt} className={cn("w-full object-cover", aspect, className)} />
    if (frame === "tilt") {
      return (
        <div className="relative mx-auto w-full max-w-xl px-4 py-6 lg:px-6">
          <div aria-hidden className="absolute inset-x-8 inset-y-10 -z-10 rounded-full bg-highlight/25 blur-[90px]" />
          <div className="relative rotate-[2.5deg] transition-transform duration-700 hover:rotate-[1deg]">
            <div aria-hidden className="absolute -inset-3 -z-10 -rotate-[2deg] rounded-card bg-highlight/10 ring-1 ring-highlight/40 md:-inset-4" />
            {img("rounded-card shadow-2xl ring-1 ring-ink/10")}
          </div>
        </div>
      )
    }
    if (frame === "arch") return img("rounded-t-[999px] rounded-b-card")
    if (frame === "bleed") return img("rounded-card lg:rounded-r-none")
    return img("rounded-card shadow-card")
  }

  if (variant === "split") {
    return (
      <section className={cn("relative isolate overflow-hidden pt-16 pb-section md:pt-24", surfaceClass(surface))}>
        <Backdrop kind={backdrop} />
        <Container>
          <div className="grid items-center gap-14 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-6">
              <Copy {...copy} align="start" />
            </div>
            <div className={cn("relative lg:col-span-6", !visual && image && frame === "bleed" && "lg:w-[calc(50vw-1.25rem)]")}>
              {visual ?? photo("aspect-[4/5] max-h-[44rem]")}
            </div>
          </div>
        </Container>
      </section>
    )
  }

  if (variant === "panel") {
    return (
      <section className={cn("relative isolate pt-4 pb-section", surfaceClass(surface))}>
        <Container className="px-3 md:px-5">
          <div
            className={cn(
              "relative isolate flex min-h-[min(84vh,860px)] flex-col overflow-hidden rounded-[calc(var(--radius-card)*1.5)] px-6 pt-28 md:px-12 md:pt-36",
              surfaceClass(panelSurface ?? surface),
              visual ? "pb-0" : "pb-24",
            )}
          >
            {image ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="" className="absolute inset-0 -z-20 size-full object-cover" />
                <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_55%_at_50%_38%,var(--canvas)_15%,transparent_75%)] opacity-90" />
              </>
            ) : (
              <Backdrop kind={backdrop} />
            )}
            <Copy {...copy} align="center" />
            {visual ? <div className="relative mx-auto mt-14 w-full max-w-5xl flex-1 md:mt-20">{visual}</div> : null}
          </div>
        </Container>
      </section>
    )
  }

  return (
    <section className={cn("relative isolate overflow-hidden pt-20 md:pt-28", visual || image ? "pb-16 md:pb-24" : "pb-section", surfaceClass(surface))}>
      <Backdrop kind={backdrop} />
      <Container>
        <Copy {...copy} align="center" />
        {visual || image ? <div className="relative mx-auto mt-16 w-full max-w-6xl md:mt-20">{visual ?? photo("aspect-[16/8]")}</div> : null}
      </Container>
    </section>
  )
}
