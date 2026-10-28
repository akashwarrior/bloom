"use client";

import { useRef } from "react";
import { motion, useInView } from "motion/react";
import { cn } from "@/lib/utils";

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={isInView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function SectionHeader({
  index,
  label,
  title,
  description,
  className,
}: {
  index: string;
  label: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <Reveal className={cn("grid gap-6 md:grid-cols-12 md:gap-8", className)}>
      <p
        className="flex items-center gap-3 border-t border-line pt-4 font-mono text-[11.5px] uppercase tracking-[0.14em] text-ink/50 md:col-span-12"
      >
        <span className="text-ink">({index})</span>
        {label}
      </p>
      <h2
        className="font-display text-[clamp(2.4rem,5.2vw,4.75rem)] font-medium leading-[0.95] tracking-[-0.045em] text-ink md:col-span-8 [font-variation-settings:'opsz'_96]"
      >
        {title}
      </h2>
      {description && (
        <p
          className="max-w-md self-end text-[17px] leading-relaxed text-ink/60 md:col-span-4"
        >
          {description}
        </p>
      )}
    </Reveal>
  );
}

export function Accent({ children }: { children: React.ReactNode }) {
  return (
    <em className="font-accent font-normal italic tracking-[-0.02em]">
      {children}
    </em>
  );
}
