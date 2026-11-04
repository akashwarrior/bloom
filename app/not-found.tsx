import Link from "next/link"
import { Nav } from "@/components/landing"
import { BloomLogo } from "@/components/bloom-logo"

export default function NotFound() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-background px-6 text-center text-foreground">
      <Nav />

      <BloomLogo className="size-14 text-ink motion-safe:animate-[spin_30s_linear_infinite]" />
      <p className="mt-10 font-mono text-[11.5px] uppercase tracking-[0.14em] text-ink/50">Error 404</p>
      <h1 className="mt-4 font-display text-[clamp(2.8rem,7vw,6rem)] font-medium leading-[0.92] tracking-[-0.05em]">
        This page never{" "}
        <em className="font-accent font-light italic text-bloom">
          bloomed.
        </em>
      </h1>
      <p className="mt-6 max-w-md text-[16px] leading-relaxed text-ink/60">
        The link may be old, or the page has moved. Head back and start something new.
      </p>

      <div className="mt-10 flex items-center gap-3">
        <Link
          href="/"
          prefetch={false}
          className="inline-flex h-11 items-center rounded-full border border-ink/15 px-5 text-[14px] transition-colors hover:border-ink/40"
        >
          Back home
        </Link>
        <Link
          href="/dashboard/projects"
          prefetch={false}
          className="inline-flex h-11 items-center rounded-full bg-ink px-5 text-[14px] font-medium text-paper transition-colors hover:bg-bloom"
        >
          Open dashboard
        </Link>
      </div>
    </div>
  )
}
