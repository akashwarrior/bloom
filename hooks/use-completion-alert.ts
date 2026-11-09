"use client";

import { useCallback } from "react";
import { useAtomValue } from "jotai";

import { preferencesAtom } from "@/lib/preferences";

function playChime() {
  const context = new AudioContext();
  const start = context.currentTime;
  for (const [index, frequency] of [660, 880].entries()) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const at = start + index * 0.12;
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.42);
  }
  window.setTimeout(() => void context.close(), 800);
}

/** Tells the user a generation finished: a chime, and a system notification while the tab is hidden. */
export function useCompletionAlert() {
  const { completionSound, completionNotification } = useAtomValue(preferencesAtom);

  return useCallback((title: string, body: string) => {
    if (completionSound) {
      try {
        playChime();
      } catch {
        // Audio can be blocked until the page has had a user gesture.
      }
    }
    if (completionNotification && document.hidden && "Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/icon.svg" });
    }
  }, [completionNotification, completionSound]);
}
