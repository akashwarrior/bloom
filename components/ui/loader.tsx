"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

type LoaderProps = {
  size?: number;
  speed?: number;
  label?: string;
  className?: string;
};

export function Loader({
  size = 32,
  speed = 1,
  label = "Loading",
  className,
}: LoaderProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("flex items-center justify-center text-inherit", className)}
    >
      <DotMatrix size={size} speed={speed} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

interface PartProps {
  size: number;
  speed: number;
}

function DotMatrix({ size, speed, }: PartProps) {
  const n = 3;
  const gap = size * 0.14;
  const dot = (size - gap * (n - 1)) / n;
  const cells = Array.from({ length: n * n }, (_, idx) => idx);
  return (
    <span
      className="grid"
      style={{
        gap,
        gridTemplateColumns: `repeat(${n}, ${dot}px)`,
      }}
    >
      {cells.map((idx) => {
        const x = idx % n;
        const y = Math.floor(idx / n);
        // Diagonal wave: cells light in order of their distance from the corner.
        const delay = ((x + y) / (2 * (n - 1))) * speed;
        return (
          <motion.span
            key={idx}
            className="rounded-full bg-current"
            style={{ width: dot, height: dot }}
            animate={
              { opacity: [0.2, 1, 0.2], scale: [0.7, 1, 0.7] }
            }
            transition={{
              duration: speed,
              ease: EASE_IN_OUT,
              repeat: Infinity,
              delay,
            }}
          />
        );
      })}
    </span>
  );
}
