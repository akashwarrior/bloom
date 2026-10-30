/**
 * The style properties the design panel edits. Each edit value is a small
 * string the panel and the source patcher share: a px number ("24"), a
 * keyword ("auto", "center"), a design token ("token:primary") or a hex color.
 * `editCss` turns it into the inline style used for the live preview and
 * `editClass` into the Tailwind class written to source on Apply.
 */
export const DESIGN_PROPS = [
  "position",
  "display",
  "flexDirection",
  "alignItems",
  "justifyContent",
  "width",
  "height",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "gap",
  "fontFamily",
  "fontWeight",
  "fontSize",
  "lineHeight",
  "letterSpacing",
  "color",
  "fontStyle",
  "textAlign",
  "opacity",
  "borderRadius",
  "backgroundColor",
  "boxShadow",
] as const;

export type DesignProp = (typeof DESIGN_PROPS)[number];
export type DesignEdits = Partial<Record<DesignProp, string>>;

export type DesignToken = { name: string; value: string };

export type DesignElement = {
  styles: Record<DesignProp, string>;
  textEditable: boolean;
  ancestors: { tag: string; component: string | null }[];
  tokens: { colors: DesignToken[]; fonts: DesignToken[] };
};

export const SHADOWS: Record<string, string> = {
  none: "none",
  xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  sm: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.25)",
};

export const FONT_WEIGHTS: Record<string, string> = {
  "100": "thin",
  "200": "extralight",
  "300": "light",
  "400": "normal",
  "500": "medium",
  "600": "semibold",
  "700": "bold",
  "800": "extrabold",
  "900": "black",
};

const FLEX_KEYWORDS: Record<string, string> = {
  start: "flex-start",
  end: "flex-end",
  center: "center",
  stretch: "stretch",
  baseline: "baseline",
  between: "space-between",
  around: "space-around",
  evenly: "space-evenly",
};

const PX_PROPS = new Set<DesignProp>([
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "gap",
  "fontSize",
  "lineHeight",
  "letterSpacing",
  "borderRadius",
  "width",
  "height",
]);

const SIDE_CLASS: Partial<Record<DesignProp, string>> = {
  paddingTop: "pt",
  paddingRight: "pr",
  paddingBottom: "pb",
  paddingLeft: "pl",
  marginTop: "mt",
  marginRight: "mr",
  marginBottom: "mb",
  marginLeft: "ml",
  gap: "gap",
  width: "w",
  height: "h",
  fontSize: "text",
  lineHeight: "leading",
  letterSpacing: "tracking",
  borderRadius: "rounded",
};

const isNumber = (value: string) => /^-?\d+(?:\.\d+)?$/.test(value.trim());
const tokenOf = (value: string) =>
  value.startsWith("token:") ? value.slice("token:".length) : null;

/** Inline CSS for the live preview. */
export function editCss(prop: DesignProp, value: string): string {
  const token = tokenOf(value);
  if (prop === "fontFamily") return token ? `var(--font-${token})` : value;
  if (prop === "color" || prop === "backgroundColor") {
    return token ? `var(--color-${token}, var(--${token}))` : value;
  }
  if (prop === "boxShadow") return SHADOWS[value] ?? value;
  if (prop === "opacity") return isNumber(value) ? String(Number(value) / 100) : value;
  if (prop === "alignItems" || prop === "justifyContent") {
    return FLEX_KEYWORDS[value] ?? value;
  }
  if (prop === "flexDirection") return value === "col" ? "column" : value;
  if (PX_PROPS.has(prop) && isNumber(value)) return `${value}px`;
  return value;
}

/** The Tailwind class that reproduces an edit in source. */
export function editClass(prop: DesignProp, value: string): string | null {
  const token = tokenOf(value);
  const trimmed = value.trim();
  if (!trimmed) return null;

  switch (prop) {
    case "position":
      return ["static", "relative", "absolute", "fixed", "sticky"].includes(trimmed) ? trimmed : null;
    case "display":
      return trimmed === "none"
        ? "hidden"
        : ["block", "flex", "grid", "inline", "inline-block", "inline-flex"].includes(trimmed)
          ? trimmed
          : null;
    case "flexDirection":
      return trimmed === "row" ? "flex-row" : trimmed === "col" ? "flex-col" : null;
    case "alignItems":
      return FLEX_KEYWORDS[trimmed] ? `items-${trimmed}` : null;
    case "justifyContent":
      return FLEX_KEYWORDS[trimmed] && trimmed !== "stretch" && trimmed !== "baseline"
        ? `justify-${trimmed}`
        : null;
    case "fontFamily":
      return token ? `font-${token}` : null;
    case "fontWeight":
      return FONT_WEIGHTS[trimmed] ? `font-${FONT_WEIGHTS[trimmed]}` : null;
    case "fontStyle":
      return trimmed === "italic" ? "italic" : "not-italic";
    case "textAlign":
      return ["left", "center", "right", "justify"].includes(trimmed) ? `text-${trimmed}` : null;
    case "color":
    case "backgroundColor": {
      const prefix = prop === "color" ? "text" : "bg";
      if (token) return `${prefix}-${token}`;
      if (trimmed === "transparent") return `${prefix}-transparent`;
      return /^#[0-9a-f]{3,8}$/i.test(trimmed) ? `${prefix}-[${trimmed.toLowerCase()}]` : null;
    }
    case "opacity":
      return isNumber(trimmed) ? `opacity-${Math.round(Math.min(100, Math.max(0, Number(trimmed))))}` : null;
    case "boxShadow":
      return SHADOWS[trimmed] ? `shadow-${trimmed}` : null;
  }

  const prefix = SIDE_CLASS[prop];
  if (!prefix) return null;
  if (prop === "width" || prop === "height") {
    if (trimmed === "auto") return `${prefix}-auto`;
    if (trimmed === "100%") return `${prefix}-full`;
    if (trimmed === "fit-content") return `${prefix}-fit`;
  }
  if (prop === "lineHeight" && trimmed === "normal") return "leading-normal";
  if (prop === "borderRadius" && trimmed === "0") return "rounded-none";
  if (isNumber(trimmed)) {
    const number = Number(trimmed);
    if (number === 0 && prop !== "letterSpacing" && prop !== "lineHeight") {
      return `${prefix}-0`;
    }
    return `${prefix}-[${number}px]`;
  }
  return /^[\w.%-]+$/.test(trimmed) ? `${prefix}-[${trimmed}]` : null;
}

/** Display value for a computed CSS value: "66.9333px" -> "66.9". */
export function displayValue(prop: DesignProp, computed: string): string {
  if (PX_PROPS.has(prop)) {
    const match = /^(-?\d+(?:\.\d+)?)px$/.exec(computed);
    if (match) return String(Math.round(Number(match[1]) * 10) / 10);
    if (prop === "letterSpacing" && computed === "normal") return "0";
    return computed;
  }
  if (prop === "opacity") return String(Math.round(Number(computed) * 100));
  return computed;
}

export function rgbToHex(color: string) {
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(color.trim());
  if (!match) return color.startsWith("#") ? color : null;
  if (match[4] !== undefined && Number(match[4]) === 0) return "transparent";
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
}
