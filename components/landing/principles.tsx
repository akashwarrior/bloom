"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { Accent, Reveal } from "./section";

const CARDS = [
  {
    title: "Homework first",
    body: "Before a single pixel, Bloom researches your market and writes a brief, the way a studio would.",
    tag: "Research → Brief",
    rotate: -7,
    className: "bg-[#d6f36b] text-[#121110]",
  },
  {
    title: "A point of view",
    body: "Every project commits to one direction: type pairing, palette, rhythm. No beige middle ground.",
    tag: "One direction",
    rotate: 4,
    className: "bg-[#2f5bff] text-white",
  },
  {
    title: "Composed, not templated",
    body: "Pages are built from a library of studied layouts, so they have rhythm instead of sameness.",
    tag: "Layout library",
    rotate: -3,
    className: "bg-[#ffb8e0] text-[#121110]",
  },
  {
    title: "Checked like a pro",
    body: "Type is set in grayscale first. Every color pair passes contrast. Imagery is made to fit.",
    tag: "AA contrast",
    rotate: 6,
    className: "bg-bloom text-bloom-fg",
  },
] as const;

function Glyph({ index }: { index: number }) {
  if (index === 0)
    return (
      <div className="w-[62%] space-y-[calc(var(--card)*0.022)]">
        {[92, 70, 82].map((width, i) => (
          <div key={width} className="flex items-center gap-[calc(var(--card)*0.025)] rounded-full bg-current/8 px-[calc(var(--card)*0.035)] py-[calc(var(--card)*0.02)]" style={{ width: `${width}%` }}>
            <span className={i === 0 ? "size-[calc(var(--card)*0.022)] rounded-full bg-current" : "size-[calc(var(--card)*0.022)] rounded-full bg-current/30"} />
            <span className="h-[calc(var(--card)*0.012)] flex-1 rounded-full bg-current/25" />
          </div>
        ))}
      </div>
    );
  if (index === 1)
    return (
      <div className="flex items-end gap-[calc(var(--card)*0.05)]">
        <span className="font-accent text-[calc(var(--card)*0.22)] italic leading-[0.7]">Aa</span>
        <span className="flex gap-[calc(var(--card)*0.015)] pb-[calc(var(--card)*0.01)]">
          {["#121110", "#f0461e", "#ffd43b"].map((color) => (
            <span key={color} className="size-[calc(var(--card)*0.06)] rounded-full ring-1 ring-current/20" style={{ background: color }} />
          ))}
        </span>
      </div>
    );
  if (index === 2)
    return (
      <div className="grid w-[56%] grid-cols-3 gap-[calc(var(--card)*0.015)]">
        <span className="col-span-2 row-span-2 aspect-square rounded-[calc(var(--card)*0.02)] bg-current/15" />
        <span className="rounded-[calc(var(--card)*0.02)] bg-current/15" />
        <span className="rounded-[calc(var(--card)*0.02)] border border-dashed border-current/40" />
        <span className="col-span-3 h-[calc(var(--card)*0.04)] rounded-[calc(var(--card)*0.02)] bg-current/15" />
      </div>
    );
  return (
    <div className="flex w-fit items-center gap-[calc(var(--card)*0.03)] rounded-full bg-current/12 py-[calc(var(--card)*0.018)] pl-[calc(var(--card)*0.02)] pr-[calc(var(--card)*0.04)] font-mono text-[max(11px,calc(var(--card)*0.04))]">
      <span className="grid size-[calc(var(--card)*0.07)] place-items-center rounded-full bg-current">
        <span className="text-[calc(var(--card)*0.04)] text-bloom">✓</span>
      </span>
      7.4 : 1 · AA
    </div>
  );
}

function Card({ card, index, progress }: { card: (typeof CARDS)[number]; index: number; progress: MotionValue<number> }) {
  const start = 0.02 + index * 0.14;
  const end = start + 0.2;
  const y = useTransform(progress, [start, end], ["110vh", "0vh"]);
  const rotate = useTransform(progress, [start, end], [card.rotate + 24, card.rotate]);
  const offset = index - (CARDS.length - 1) / 2;

  return (
    <motion.div
      style={{ y, rotate, left: `calc(50% + ${offset} * var(--spread) - var(--card) / 2)` }}
      className={`absolute top-1/2 flex aspect-3/4 w-(--card) -translate-y-1/2 flex-col rounded-[14px] p-[calc(var(--card)*0.075)] shadow-[0_30px_60px_-30px_rgba(18,17,16,0.35)] ${card.className}`}
    >
      <div className="flex items-start justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] opacity-70">{card.tag}</span>
        <span className="font-mono text-[11px] opacity-70">0{index + 1}</span>
      </div>
      <div className="mt-[calc(var(--card)*0.1)]">
        <Glyph index={index} />
      </div>
      <span className="mt-auto font-display text-[calc(var(--card)*0.3)] font-medium leading-[0.8] tracking-[-0.07em]">
        {index + 1}
      </span>
      <h3 className="mt-[calc(var(--card)*0.06)] font-display text-[calc(var(--card)*0.085)] font-medium leading-none tracking-[-0.04em]">
        {card.title}
      </h3>
      <p className="mt-2 text-[max(12px,calc(var(--card)*0.043))] leading-snug opacity-80">{card.body}</p>
    </motion.div>
  );
}

export function Principles() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  return (
    <section id="why" ref={ref} className="relative h-[340vh] pt-16">
      <div className="sticky top-0 h-svh overflow-hidden [--card:clamp(230px,23vw,330px)] [--spread:0px] md:[--spread:calc(var(--card)*1.02)]">
        <Reveal className="relative z-10 mx-auto max-w-295 px-5 pt-[16svh] text-center md:pt-[14svh]">
          <h2 className="font-display text-[clamp(2.6rem,6vw,5.75rem)] font-medium leading-[0.92] tracking-[-0.055em] text-ink">
            Why it doesn&apos;t look <Accent>generated.</Accent>
          </h2>
          <p className="mx-auto mt-5 max-w-120 text-[17px] leading-relaxed text-ink/60">
            Most AI builders start from a template. Bloom starts the way a good designer does.
          </p>
        </Reveal>

        <div className="absolute inset-x-0 bottom-0 top-[42svh] md:top-[40svh]">
          {CARDS.map((card, i) => (
            <Card key={card.title} card={card} index={i} progress={scrollYProgress} />
          ))}
        </div>
      </div>
    </section>
  );
}
