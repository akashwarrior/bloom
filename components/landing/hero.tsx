"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { STRIP } from "./tiles";
import { useLenis } from "lenis/react";
import { Button } from "../ui/button";

const ease = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  const lenis = useLenis();

  return (
    <section className="relative overflow-hidden bg-white pt-16">
      <div className="mx-auto grid max-w-360 gap-10 px-5 pb-12 pt-14 md:px-10 md:pb-16 md:pt-24 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-end">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease }}
          className="font-display text-[clamp(3.2rem,7.4vw,7rem)] font-medium leading-[0.95] tracking-[-0.035em] text-ink"
        >
          Describe it.
          <br />
          Watch it <span className="font-accent font-normal italic tracking-[-0.02em] text-bloom">bloom.</span>
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease, delay: 0.12 }}
          className="lg:pb-3"
        >
          <p className="max-w-md text-[18px] leading-relaxed text-ink/60">
            Bloom is an AI designer. It researches your business, writes a design brief, and builds a site you&apos;d
            put your name on.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              prefetch={false}
              className="group inline-flex h-12 items-center gap-2 rounded-[10px] bg-ink px-5 text-[15px] font-medium text-white transition-colors duration-200 hover:bg-bloom"
            >
              Start designing
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <Button
              variant="outline"
              onClick={() => lenis?.scrollTo("#pricing")}
              className="h-12 items-center rounded-[10px] px-5 text-[15px] font-medium text-ink"
            >
              See pricing
            </Button>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.1, ease, delay: 0.25 }}
        className="group h-90 overflow-hidden md:h-115"
      >
        <div className="flex h-full w-max gap-2 pr-2 animate-[marquee_70s_linear_infinite] group-hover:paused">
          {[...STRIP, ...STRIP].map((tile, i) => (
            <div key={`${tile.key}-${i}`} className="h-full w-72.5 md:w-85">
              {tile}
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
