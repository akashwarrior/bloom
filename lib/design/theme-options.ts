import {
  PRESET_BASE_COLORS,
  PRESET_CHART_COLORS,
  PRESET_FONT_HEADINGS,
  PRESET_FONTS,
  PRESET_ICON_LIBRARIES,
  PRESET_MENU_ACCENTS,
  PRESET_MENU_COLORS,
  PRESET_RADII,
  PRESET_STYLES,
  PRESET_THEMES,
} from "shadcn/preset";

/**
 * One source of truth for shadcn create's menus, shared by the theme panel
 * and the design subagent. The labels, style descriptions and geometry notes
 * are distilled from shadcn's own skill:
 *
 * - https://github.com/shadcn-ui/ui/tree/main/skills/shadcn
 * - https://ui.shadcn.com/docs/theming
 * - https://ui.shadcn.com/create
 *
 * The color and font notes below are neutral descriptions derived from the
 * presets' OKLCH values and the official font definitions. They do not encode
 * product categories or selection rules. Refresh this file when shadcn adds a
 * preset value; the `satisfies Record<...>` checks make a missing entry a type
 * error.
 *
 * Preset-only is deliberate: Bloom does not patch individual brand hex values
 * over a preset. The preset stays the single source of truth so `shadcn apply`
 * and the theme panel can regenerate tokens without drift.
 */
type PresetStyle = (typeof PRESET_STYLES)[number];
type PresetBaseColor = (typeof PRESET_BASE_COLORS)[number];
type PresetThemeColor = (typeof PRESET_THEMES)[number];
type PresetFont = (typeof PRESET_FONTS)[number];
type PresetHeadingFont = (typeof PRESET_FONT_HEADINGS)[number];
type PresetIconLibrary = (typeof PRESET_ICON_LIBRARIES)[number];
type PresetMenuAccent = (typeof PRESET_MENU_ACCENTS)[number];
type PresetMenuColor = (typeof PRESET_MENU_COLORS)[number];
type PresetRadius = (typeof PRESET_RADII)[number];
type PresetMode = "light" | "dark";

export type ThemeSelection = {
  style: string;
  baseColor: string;
  theme: string;
  chartColor: string;
  font: string;
  fontHeading: string;
  iconLibrary: string;
  radius: string;
  mode: PresetMode;
  menuAccent: string;
  menuColor: string;
};

type StyleOption = {
  label: string;
  /** shadcn create's own one-line description. */
  description: string;
  /** What the style changes that CSS variables cannot reach. */
  geometry: string;
  /** Known constraint, if any. */
  constraint?: string;
};

export const STYLE_OPTIONS: Record<PresetStyle, StyleOption> = {
  vega: {
    label: "Vega",
    description: "Clean, neutral, and familiar",
    geometry: "The classic shadcn/ui look: conventional control heights, medium radius, restrained elevation.",
  },
  nova: {
    label: "Nova",
    description: "Reduced padding and margins",
    geometry: "Compact controls and tighter rhythm: roughly 32–36px controls, 6–8px radius, hairlines over shadows.",
  },
  maia: {
    label: "Maia",
    description: "Rounded, with generous spacing",
    geometry: "Soft geometry with roomy padding: 40px+ controls, 12px+ card radius, editorial pacing.",
  },
  lyra: {
    label: "Lyra",
    description: "Boxy and sharp. For mono fonts",
    geometry: "Hard edges, 0–4px radius, technical controls, mono-friendly proportions.",
  },
  mira: {
    label: "Mira",
    description: "Made for compact interfaces",
    geometry: "Dense data UI: 28–32px controls, tight tables, small radii, minimal chrome.",
  },
  luma: {
    label: "Luma",
    description: "Fluid, luminous, and soft",
    geometry: "Rounded, soft elevation, breathable layouts; pill buttons, layered shadows, glassy or macOS-like surfaces.",
  },
  sera: {
    label: "Sera",
    description: "Editorial and typographic",
    geometry: "Editorial pacing and type-led hierarchy; generous line lengths, serif display, magazine-like rhythm.",
  },
  rhea: {
    label: "Rhea",
    description: "Like Luma but compact",
    geometry: "Luma's softness with product-UI density; rounded but not roomy.",
    constraint: "Rhea does not support the large radius.",
  },
};

type BaseColorOption = {
  label: string;
  swatch: string;
  temperature: "neutral" | "warm" | "cool" | "mauve" | "olive";
  note: string;
};

