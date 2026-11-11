"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BloomWordmark } from "@/components/bloom-logo";
import { buttonVariants } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";

const groups = [
  {
    label: "Product",
    links: [
      { label: "Overview", href: "/#why" },
      { label: "Design tools", href: "/#design" },
      { label: "How it works", href: "/#workflow" },
    ],
  },
  {
    label: "Use Cases",
    links: [
      { label: "Web apps", href: "/#web-apps" },
      { label: "Websites", href: "/#websites" },
      { label: "Internal tools", href: "/#internal-tools" },
    ],
  },
  {
    label: "Resources",
    links: [
      { label: "Showcases", href: "/showcases" },
      { label: "FAQs", href: "/#faq" },
    ],
  },
] as const;

const standaloneLinks = [
  { label: "Get started", href: "/#pricing", external: false },
  { label: "Contact", href: "https://x.com/skyGuptaCS", external: true },
] as const;

export function Nav({ buildHref }: { buildHref: "/signup" | "/dashboard/projects" }) {
  const [open, setOpen] = useState(false);
  const buildLabel = buildHref === "/signup" ? "Start building" : "Open workspace";

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Smooth scrolling for in-page anchor links while the landing is mounted.
  // The data-scroll-behavior="smooth" attribute on <html> is Next.js's
  // convention: the router keeps its own route-transition scrolls instant
  // when it is present, so only anchor navigation is smoothed.
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.scrollBehavior = "smooth";
    return () => {
      html.removeAttribute("data-scroll-behavior");
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/">
          <BloomWordmark />
        </Link>

        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            {groups.map((group) => (
              <NavigationMenuItem key={group.label}>
                <NavigationMenuTrigger>{group.label}</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-40">
                    <li>
                      {group.links.map((link) => (
                        <NavigationMenuLink key={link.label} href={link.href}>
                          {link.label}
                        </NavigationMenuLink>
                      ))}
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            ))}

            {standaloneLinks.map((link) => (
              <NavigationMenuItem key={link.label}>
                <NavigationMenuLink
                  href={link.href}
                  target={link.external ? "_blank" : undefined}
                  rel={link.external ? "noopener noreferrer" : undefined}
                >
                  {link.label}
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex flex-1 items-center justify-end gap-2">
          <Link
            href={buildHref}
            className={cn(buttonVariants(), "h-9 px-4 text-sm")}
          >
            {buildLabel}
          </Link>

          <button
            type="button"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="landing-mobile-nav"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex size-10 items-center justify-center rounded-lg transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      <div
        id="landing-mobile-nav"
        hidden={!open}
        className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-border/70 md:hidden"
      >
        <nav className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6">
          <div className="grid gap-5">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="mb-1 px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {group.label}
                </p>
                <ul className="flex flex-col">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className="block rounded-lg px-2 py-2.5 text-[15px] transition-colors hover:bg-muted"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <ul className="flex flex-col border-t border-border/70 pt-3">
              {standaloneLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    className="block rounded-lg px-2 py-2.5 text-[15px] transition-colors hover:bg-muted"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>

            <Link
              href={buildHref}
              onClick={() => setOpen(false)}
              className={cn(buttonVariants(), "h-11 w-full text-sm")}
            >
              {buildLabel}
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
