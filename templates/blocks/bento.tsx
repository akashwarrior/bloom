import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import { Section, SectionHeading, surfaceClass, type SectionHeadingProps, type Surface } from "@/components/blocks/section"

export type BentoTile = {
  title: string
  description?: string
  visual?: ReactNode
  /** Text-free generated photo (asset localPath) that fills the tile's visual area. */
  image?: string
  imageAlt?: string
  /** sm = 1/3 width, md = 1/2, lg = 2/3, full = whole row; tall spans two rows at 1/3 width. */
  size?: "sm" | "md" | "lg" | "full" | "tall"
  surface?: Surface
  /** Put the text under the visual instead of above it. */
  textPosition?: "top" | "bottom"
}

const SIZE = {
  sm: "md:col-span-2",
  md: "md:col-span-3",
  lg: "md:col-span-4",
  full: "md:col-span-6",
  tall: "md:col-span-2 md:row-span-2",
}

export function Bento({
  id,
  surface,
  heading,
  tiles,
}: {
  id?: string
  surface?: Surface
  heading?: SectionHeadingProps
  tiles: BentoTile[]
}) {
  return (
    <Section id={id} surface={surface}>
      {heading ? <SectionHeading {...heading} className="mb-12 md:mb-16" /> : null}
      <div className="grid gap-4 md:grid-cols-6 md:gap-5">
        {tiles.map((tile) => {
          const text = (
            <div className="relative z-10 flex flex-col gap-2 p-7 md:p-8">
              <h3 className="font-display text-subtitle font-semibold text-ink">{tile.title}</h3>
              {tile.description ? <p className="max-w-[44ch] text-ink-muted">{tile.description}</p> : null}
            </div>
          )
          return (
            <div
              key={tile.title}
              className={cn(
                "relative flex flex-col overflow-hidden rounded-card",
                SIZE[tile.size ?? "md"],
                tile.visual || tile.image ? "min-h-[22rem]" : "min-h-48",
                tile.surface && tile.surface !== surface ? surfaceClass(tile.surface) : "bg-ink/[0.035] ring-1 ring-inset ring-ink/10",
              )}
            >
              {tile.textPosition === "bottom" ? null : text}
              {tile.image ? (
                <div className="relative mx-4 mb-4 min-h-44 flex-1 overflow-hidden rounded-[calc(var(--radius-card)*0.7)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={tile.image} alt={tile.imageAlt ?? ""} className="absolute inset-0 size-full object-cover" />
                </div>
              ) : tile.visual ? (
                <div className={cn("relative flex min-h-44 flex-1 justify-center px-6", tile.textPosition === "bottom" ? "items-center pt-6" : "items-end")}>
                  {tile.visual}
                </div>
              ) : null}
              {tile.textPosition === "bottom" ? text : null}
            </div>
          )
        })}
      </div>
    </Section>
  )
}
