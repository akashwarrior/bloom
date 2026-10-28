"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";

const LINES = [
  { text: "Good taste,", accent: false },
  { text: "on demand.", accent: true },
] as const;

function Char({ char, seed, progress }: { char: string; seed: number; progress: MotionValue<number> }) {
  const drift = Math.sin(seed * 12.9898) * 43758.5453;
  const unit = Math.round((drift - Math.floor(drift)) * 100) / 100;
  const y = useTransform(progress, [0, 0.75], [Math.round((unit - 0.5) * 360), 0]);
  const rotate = useTransform(progress, [0, 0.75], [Math.round((unit - 0.5) * 70), 0]);
  const opacity = useTransform(progress, [0, 0.35], [0.15, 1]);

  return (
    <motion.span style={{ y, rotate, opacity }} className="inline-block whitespace-pre">
      {char}
    </motion.span>
  );
}

export function Kinetic() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });

  return (
    <section ref={ref} className="overflow-hidden px-5 py-44">
      <h2 className="text-center font-display text-[clamp(3.4rem,12vw,12rem)] font-medium leading-[0.92] tracking-[-0.065em] text-ink">
        {LINES.map((line, row) => (
          <span key={line.text} className={line.accent ? "block font-accent font-normal italic tracking-[-0.03em] text-bloom-text" : "block"}>
            {[...line.text].map((char, i) => (
              <Char key={i} char={char} seed={row * 100 + i + 1} progress={scrollYProgress} />
            ))}
          </span>
        ))}
      </h2>
    </section>
  );
}