export const BASE_COLOR_OPTIONS = {
  neutral: {
    label: "Neutral",
    swatch: "#737373",
    temperature: "neutral",
    note: "Pure gray with no hue cast.",
  },
  stone: {
    label: "Stone",
    swatch: "#78716c",
    temperature: "warm",
    note: "Warm, beige-tinged gray.",
  },
  zinc: {
    label: "Zinc",
    swatch: "#71717a",
    temperature: "cool",
    note: "Slightly blue-gray.",
  },
  gray: {
    label: "Gray",
    swatch: "#6b7280",
    temperature: "cool",
    note: "Tailwind's classic cool gray. Present in the preset enum; shadcn create's randomizer skips it.",
  },
  mauve: {
    label: "Mauve",
    swatch: "#79697b",
    temperature: "mauve",
    note: "Muted plum-gray.",
  },
  olive: {
    label: "Olive",
    swatch: "#7c7c67",
    temperature: "olive",
    note: "Moss-tinged gray.",
  },
  mist: {
    label: "Mist",
    swatch: "#67787c",
    temperature: "cool",
    note: "Airy blue-gray.",
  },
  taupe: {
    label: "Taupe",
    swatch: "#7c6d67",
    temperature: "warm",
    note: "Earthy brown-gray.",
  },
} satisfies Record<PresetBaseColor, BaseColorOption>;

type ThemeColorOption = {
  label: string;
  swatch: string;
  family: string;
  note: string;
  /** A neutral family name is a base color, not a free accent. */
  neutral: boolean;
};

const COLOR_NOTES: Record<PresetThemeColor, Omit<ThemeColorOption, "label" | "neutral">> = {
  neutral: {
    swatch: "#737373",
    family: "neutral gray",
    note: "No chroma.",
  },
  stone: {
    swatch: "#78716c",
    family: "warm gray",
    note: "Warm gray.",
  },
  zinc: {
    swatch: "#71717a",
    family: "cool gray",
    note: "Cool gray.",
  },
  gray: {
    swatch: "#6b7280",
    family: "cool gray",
    note: "Classic cool gray.",
  },
  amber: {
    swatch: "#f59e0b",
    family: "golden yellow",
    note: "Golden yellow; high chroma.",
  },
  blue: {
    swatch: "#3b82f6",
    family: "clear blue",
    note: "Clear blue; medium-high chroma.",
  },
  cyan: {
    swatch: "#06b6d4",
    family: "aqua",
    note: "Aqua; high chroma.",
  },
  emerald: {
    swatch: "#10b981",
    family: "green",
    note: "Green; medium-high chroma.",
  },
  fuchsia: {
    swatch: "#d946ef",
    family: "magenta",
    note: "Magenta; high chroma.",
  },
  green: {
    swatch: "#22c55e",
    family: "grass green",
    note: "Grass green; higher chroma than emerald.",
  },
  indigo: {
    swatch: "#6366f1",
    family: "blue-violet",
    note: "Blue-violet; high chroma.",
  },
  lime: {
    swatch: "#84cc16",
    family: "acid green",
    note: "Acid green; high chroma.",
  },
  orange: {
    swatch: "#f97316",
    family: "vivid orange",
    note: "Vivid orange; high chroma.",
  },
  pink: {
    swatch: "#ec4899",
    family: "bright pink",
    note: "Bright pink; high chroma.",
  },
  purple: {
    swatch: "#a855f7",
    family: "violet",
    note: "Violet; high chroma.",
  },
  red: {
    swatch: "#ef4444",
    family: "signal red",
    note: "Signal red; high chroma. Also the conventional error/destructive hue.",
  },
  rose: {
    swatch: "#f43f5e",
    family: "soft red-pink",
    note: "Soft red-pink; lower chroma than red.",
  },
  sky: {
    swatch: "#0ea5e9",
    family: "light blue",
    note: "Light blue; medium chroma.",
  },
  teal: {
    swatch: "#14b8a6",
    family: "blue-green",
    note: "Blue-green; medium chroma.",
  },
  violet: {
    swatch: "#8b5cf6",
    family: "blue-purple",
    note: "Blue-purple; more purple than indigo.",
  },
  yellow: {
    swatch: "#eab308",
    family: "bright yellow",
    note: "Bright yellow; high chroma.",
  },
  mauve: {
    swatch: "#79697b",
    family: "plum-gray",
    note: "Plum-gray.",
  },
  olive: {
    swatch: "#7c7c67",
    family: "moss-gray",
    note: "Moss-gray.",
  },
  mist: {
    swatch: "#67787c",
    family: "blue-gray",
    note: "Blue-gray.",
  },
  taupe: {
    swatch: "#7c6d67",
    family: "brown-gray",
    note: "Brown-gray.",
  },
};

