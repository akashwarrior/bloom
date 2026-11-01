'use client';

import { AnimatePresence, motion } from 'motion/react';
import type { TargetAndTransition, Variants } from 'motion/react';

type PresetType =
  | 'blur'
  | 'fade-in-blur'
  | 'scale'
  | 'fade'
  | 'slide';

type PerType = 'word' | 'char' | 'line';

type TextEffectProps = {
  children: string;
  per?: PerType;
  className?: string;
  preset?: PresetType;
  delay?: number;
  speedReveal?: number;
  speedSegment?: number;
  trigger?: boolean;
};

const STAGGER: Record<PerType, number> = {
  char: 0.03,
  word: 0.05,
  line: 0.1,
};

type ItemVariants = {
  hidden: TargetAndTransition;
  visible: TargetAndTransition;
  exit: TargetAndTransition;
};

const PRESETS: Record<PresetType, ItemVariants> = {
  blur: {
    hidden: { opacity: 0, filter: 'blur(12px)' },
    visible: { opacity: 1, filter: 'blur(0px)' },
    exit: { opacity: 0, filter: 'blur(12px)' },
  },
  'fade-in-blur': {
    hidden: { opacity: 0, y: 20, filter: 'blur(12px)' },
    visible: { opacity: 1, y: 0, filter: 'blur(0px)' },
    exit: { opacity: 0, y: 20, filter: 'blur(12px)' },
  },
  scale: {
    hidden: { opacity: 0, scale: 0 },
    visible: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0 },
  },
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slide: {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
  },
};

function splitText(text: string, per: PerType): string[] {
  if (per === 'line') return text.split('\n');
  if (per === 'word') return text.split(/(\s+)/);

  return Array.from(text);
}

export function TextEffect({
  children,
  per = 'word',
  className,
  preset = 'fade',
  delay = 0,
  speedReveal = 1,
  speedSegment = 1,
  trigger = true,
}: TextEffectProps) {
  const stagger = STAGGER[per] / Math.max(speedReveal, 0.01);
  const duration = 0.3 / Math.max(speedSegment, 0.01);
  const item = PRESETS[preset];

  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        delayChildren: delay,
        staggerChildren: stagger,
      },
    },
    exit: {
      transition: {
        staggerChildren: stagger,
        staggerDirection: -1,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: item.hidden,
    visible: {
      ...item.visible,
      transition: { duration },
    },
    exit: {
      ...item.exit,
      transition: { duration },
    },
  };

  return (
    <AnimatePresence>
      {trigger && (
        <motion.p
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={containerVariants}
          className={className}
        >
          {splitText(children, per).map((segment, index) => (
            <motion.span
              key={index}
              aria-hidden="true"
              variants={itemVariants}
              className={
                per === 'line'
                  ? 'block'
                  : 'inline-block whitespace-pre'
              }
            >
              {segment || '\u00A0'}
            </motion.span>
          ))}
        </motion.p>
      )}
    </AnimatePresence>
  );
}
