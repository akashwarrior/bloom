"use client"

import { useState, type ReactNode } from "react"
import { Menu, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { ActionLink, Brand, Container, toneClass, type Action, type Surface } from "@/components/blocks/section"

export type NavLink = { label: string; href: string }

export function SiteHeader({
  brand,
  links,
  cta,
  secondary,
  variant = "bar",
  surface,
}: {
  brand: { name: string; mark?: ReactNode }
  links: NavLink[]
  cta?: Action
  secondary?: Action
  variant?: "bar" | "floating"
  surface?: Surface
}) {
  const [open, setOpen] = useState(false)
  const floating = variant === "floating"

  const nav = (
    <nav className="hidden items-center gap-1 lg:flex">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          className="rounded-full px-3.5 py-2 text-[0.9375rem] font-medium whitespace-nowrap text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
        >
          {link.label}
        </a>
      ))}
    </nav>
  )

  const right = (
    <div className="flex items-center gap-2">
      {secondary ? (
        <span className="hidden md:inline-flex">
          <ActionLink action={{ ...secondary, variant: secondary.variant ?? "ghost" }} size="md" />
        </span>
      ) : null}
      {cta ? (
        <span className="hidden sm:inline-flex">
          <ActionLink action={{ ...cta, variant: cta.variant ?? "primary" }} size="md" />
        </span>
      ) : null}
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-ink/5 lg:hidden"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
    </div>
  )

  const mobile = open ? (
    <div className="mt-2 flex flex-col gap-1 rounded-card bg-canvas p-3 shadow-card ring-1 ring-ink/10 lg:hidden">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          onClick={() => setOpen(false)}
          className="rounded-xl px-4 py-3 text-base font-medium text-ink hover:bg-ink/5"
        >
          {link.label}
        </a>
      ))}
      {cta ? (
        <div className="px-1 pt-2">
          <ActionLink action={{ ...cta, variant: "primary" }} size="md" />
        </div>
      ) : null}
    </div>
  ) : null

  if (floating) {
    return (
      <header className={cn("sticky top-0 z-50 pt-4", toneClass(surface))}>
        <Container>
          <div className="flex h-16 items-center justify-between gap-4 rounded-full bg-canvas/85 pr-2 pl-5 shadow-card ring-1 ring-ink/10 backdrop-blur-xl">
            <Brand name={brand.name} mark={brand.mark} />
            {nav}
            {right}
          </div>
          {mobile}
        </Container>
      </header>
    )
  }

  return (
    <header className={cn("sticky top-0 z-50 border-b border-ink/10 bg-canvas/85 backdrop-blur-xl", toneClass(surface))}>
      <Container>
        <div className="flex h-18 items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <Brand name={brand.name} mark={brand.mark} />
            {nav}
          </div>
          {right}
        </div>
        {mobile ? <div className="pb-4">{mobile}</div> : null}
      </Container>
    </header>
  )
}