const NEUTRAL_COLORS = new Set<string>(PRESET_BASE_COLORS);
const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export const THEME_COLOR_OPTIONS = Object.fromEntries(
  PRESET_THEMES.map((value) => [
    value,
    {
      label: label(value),
      ...COLOR_NOTES[value],
      neutral: NEUTRAL_COLORS.has(value),
    },
  ]),
) as Record<PresetThemeColor, ThemeColorOption>;

/** Complementary chart hues from shadcn create's own pairings. */
export const CHART_COLOR_PAIRINGS: Record<string, string[]> = {
  red: ["teal", "sky"],
  orange: ["teal", "blue"],
  amber: ["cyan", "indigo"],
  yellow: ["sky", "violet"],
  lime: ["indigo", "pink"],
  green: ["purple", "rose"],
  emerald: ["purple", "red"],
  teal: ["fuchsia", "red"],
  cyan: ["rose", "amber"],
  sky: ["red", "yellow"],
  blue: ["orange", "yellow"],
  indigo: ["amber", "yellow"],
  violet: ["yellow", "lime"],
  purple: ["green", "lime"],
  fuchsia: ["lime", "teal"],
  pink: ["green", "cyan"],
  rose: ["emerald", "sky"],
};

type FontOption = {
  label: string;
  type: "sans" | "mono" | "serif";
  note: string;
  /** Safe for the body/UI role. */
  body: boolean;
  /** Safe for page display headings. */
  display: boolean;
};

export const FONT_OPTIONS = {
  geist: { label: "Geist", type: "sans", note: "Geometric sans.", body: true, display: true },
  inter: { label: "Inter", type: "sans", note: "Neutral UI sans with a large x-height.", body: true, display: true },
  "noto-sans": { label: "Noto Sans", type: "sans", note: "Humanist sans with broad language coverage.", body: true, display: true },
  "nunito-sans": { label: "Nunito Sans", type: "sans", note: "Rounded sans.", body: true, display: true },
  figtree: { label: "Figtree", type: "sans", note: "Geometric sans.", body: true, display: true },
  roboto: { label: "Roboto", type: "sans", note: "Neutral grotesk sans.", body: true, display: true },
  raleway: { label: "Raleway", type: "sans", note: "Display-leaning sans with thin weights.", body: true, display: true },
  "dm-sans": { label: "DM Sans", type: "sans", note: "Geometric sans.", body: true, display: true },
  "public-sans": { label: "Public Sans", type: "sans", note: "Neutral sans with high legibility.", body: true, display: true },
  outfit: { label: "Outfit", type: "sans", note: "Geometric sans.", body: true, display: true },
  oxanium: { label: "Oxanium", type: "sans", note: "Squared, technical sans.", body: true, display: true },
  manrope: { label: "Manrope", type: "sans", note: "Semi-geometric sans.", body: true, display: true },
  "space-grotesk": { label: "Space Grotesk", type: "sans", note: "Grotesk sans with distinctive details.", body: true, display: true },
  montserrat: { label: "Montserrat", type: "sans", note: "Geometric sans with wide proportions.", body: true, display: true },
  "ibm-plex-sans": { label: "IBM Plex Sans", type: "sans", note: "Neo-grotesk sans with a large x-height.", body: true, display: true },
  "source-sans-3": { label: "Source Sans 3", type: "sans", note: "Humanist sans.", body: true, display: true },
  "instrument-sans": { label: "Instrument Sans", type: "sans", note: "Neutral sans.", body: true, display: true },
  "geist-mono": { label: "Geist Mono", type: "mono", note: "Monospace.", body: false, display: false },
  "jetbrains-mono": { label: "JetBrains Mono", type: "mono", note: "Monospace with coding ligatures.", body: false, display: false },
  "noto-serif": { label: "Noto Serif", type: "serif", note: "Transitional serif.", body: true, display: true },
  "roboto-slab": { label: "Roboto Slab", type: "serif", note: "Slab serif.", body: true, display: true },
  merriweather: { label: "Merriweather", type: "serif", note: "High-contrast serif.", body: true, display: true },
  lora: { label: "Lora", type: "serif", note: "Calligraphic serif.", body: true, display: true },
  "playfair-display": { label: "Playfair Display", type: "serif", note: "High-contrast display serif.", body: false, display: true },
  "eb-garamond": { label: "EB Garamond", type: "serif", note: "Old-style serif.", body: true, display: true },
  "instrument-serif": { label: "Instrument Serif", type: "serif", note: "Modern display serif.", body: false, display: true },
} satisfies Record<PresetFont, FontOption>;

