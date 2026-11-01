import type { ReactNode } from "react"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  ActionLink,
  Actions,
  Container,
  Eyebrow,
  Highlighted,
  Section,
  SectionHeading,
  surfaceClass,
  type Action,
  type SectionHeadingProps,
  type Surface,
} from "@/components/blocks/section"

/** Numbered how-it-works steps, optionally each with a small visual. */
export function Steps({
  id,
  surface,
  heading,
  steps,
}: {
  id?: string
  surface?: Surface
  heading?: SectionHeadingProps
  steps: Array<{ title: string; description: string; visual?: ReactNode }>
}) {
  return (
    <Section id={id} surface={surface}>
      {heading ? <SectionHeading {...heading} className="mb-12 md:mb-16" /> : null}
      <ol className={cn("grid gap-5", steps.length === 4 ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3")}>
        {steps.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-6 rounded-card bg-ink/[0.035] p-7 ring-1 ring-inset ring-ink/10">
            <span className="font-mono text-sm font-medium text-highlight">{String(index + 1).padStart(2, "0")}</span>
            {step.visual ? <div className="flex min-h-36 items-center justify-center">{step.visual}</div> : null}
            <div className="mt-auto flex flex-col gap-2">
              <h3 className="font-display text-subtitle font-semibold text-ink">{step.title}</h3>
              <p className="text-ink-muted">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  )
}

export function Faq({
  id,
  surface,
  heading,
  items,
  layout = "split",
}: {
  id?: string
  surface?: Surface
  heading: SectionHeadingProps
  items: Array<{ question: string; answer: string }>
  layout?: "split" | "center"
}) {
  const list = (
    <Accordion className="flex flex-col gap-3">
      {items.map((item) => (
        <AccordionItem key={item.question} value={item.question} className="rounded-2xl bg-ink/[0.035] px-6 ring-1 ring-inset ring-ink/10 not-last:border-b-0">
          <AccordionTrigger className="py-5 text-base font-medium text-ink hover:no-underline md:text-lg **:data-[slot=accordion-trigger-icon]:text-ink-muted">
            {item.question}
          </AccordionTrigger>
          <AccordionContent className="pb-5 text-base text-ink-muted">{item.answer}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
  if (layout === "center") {
    return (
      <Section id={id} surface={surface}>
        <SectionHeading {...heading} align="center" className="mb-12" />
        <div className="mx-auto max-w-3xl">{list}</div>
      </Section>
    )
  }
  return (
    <Section id={id} surface={surface}>
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <SectionHeading {...heading} align="left" className="lg:sticky lg:top-28" />
        </div>
        <div className="lg:col-span-7">{list}</div>
      </div>
    </Section>
  )
}

export function Cta({
  id,
  variant = "panel",
  surface,
  panelSurface,
  eyebrow,
  title,
  highlight,
  description,
  actions,
  visual,
  image,
  pattern = "glow",
}: {
  id?: string
  variant?: "centered" | "panel"
  surface?: Surface
  panelSurface?: Surface
  /** panel only: background texture when there is no image. */
  pattern?: "glow" | "stripes" | "dots" | "grid" | "none"
  eyebrow?: string
  title: string
  highlight?: string
  description?: string
  actions: Action[]
  visual?: ReactNode
  /** panel only: text-free background image (generated asset localPath). */
  image?: string
}) {
  const copy = (
    <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="font-display text-headline text-ink">
        <Highlighted text={title} highlight={highlight} />
      </h2>
      {description ? <p className="max-w-xl text-lead text-ink-muted">{description}</p> : null}
      <Actions actions={actions} align="center" className="mt-2" />
    </div>
  )
  if (variant === "centered") {
    return (
      <Section id={id} surface={surface}>
        {copy}
        {visual ? <div className="relative mx-auto mt-14 max-w-5xl">{visual}</div> : null}
      </Section>
    )
  }
  return (
    <Section id={id} surface={surface}>
      <div
        className={cn(
          "relative isolate overflow-hidden rounded-[calc(var(--radius-card)*1.5)] px-6 py-20 md:px-12 md:py-28",
          panelSurface ? surfaceClass(panelSurface) : "bg-ink/5 ring-1 ring-inset ring-ink/10",
          !image && pattern === "stripes" && "ring-1 ring-inset ring-highlight/35",
        )}
      >
        {image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" className="absolute inset-0 -z-20 size-full object-cover" />
            <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_65%_60%_at_50%_50%,var(--canvas)_20%,transparent_80%)] opacity-90" />
          </>
        ) : pattern === "glow" ? (
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_120%,var(--highlight),transparent_70%)] opacity-25" />
        ) : pattern === "stripes" ? (
          <div aria-hidden className="absolute inset-0 -z-10 bg-[repeating-linear-gradient(135deg,var(--highlight)_0_1px,transparent_1px_11px)] opacity-[0.16]" />
        ) : pattern === "dots" ? (
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(var(--ink)_1px,transparent_1.5px)] bg-size-[18px_18px] opacity-[0.12]" />
        ) : pattern === "grid" ? (
          <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--ink)_1px,transparent_1px),linear-gradient(to_bottom,var(--ink)_1px,transparent_1px)] bg-size-[56px_56px] opacity-[0.07]" />
        ) : null}
        {copy}
        {visual ? <div className="relative mx-auto mt-14 max-w-4xl">{visual}</div> : null}
      </div>
    </Section>
  )
}

