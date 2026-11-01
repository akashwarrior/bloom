import type { ReactNode } from "react"
import { ArrowUpRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { IconTile } from "@/components/blocks/mockups"
import { Section, SectionHeading, surfaceClass, type SectionHeadingProps, type Surface } from "@/components/blocks/section"

export type FeatureCard = {
  title: string
  description?: string
  /** "tall"/"media": the card's code-built visual (mockup). Use image for a photo. */
  visual?: ReactNode
  /** "tall"/"media": text-free generated photo (asset localPath) that fills the visual area. */
  image?: string
  imageAlt?: string
  /** "icon": a lucide icon element. */
  icon?: ReactNode
  /** Optional own surface for this card (tall variant color-blocks each card). */
  surface?: Surface
  label?: string
  href?: string
}

const COLUMNS = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-2 lg:grid-cols-3",
  4: "md:grid-cols-2 lg:grid-cols-4",
}

export function FeatureCards({
  id,
  surface,
  heading,
  items,
  variant = "tall",
  columns = 3,
}: {
  id?: string
  surface?: Surface
  heading?: SectionHeadingProps
  items: FeatureCard[]
  variant?: "tall" | "numbered" | "icon" | "media"
  columns?: 2 | 3 | 4
}) {
  return (
    <Section id={id} surface={surface}>
      {heading ? <SectionHeading {...heading} className="mb-12 md:mb-16" /> : null}
      <div className={cn("grid gap-4 md:gap-5", COLUMNS[columns])}>
        {items.map((item, index) => {
          if (variant === "numbered") {
            return (
              <div
                key={item.title}
                className={cn(
                  "group flex flex-col gap-6 rounded-card p-7 transition-colors duration-300 md:p-9",
                  item.surface && item.surface !== surface ? surfaceClass(item.surface) : "bg-ink/[0.035] ring-1 ring-inset ring-ink/10 hover:ring-highlight/40",
                )}
              >
                <span className="display-case font-display text-[clamp(3rem,4.6vw,4.5rem)] leading-none text-highlight tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="flex flex-col gap-3">
                  <h3 className="text-subtitle font-semibold text-ink">{item.title}</h3>
                  {item.description ? <p className="text-ink-muted">{item.description}</p> : null}
                </div>
              </div>
            )
          }
          if (variant === "icon") {
            return (
              <div
                key={item.title}
                className={cn(
                  "group flex flex-col gap-5 rounded-card p-7 transition-all duration-300 hover:-translate-y-1",
                  item.surface && item.surface !== surface ? surfaceClass(item.surface) : "bg-ink/[0.035] ring-1 ring-inset ring-ink/10 hover:bg-ink/[0.06]",
                )}
              >
                {item.icon ? <IconTile icon={item.icon} /> : null}
                <div className="flex flex-col gap-2">
                  <h3 className="font-display text-subtitle font-semibold text-ink">{item.title}</h3>
                  {item.description ? <p className="text-ink-muted">{item.description}</p> : null}
                </div>
                {item.href ? (
                  <a href={item.href} className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-ink">
                    {item.label ?? "Learn more"}
                    <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </a>
                ) : null}
              </div>
            )
          }
          if (variant === "media") {
            return (
              <div key={item.title} className="group flex flex-col gap-5">
                <div
                  className={cn(
                    "relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-card",
                    item.surface && item.surface !== surface ? surfaceClass(item.surface) : "bg-ink/5 ring-1 ring-inset ring-ink/10",
                  )}
                >
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image} alt={item.imageAlt ?? ""} className="absolute inset-0 size-full object-cover" />
                  ) : (
                    item.visual
                  )}
                </div>
                <div className="flex flex-col gap-2 px-1">
                  {item.label ? <p className="text-eyebrow font-medium uppercase text-ink-muted">{item.label}</p> : null}
                  <h3 className="font-display text-subtitle font-semibold text-ink">{item.title}</h3>
                  {item.description ? <p className="text-ink-muted">{item.description}</p> : null}
                </div>
              </div>
            )
          }
          return (
            <div
              key={item.title}
              className={cn(
                "group relative flex flex-col overflow-hidden rounded-card transition-transform duration-300 hover:-translate-y-1",
                item.visual || item.image ? "min-h-[26rem] md:min-h-[30rem]" : "min-h-56",
                item.surface && item.surface !== surface ? surfaceClass(item.surface) : "bg-ink/5 ring-1 ring-inset ring-ink/10",
              )}
            >
              <div className="relative z-10 flex flex-col gap-2 p-7 md:p-8">
                {item.label ? <p className="text-eyebrow font-medium uppercase text-ink-muted">{item.label}</p> : null}
                <h3 className="max-w-[22ch] font-display text-subtitle font-semibold text-ink">{item.title}</h3>
                {item.description ? <p className="max-w-[36ch] text-ink-muted">{item.description}</p> : null}
              </div>
              {item.image ? (
                <div className="relative mx-4 mb-4 flex-1 overflow-hidden rounded-[calc(var(--radius-card)*0.7)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image} alt={item.imageAlt ?? ""} className="absolute inset-0 size-full object-cover" />
                </div>
              ) : (
                <div className="relative flex flex-1 items-end justify-center px-6">{item.visual}</div>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}
