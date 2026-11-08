type HapticKind = "tick" | "tap" | "success"

function haptic(kind: HapticKind = "tick", intensity = 0.5) {
  const strength = Math.min(1, Math.max(0, intensity))
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return
  }
  const pattern =
    kind === "success"
      ? [8 + Math.round(strength * 8), 45, 12 + Math.round(strength * 10)]
      : kind === "tap"
        ? 10
        : 3 + Math.round(strength * 11)
  try {
    navigator.vibrate(pattern)
  } catch { }
}

export { haptic }