/** Full-bleed moving band of short uppercase brand phrases, tilted for energy. */
export function Ribbon({
  id,
  surface,
  bandSurface,
  items,
  tilt = "left",
}: {
  id?: string
  surface?: Surface
  bandSurface?: Surface
  items: string[]
  tilt?: "left" | "right" | "none"
}) {
  const repeats = Math.max(2, Math.ceil(12 / Math.max(items.length, 1)))
  const run = Array.from({ length: repeats }, () => items).flat()
  const phrases = (copy: number) =>
    run.map((item, index) => (
      <span key={`${copy}-${index}`} className="inline-flex items-center gap-8 md:gap-12" aria-hidden={copy > 0 || undefined}>
        <span>{item}</span>
        <span aria-hidden className="size-2.5 rotate-45 bg-current opacity-60 md:size-3" />
      </span>
    ))
  return (
    <section id={id} aria-label={items.join(", ")} className={cn("relative isolate overflow-hidden", tilt === "none" ? "py-0" : "py-10 md:py-14", surfaceClass(surface))}>
      <div
        className={cn(
          "-mx-[5vw] flex overflow-hidden py-4 md:py-5",
          bandSurface ? surfaceClass(bandSurface) : "bg-action text-action-foreground",
          tilt === "left" && "-rotate-[2deg]",
          tilt === "right" && "rotate-[2deg]",
        )}
      >
        <div className="flex w-max shrink-0 animate-marquee items-center gap-8 pr-8 font-display text-2xl leading-none whitespace-nowrap uppercase md:gap-12 md:pr-12 md:text-4xl">
          {phrases(0)}
          {phrases(1)}
        </div>
      </div>
    </section>
  )
}

/** Row of partner, network, or integration names (text wordmarks; never fake logos). */
export function LogoStrip({
  id,
  surface,
  label,
  items,
  variant = "row",
}: {
  id?: string
  surface?: Surface
  label?: string
  items: Array<{ name: string; icon?: ReactNode }>
  variant?: "row" | "marquee"
}) {
  const item = (entry: { name: string; icon?: ReactNode }, key: string) => (
    <span key={key} className="inline-flex shrink-0 items-center gap-2.5 font-display text-xl font-semibold tracking-tight text-ink/55 [&_svg]:size-6">
      {entry.icon}
      {entry.name}
    </span>
  )
  return (
    <Section id={id} surface={surface} spacing="compact">
      {label ? <p className="mb-8 text-center text-sm font-medium text-ink-muted">{label}</p> : null}
      {variant === "marquee" ? (
        <div className="relative overflow-hidden mask-[linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
          <div className="flex w-max animate-marquee gap-14 pr-14">
            {[...items, ...items].map((entry, index) => item(entry, `${entry.name}-${index}`))}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
          {items.map((entry) => item(entry, entry.name))}
        </div>
      )}
    </Section>
  )
}

/** One large statement paragraph (mission, positioning), optionally with an attribution line. */
export function Statement({
  id,
  surface,
  size = "md",
  eyebrow,
  text,
  highlight,
  attribution,
}: {
  id?: string
  surface?: Surface
  /** lg sets the statement at headline scale. */
  size?: "md" | "lg"
  eyebrow?: string
  text: string
  highlight?: string
  attribution?: string
}) {
  return (
    <Section id={id} surface={surface}>
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 text-center">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <p
          className={cn(
            "font-display text-ink text-balance",
            size === "lg" ? "display-case text-headline" : "text-title leading-[1.2] font-medium md:text-[clamp(2rem,3.4vw,3rem)]",
          )}
        >
          <Highlighted text={text} highlight={highlight} />
        </p>
        {attribution ? <p className="text-ink-muted">{attribution}</p> : null}
      </div>
    </Section>
  )
}

