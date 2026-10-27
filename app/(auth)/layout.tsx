import type { ReactNode } from "react"
import { STRIP } from "@/components/landing/tiles"

const COLUMNS = [STRIP.filter((_, i) => i % 2 === 0), STRIP.filter((_, i) => i % 2 === 1)]

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-svh bg-background">
      <div className="flex w-full flex-col items-center justify-center p-6 lg:w-5/12 lg:px-10">
        {children}
      </div>
      <div className="relative hidden flex-1 p-3 lg:block">
        <div className="relative isolate h-full overflow-hidden rounded-[14px]">
          <div aria-hidden className="absolute inset-0 flex gap-2">
            {COLUMNS.map((column, i) => (
              <div key={i} className="flex-1 overflow-hidden">
                <div
                  className="flex flex-col gap-2 pb-2 motion-safe:animate-[auth-scroll_80s_linear_infinite]"
                  style={{ animationDirection: i % 2 ? "reverse" : "normal" }}
                >
                  {[...column, ...column].map((tile, j) => (
                    <div key={j} className="aspect-4/5 w-full">
                      {tile}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="absolute bottom-6 left-6 max-w-md rounded-[14px] bg-white p-7 text-ink shadow-[0_30px_60px_-20px_rgba(0,0,0,0.35)]">
            <p className="font-display text-[clamp(2rem,2.8vw,2.75rem)] font-medium leading-[0.98] tracking-[-0.035em]">
              Every site starts as a{" "}
              <em className="font-accent font-normal italic tracking-[-0.02em] text-bloom">sentence.</em>
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-ink/60">
              Research, a real design brief, one committed art direction, and design checks on every page.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