type HeadingFontOption = FontOption & { inherit: boolean };

export const HEADING_FONT_OPTIONS = {
  inherit: {
    label: "Same as body",
    type: "sans" as const,
    note: "Reuse the body face for headings.",
    body: true,
    display: true,
    inherit: true,
  },
  ...Object.fromEntries(
    PRESET_FONTS.map((value) => [value, { ...FONT_OPTIONS[value], inherit: false }]),
  ),
} as Record<PresetHeadingFont, HeadingFontOption>;

type IconOption = {
  label: string;
  /** Package or packages installed by shadcn apply. */
  package: string;
  import: string;
  usage: string;
  note: string;
};

export const ICON_OPTIONS = {
  lucide: {
    label: "Lucide",
    package: "lucide-react",
    import: 'import { ArrowRight } from "lucide-react"',
    usage: "<ArrowRight />",
    note: "Broad 24px set with a neutral stroke.",
  },
  hugeicons: {
    label: "Hugeicons",
    package: "@hugeicons/react + @hugeicons/core-free-icons",
    import: 'import { HugeiconsIcon } from "@hugeicons/react"; import { ArrowRight01Icon } from "@hugeicons/core-free-icons"',
    usage: "<HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />",
    note: "Rounded glyphs in multiple weights; shadcn installs both Hugeicons packages.",
  },
  tabler: {
    label: "Tabler Icons",
    package: "@tabler/icons-react",
    import: 'import { IconArrowRight } from "@tabler/icons-react"',
    usage: "<IconArrowRight />",
    note: "24px grid with a consistent stroke.",
  },
  phosphor: {
    label: "Phosphor Icons",
    package: "@phosphor-icons/react",
    import: 'import { ArrowRightIcon } from "@phosphor-icons/react"',
    usage: "<ArrowRightIcon strokeWidth={2} />",
    note: "Multiple weights and styles.",
  },
  remixicon: {
    label: "Remix Icon",
    package: "@remixicon/react",
    import: 'import { RiArrowRightLine } from "@remixicon/react"',
    usage: "<RiArrowRightLine />",
    note: "Neutral 24px set.",
  },
} satisfies Record<PresetIconLibrary, IconOption>;

type RadiusOption = {
  label: string;
  px: number | null;
  note: string;
};

export const RADIUS_OPTIONS = {
  default: {
    label: "Default",
    px: 10,
    note: "shadcn's default 0.625rem base radius.",
  },
  none: {
    label: "None",
    px: 0,
    note: "Sharp corners.",
  },
  small: {
    label: "Small",
    px: 7,
    note: "Smaller corner radius.",
  },
  medium: {
    label: "Medium",
    px: 10,
    note: "The same base as Default, stated explicitly.",
  },
  large: {
    label: "Large",
    px: 14,
    note: "Larger corner radius; Rhea does not allow it.",
  },
} satisfies Record<PresetRadius, RadiusOption>;

export const MODE_OPTIONS = [
  {
    value: "light" as const,
    label: "Light",
    note: "The page uses shadcn's light token side.",
  },
  {
    value: "dark" as const,
    label: "Dark",
    note: "The page uses shadcn's dark token side.",
  },
] as const;

type MenuAccentOption = {
  label: string;
  note: string;
};

export const MENU_ACCENT_OPTIONS = {
  subtle: {
    label: "Subtle",
    note: "Menu highlights use the muted surface.",
  },
  bold: {
    label: "Bold",
    note: "Menu highlights use the primary color.",
  },
} satisfies Record<PresetMenuAccent, MenuAccentOption>;

type MenuColorOption = {
  label: string;
  note: string;
};

export const MENU_COLOR_OPTIONS = {
  default: {
    label: "Default",
    note: "Menus use the page's popover surface.",
  },
  inverted: {
    label: "Inverted",
    note: "Menus force the dark surface, even on a light page.",
  },
  "default-translucent": {
    label: "Translucent",
    note: "Light popover with a backdrop blur.",
  },
  "inverted-translucent": {
    label: "Inverted translucent",
    note: "Dark popover with a backdrop blur.",
  },
} satisfies Record<PresetMenuColor, MenuColorOption>;

