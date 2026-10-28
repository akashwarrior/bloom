"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useLenis } from "lenis/react";
import { AnimatePresence, motion } from "motion/react";
import { authClient } from "@/lib/auth-client";
import { BloomWordmark } from "@/components/bloom-logo";

const navLinks = [
  { label: "Why Bloom", href: "#why" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
] as const;

export function Nav() {
  const { data } = authClient.useSession();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const lenis = useLenis();
  const session = !!data?.session;

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);

    update();
    window.addEventListener("scroll", update, { passive: true });

    return () => {
      window.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <nav
        className={cn(
          "flex h-16 items-center border-b backdrop-blur-xl transition-[background-color,border-color] duration-300",
          "border-ink/9 bg-white/90 text-ink",
          !scrolled && !mobileOpen && "border-transparent",
        )}
      >
        <div className="mx-auto flex w-full max-w-360 items-center justify-between gap-6 px-5 md:px-10">
          <div className="flex items-center gap-8">
            <Link href="/" prefetch={false}>
              <BloomWordmark />
            </Link>
            <div className="hidden items-center gap-1 md:flex">
              {navLinks.map((link) => (
                <button
                  key={link.label}
                  type="button"
                  onClick={() => lenis?.scrollTo(link.href)}
                  className="rounded-lg px-3 py-2 text-[15px] transition-colors duration-200 hover:bg-current/6"
                >
                  {link.label}
                </button>
              ))}
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {!session && (
              <Link
                href="/login"
                prefetch={false}
                className="rounded-lg px-3.5 py-2 text-[15px] transition-colors duration-200 hover:bg-current/6"
              >
                Log in
              </Link>
            )}
            <Link
              href={session ? "/dashboard/projects" : "/signup"}
              prefetch={false}
              className={cn(
                "inline-flex h-11 items-center rounded-[10px] px-5 text-[15px] font-medium transition-colors duration-200 hover:bg-bloom hover:text-bloom-fg",
                "bg-ink text-paper",
              )}
            >
              {session ? "Open dashboard" : "Start designing"}
            </Link>
          </div>

          <button
            type="button"
            className="relative grid size-10 place-items-center md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-expanded={mobileOpen}
          >
            <span className={cn("absolute h-px w-5 bg-current transition-transform duration-300", mobileOpen ? "rotate-45" : "-translate-y-1")} />
            <span className={cn("absolute h-px w-5 bg-current transition-transform duration-300", mobileOpen ? "-rotate-45" : "translate-y-1")} />
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-b border-ink/9 bg-paper/95 backdrop-blur-xl md:hidden"
          >
            <div className="flex flex-col px-5 pb-6 pt-2">
              {navLinks.map((link) => (
                <button
                  key={link.label}
                  type="button"
                  onClick={() => lenis?.scrollTo(link.href)}
                  className="border-b border-line py-4 text-left font-display text-2xl tracking-[-0.03em] text-ink"
                >
                  {link.label}
                </button>
              ))}
              <Link
                href={session ? "/dashboard/projects" : "/signup"}
                prefetch={false}
                className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-ink text-[15px] font-medium text-paper"
              >
                {session ? "Open dashboard" : "Start designing"}
              </Link>
              {!session && (
                <Link href="/login" prefetch={false} className="mt-3 text-center text-[15px] text-ink/70">
                  Log in
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
