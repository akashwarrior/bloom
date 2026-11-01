import type { ReactNode } from "react"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Actions,
  Eyebrow,
  Section,
  SectionHeading,
  surfaceClass,
  type Action,
  type SectionHeadingProps,
  type Surface,
} from "@/components/blocks/section"

export type FeatureRow = {
  eyebrow?: string
  title: string
  description: string
  bullets?: string[]
  actions?: Action[]
  /** Code-built visual (mockups). Use image instead for a photo. */
  visual?: ReactNode
  /** Text-free generated photo (asset localPath); fills the frame edge to edge. */
  image?: string
  imageAlt?: string
  /** Surface of the visual's frame; omit for a quiet tinted frame. */
  visualSurface?: Surface
}

/** Alternating text + visual rows. */
export function FeatureSplit({
  id,
  surface,
  heading,
  rows,
}: {
  id?: string
  surface?: Surface
  heading?: SectionHeadingProps
  rows: FeatureRow[]
}) {
  return (
    <Section id={id} surface={surface}>
      {heading ? <SectionHeading {...heading} className="mb-16 md:mb-24" /> : null}
      <div className="flex flex-col gap-20 md:gap-28">
        {rows.map((row, index) => (
          <div key={row.title} className="grid items-center gap-10 lg:grid-cols-12 lg:gap-16">
            <div className={cn("flex flex-col items-start gap-5 lg:col-span-5", index % 2 === 1 && "lg:order-2 lg:col-start-8")}>
              {row.eyebrow ? <Eyebrow style="label">{row.eyebrow}</Eyebrow> : null}
              <h3 className="font-display text-title text-ink">{row.title}</h3>
              <p className="text-lead text-ink-muted">{row.description}</p>
              {row.bullets?.length ? (
                <ul className="mt-2 flex flex-col gap-3">
                  {row.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-3 text-ink">
                      <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-highlight/15 text-highlight">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      {bullet}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Actions actions={row.actions} size="md" className="mt-3" />
            </div>
            <div
              className={cn(
                "relative flex min-h-[22rem] items-center justify-center overflow-hidden rounded-card md:min-h-[30rem] lg:col-span-7",
                row.image ? "" : "p-6 md:p-10",
                index % 2 === 1 && "lg:order-1 lg:col-start-1",
                row.visualSurface && row.visualSurface !== surface ? surfaceClass(row.visualSurface) : "bg-ink/5 ring-1 ring-inset ring-ink/10",
              )}
            >
              {row.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.image} alt={row.imageAlt ?? ""} className="absolute inset-0 size-full object-cover" />
              ) : (
                row.visual
              )}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}