export const THEME_FIELDS: Array<{ key: keyof ThemeSelection; label: string }> = [
  { key: "style", label: "Style" },
  { key: "baseColor", label: "Base color" },
  { key: "theme", label: "Theme" },
  { key: "chartColor", label: "Chart color" },
  { key: "fontHeading", label: "Heading font" },
  { key: "font", label: "Font" },
  { key: "iconLibrary", label: "Icon library" },
  { key: "radius", label: "Radius" },
  { key: "mode", label: "Mode" },
  { key: "menuAccent", label: "Menu accent" },
  { key: "menuColor", label: "Menu surface" },
];

const THEME_CONSTRAINTS = [
  "`theme` is the primary color, not the light/dark mode.",
  "A neutral theme or chart color (neutral, stone, zinc, gray, mauve, olive, mist, taupe) is valid only when it equals `baseColor`.",
  "`chartColor` sets chart-1..5, used for charts and chart-role panels. The UI accent is shadcn's `accent` token, driven by `menuAccent`; it is not derived from a chart color.",
  "`fontHeading: inherit` means the body font.",
  "Rhea does not support the large radius.",
  "`menuAccent` changes `--accent` / `--accent-foreground`, the menu hover and selected state; `menuColor` changes menu markup (dark or translucent) and is applied by `shadcn apply`.",
  "Bloom is Base UI and LTR. `base` and `rtl` are project facts, not preset choices; changing them would change component APIs or flip the project.",
] as const;

/** Human-readable label for a preset value, falling back to title case. */
export function optionLabel<T extends { label: string }>(options: Record<string, T>, value: string) {
  return options[value]?.label ?? label(value);
}

export function describePreset(theme: ThemeSelection) {
  return [
    `${optionLabel(STYLE_OPTIONS, theme.style)} / ${optionLabel(BASE_COLOR_OPTIONS, theme.baseColor)} / ${optionLabel(THEME_COLOR_OPTIONS, theme.theme)} / ${optionLabel(THEME_COLOR_OPTIONS, theme.chartColor)}`,
    `${optionLabel(FONT_OPTIONS, theme.font)}${theme.fontHeading === "inherit" ? " (headings inherit)" : ` + ${optionLabel(HEADING_FONT_OPTIONS, theme.fontHeading)}`}`,
    `${optionLabel(RADIUS_OPTIONS, theme.radius)} radius / ${optionLabel(ICON_OPTIONS, theme.iconLibrary)} / ${theme.mode}`,
    `menus: ${optionLabel(MENU_ACCENT_OPTIONS, theme.menuAccent)} accent, ${optionLabel(MENU_COLOR_OPTIONS, theme.menuColor)} surface`,
  ].join("; ");
}

/**
 * The complete shadcn create option catalog for the design subagent. It
 * contains option facts and the constraints that make a preset valid; it does
 * not recommend or rank any option.
 */
