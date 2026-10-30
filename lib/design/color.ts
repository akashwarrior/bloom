export type Rgb = { r: number; g: number; b: number };

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_PATTERN =
  /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)(?:[\s,/]+(\d*\.?\d+%?))?\s*\)$/i;

const OKLCH_PATTERN = /^oklch\(\s*(\d*\.?\d+)(%?)\s+(\d*\.?\d+)\s+(\d*\.?\d+)(?:\s*\/\s*(\d*\.?\d+%?))?\s*\)$/i;

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function gammaChannel(linear: number) {
  const value = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
  return clampChannel(value * 255);
}

/** Parses a CSS oklch() value (as shadcn themes write them) to sRGB. */
export function parseOklch(value: string): Rgb | null {
  const match = OKLCH_PATTERN.exec(value.trim());
  if (!match) return null;
  const lightness = Number.parseFloat(match[1]!) / (match[2] ? 100 : 1);
  return oklchToRgb(lightness, Number.parseFloat(match[3]!), Number.parseFloat(match[4]!));
}

function oklchToRgb(l: number, c: number, h: number): Rgb {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: gammaChannel(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    g: gammaChannel(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    b: gammaChannel(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  };
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
export function relativeLuminance({ r, g, b }: Rgb) {
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}

export function contrastRatio(first: Rgb, second: Rgb) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export type Lab = { l: number; a: number; b: number };

export function toLab(color: Rgb): Lab {
  const r = linearChannel(color.r);
  const g = linearChannel(color.g);
  const b = linearChannel(color.b);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (value: number) =>
    value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** CIE76 distance; ~2 is barely visible, >10 is clearly a different color. */
export function deltaE(first: Rgb, second: Rgb) {
  const a = toLab(first);
  const b = toLab(second);
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

export function chroma(color: Rgb) {
  const { a, b } = toLab(color);
  return Math.hypot(a, b);
}

/** Perceived lightness class used for theme decisions. */
export function isLightColor(color: Rgb) {
  return toLab(color).l >= 60;
}

export function describeColor(color: Rgb) {
  const { l } = toLab(color);
  const c = chroma(color);
  const tone = l >= 85 ? "very light" : l >= 60 ? "light" : l >= 35 ? "mid" : l >= 15 ? "dark" : "near-black";
  return c < 8 ? `${tone} neutral` : `${tone} ${hueName(color)}`;
}

export function hueName({ r, g, b }: Rgb) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return "gray";
  const delta = max - min;
  let hue = max === r
    ? ((g - b) / delta) % 6
    : max === g
      ? (b - r) / delta + 2
      : (r - g) / delta + 4;
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;
  if (hue < 15 || hue >= 345) return "red";
  if (hue < 40) return "orange";
  if (hue < 65) return "yellow";
  if (hue < 95) return "lime";
  if (hue < 160) return "green";
  if (hue < 190) return "teal";
  if (hue < 215) return "cyan";
  if (hue < 250) return "blue";
  if (hue < 285) return "violet";
  if (hue < 320) return "purple";
  return "pink";
}

export type Hsl = { h: number; s: number; l: number };

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const h = max === rn
    ? ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60
    : max === gn
      ? ((bn - rn) / delta + 2) * 60
      : ((rn - gn) / delta + 4) * 60;
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}
