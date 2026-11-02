export type Rgb = { r: number; g: number; b: number };

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_PATTERN =
  /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)(?:[\s,/]+(\d*\.?\d+%?))?\s*\)$/i;

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function parseColor(value: string): Rgb | null {
  const input = value.trim();
  const hex = HEX_PATTERN.exec(input);
  if (hex) {
    const digits = hex[1]!.length === 3
      ? hex[1]!.split("").map((digit) => digit + digit).join("")
      : hex[1]!;
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
    };
  }
  const rgb = RGB_PATTERN.exec(input);
  if (!rgb) return null;
  const alpha = rgb[4];
  if (alpha !== undefined) {
    const numericAlpha = alpha.endsWith("%")
      ? Number.parseFloat(alpha) / 100
      : Number.parseFloat(alpha);
    if (numericAlpha < 0.5) return null;
  }
  return {
    r: clampChannel(Number.parseFloat(rgb[1]!)),
    g: clampChannel(Number.parseFloat(rgb[2]!)),
    b: clampChannel(Number.parseFloat(rgb[3]!)),
  };
}

export function toHex({ r, g, b }: Rgb) {
  return `#${[r, g, b]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function linearChannel(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance in [0, 1]. */
function relativeLuminance({ r, g, b }: Rgb) {
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}

export function contrastRatio(first: Rgb, second: Rgb) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Perceived lightness class used for theme decisions: CIE L* of 60 or more. */
export function isLightColor(color: Rgb) {
  const y = relativeLuminance(color);
  return 116 * (y > 0.008856 ? Math.cbrt(y) : 7.787 * y + 16 / 116) - 16 >= 60;
}