export function themeMenuText() {
  const colorLine = (value: PresetThemeColor) => {
    const option = THEME_COLOR_OPTIONS[value];
    return `- \`${value}\` — ${option.label}, ${option.family}. ${option.note}${option.neutral ? " Neutral: only valid when it equals baseColor." : ""}`;
  };
  const fontLine = (value: PresetFont) => {
    const option = FONT_OPTIONS[value];
    return `- \`${value}\` — ${option.label}, ${option.type}; ${option.body ? "body-safe" : "not body-safe"}; ${option.display ? "heading-safe" : "not heading-safe"}. ${option.note}`;
  };
  const lines: string[] = [
    "## shadcn create options",
    "",
    "Every option available to the preset is listed below. Bloom resolves the chosen preset with shadcn and applies it with `shadcn apply`, which writes the tokens, fonts and components. Bloom does not add colors, fonts, radii, icons or menus outside these values.",
    "",
    "### Project facts — not preset choices",
    "- Bloom is Base UI (`base=base`).",
    "- Bloom is LTR (`rtl=false`).",
    "",
    "### Style — component geometry",
  ];
  for (const value of PRESET_STYLES) {
    const option = STYLE_OPTIONS[value];
    lines.push(`- \`${value}\` — ${option.label}: ${option.description}. ${option.geometry}${option.constraint ? ` Constraint: ${option.constraint}` : ""}`);
  }
  lines.push("", "### Base color — the neutral family (canvas, muted, borders)");
  for (const value of PRESET_BASE_COLORS) {
    const option = BASE_COLOR_OPTIONS[value];
    lines.push(`- \`${value}\` — ${option.label}, ${option.temperature}. ${option.note}`);
  }
  lines.push("", "### Theme — the primary color (actions, focus, key highlights)");
  for (const value of PRESET_THEMES) lines.push(colorLine(value));
  lines.push("", "### Chart color — chart-1..5 for charts and chart-role panels");
  for (const value of PRESET_CHART_COLORS) lines.push(colorLine(value));
  lines.push("", "### Body font");
  for (const value of PRESET_FONTS) lines.push(fontLine(value));
  lines.push("", "### Heading font");
  lines.push("- `inherit` — same as the body font.");
  for (const value of PRESET_FONTS) lines.push(fontLine(value));
  lines.push("", "### Icon library");
  lines.push("shadcn apply installs the selected icon package automatically.");
  for (const value of PRESET_ICON_LIBRARIES) {
    const option = ICON_OPTIONS[value];
    lines.push(`- \`${value}\` — ${option.label}. ${option.note} Package: \`${option.package}\`. Import: \`${option.import}\`. Usage: \`${option.usage}\`.`);
  }
  lines.push("", "### Radius");
  for (const value of PRESET_RADII) {
    const option = RADIUS_OPTIONS[value];
    lines.push(`- \`${value}\` — ${option.label}${option.px === null ? "" : `, about ${option.px}px`}. ${option.note}`);
  }
  lines.push("", "### Mode");
  for (const option of MODE_OPTIONS) {
    lines.push(`- \`${option.value}\` — ${option.label}. ${option.note}`);
  }
  lines.push("", "### Menu accent — the focus/hover treatment inside menus");
  for (const value of PRESET_MENU_ACCENTS) {
    const option = MENU_ACCENT_OPTIONS[value];
    lines.push(`- \`${value}\` — ${option.label}. ${option.note}`);
  }
  lines.push("", "### Menu surface — the popover treatment");
  for (const value of PRESET_MENU_COLORS) {
    const option = MENU_COLOR_OPTIONS[value];
    lines.push(`- \`${value}\` — ${option.label}. ${option.note}`);
  }
  lines.push(
    "",
    "### Validity facts",
    ...THEME_CONSTRAINTS.map((constraint) => `- ${constraint}`),
  );
  return lines.join("\n");
}

/** Critical shadcn component rules, distilled from the official skill. */
export const SHADCN_COMPONENT_RULES = [
  "Use `components/ui` components first. Start with the installed primitive and its `variant`/`size` props before writing custom markup; these components already handle semantic colors, focus, disabled, loading, overflow and accessibility.",
  "Use the generated tokens for every color, font, radius and shadow. Raw Tailwind palette classes (`sky-600`, `zinc-900`, `emerald-500`), arbitrary color/font/radius values (`bg-[#...]`, `text-[15px]`, `rounded-[13px]`) and one-off styles are forbidden; structural utilities (`flex`, `grid`, `gap-*`, `p-*`, `max-w-*`) are fine.",
  "`className` is for layout and composition only. Do not use it to override a component's colors, typography, radius, shadow or states; use the component's variants.",
  "Use `gap-*`, not `space-x-*`/`space-y-*`; use `size-*` when width and height are equal; use `truncate`; use `cn()` for conditional classes.",
  "Do not add manual `dark:` color overrides; semantic tokens already switch. Do not add `z-index` to overlay components.",
  "Forms use `FieldGroup` + `Field`; `InputGroup` must contain `InputGroupInput`/`InputGroupTextarea`; 2–7 choices use `ToggleGroup`; grouped checkboxes/radios use `FieldSet` + `FieldLegend`.",
  "Items go inside their Group (`SelectItem` in `SelectGroup`, `DropdownMenuItem` in `DropdownMenuGroup`, `CommandItem` in `CommandGroup`).",
  "Dialog, Sheet and Drawer always need a Title (visually hidden is fine). Use full Card composition. `Button` has no `isPending`; compose `Spinner` + `disabled`.",
  "`TabsTrigger` must be inside `TabsList`; `Avatar` always needs `AvatarFallback`; use `Separator`, `Skeleton`, `Badge`, `Alert` and `Empty` instead of custom markup.",
  "Icons come from the package already used by the project, or the exact package named in DESIGN.md. In `Button`, use `data-icon=\"inline-start\"` or `data-icon=\"inline-end\"`; do not add sizing classes inside components; pass icon components, not string keys.",
  "Toast uses the Base UI `toast` component.",
].join("\n");