export function Pricing({
  id,
  surface,
  heading,
  tiers,
}: {
  id?: string
  surface?: Surface
  heading?: SectionHeadingProps
  tiers: Array<{
    name: string
    price: string
    period?: string
    description: string
    features: string[]
    cta: Action
    featured?: boolean
    badge?: string
  }>
}) {
  return (
    <Section id={id} surface={surface}>
      {heading ? <SectionHeading {...heading} align="center" className="mb-12 md:mb-16" /> : null}
      <div className={cn("mx-auto grid max-w-6xl gap-5", tiers.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3")}>
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={cn(
              "relative flex flex-col gap-6 rounded-card p-8",
              tier.featured ? "bg-action text-action-foreground shadow-card" : "bg-ink/[0.035] ring-1 ring-inset ring-ink/10",
            )}
          >
            <div className="flex items-center justify-between">
              <p className="font-display text-lg font-semibold">{tier.name}</p>
              {tier.badge ? (
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", tier.featured ? "bg-action-foreground/15" : "bg-ink/8")}>{tier.badge}</span>
              ) : null}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-5xl font-semibold tracking-tight">{tier.price}</span>
              {tier.period ? <span className={tier.featured ? "opacity-70" : "text-ink-muted"}>{tier.period}</span> : null}
            </div>
            <p className={tier.featured ? "opacity-80" : "text-ink-muted"}>{tier.description}</p>
            <ul className="flex flex-col gap-3 text-[0.9375rem]">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <Check className={cn("mt-0.5 size-4 shrink-0", tier.featured ? "" : "text-highlight")} strokeWidth={2.5} />
                  {feature}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-2 [&_a]:w-full">
              {tier.featured ? (
                <a
                  href={tier.cta.href}
                  className="inline-flex h-12 w-full items-center justify-center rounded-button bg-action-foreground font-medium text-action transition hover:opacity-90"
                >
                  {tier.cta.label}
                </a>
              ) : (
                <ActionLink action={{ ...tier.cta, variant: "secondary" }} size="md" />
              )}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

export function SiteFooter({
  surface,
  brand,
  columns,
  newsletter,
  legal,
  socials,
}: {
  surface?: Surface
  brand: { name: string; mark?: ReactNode; tagline?: string }
  columns: Array<{ title: string; links: Array<{ label: string; href: string }> }>
  newsletter?: { title: string; placeholder: string; button: string }
  legal?: string
  socials?: Array<{ label: string; href: string; icon: ReactNode }>
}) {
  return (
    <footer className={cn("pt-20 pb-10", surfaceClass(surface))}>
      <Container>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="flex flex-col items-start gap-6 lg:col-span-5">
            <a href="#" className="inline-flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight text-ink">
              {brand.mark ?? (
                <span className="inline-flex size-9 items-center justify-center rounded-xl bg-action font-display text-base font-semibold text-action-foreground">
                  {brand.name.charAt(0).toUpperCase()}
                </span>
              )}
              {brand.name}
            </a>
            {brand.tagline ? <p className="max-w-sm text-ink-muted">{brand.tagline}</p> : null}
            {newsletter ? (
              <div className="w-full max-w-md">
                <p className="mb-3 text-sm font-medium text-ink">{newsletter.title}</p>
                <div className="flex gap-2 rounded-button bg-ink/5 p-1.5 ring-1 ring-inset ring-ink/10">
                  <input
                    type="email"
                    placeholder={newsletter.placeholder}
                    className="min-w-0 flex-1 bg-transparent px-3 text-sm text-ink outline-none placeholder:text-ink-muted"
                  />
                  <button type="button" className="h-10 shrink-0 rounded-button bg-action px-4 text-sm font-medium text-action-foreground">
                    {newsletter.button}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7">
            {columns.map((column) => (
              <div key={column.title} className="flex flex-col gap-3">
                <p className="text-sm font-semibold text-ink">{column.title}</p>
                {column.links.map((link) => (
                  <a key={link.label} href={link.href} className="text-sm text-ink-muted transition-colors hover:text-ink">
                    {link.label}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-16 flex flex-col-reverse items-start justify-between gap-4 border-t border-ink/10 pt-8 text-sm text-ink-muted md:flex-row md:items-center">
          <p>{legal ?? `© ${new Date().getFullYear()} ${brand.name}`}</p>
          {socials?.length ? (
            <div className="flex items-center gap-2">
              {socials.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="inline-flex size-9 items-center justify-center rounded-full text-ink-muted ring-1 ring-ink/10 transition-colors hover:text-ink [&_svg]:size-4"
                >
                  {social.icon}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </Container>
    </footer>
  )
}
