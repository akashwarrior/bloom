"use client";

import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { MotionConfig } from "motion/react";

import { preferencesAtom } from "@/lib/preferences";

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { reduceMotion } = useAtomValue(preferencesAtom);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-reduce-motion", reduceMotion);
  }, [reduceMotion]);

  return <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>{children}</MotionConfig>;
}
