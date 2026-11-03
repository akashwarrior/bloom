export type DesignViolation = {
  path: string;
  line: number;
  kind: "raw-color" | "hand-rolled-ui" | "reference-brand" | "copied-copy" | "copied-claim" | "invented-stat" | "fabricated-proof" | "decorative-glow" | "glassmorphism";
  excerpt: string;
  fix: string;
};

type ReferenceCopy = {
  brands: string[];
  headings: string[];
};

const COLOR_PREFIXES =
  "bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|from|via|to|fill|stroke|outline|decoration|divide|placeholder|caret|accent|shadow|inset-shadow|drop-shadow";
const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe";
const RAW_PALETTE_CLASS = new RegExp(
  `(?<![\\w-])(?:[a-z0-9@\\[\\]&_:-]+:)?!?(?:${COLOR_PREFIXES})-(?:(?:${PALETTE})-(?:50|[1-9]00|950)|white|black)(?:\\/\\[?[\\d.]+%?\\]?)?(?![\\w-])`,
  "g",
);
const ARBITRARY_COLOR_CLASS = new RegExp(
  `(?<![\\w-])(?:[a-z0-9@\\[\\]&_:-]+:)?!?(?:${COLOR_PREFIXES})-\\[(?:#|rgb|rgba|hsl|hsla|oklch|oklab|color-mix)[^\\]]*\\]`,
  "g",
);

const STOPWORDS = new Set(
  "a an and are as at be by for from has have in into is it its of on or our the their this to up we with you your".split(" "),
);

function isLintedSource(path: string) {
  return (
    /\.(?:tsx|jsx|ts|js|mdx)$/i.test(path) &&
    !path.startsWith("components/ui/") &&
    !path.startsWith("node_modules/") &&
    !path.startsWith("app/b/") &&
    !/(?:^|\/)route\.ts$/.test(path)
  );
}

function normalizeWords(value: string) {
  return value
    .toLowerCase()
    .replace(/&amp;|&apos;|&quot;|&#39;/g, " ")
    .replace(/[^a-z0-9%$+.★]+/g, " ")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function shingles(words: string[], size: number) {
  const result: string[] = [];
  for (let index = 0; index + size <= words.length; index += 1) {
    const window = words.slice(index, index + size);
    if (window.filter((word) => STOPWORDS.has(word)).length >= size - 1) continue;
    result.push(window.join(" "));
  }
  return result;
}

function claimTokens(text: string) {
  return [
    ...text.matchAll(/(?:[$€£]\s?\d[\d,.]*\s?(?:k|m|mm|b|bn)?\b|\d[\d,.]*\s?(?:%|\+|★|x\b|k\+?|mm\+?|m\+|b\+|bn\b))/gi),
  ]
    .map((match) => match[0].toLowerCase().replace(/\s+/g, ""))
    .filter((token) => /\d/.test(token) && token.length >= 2);
}

const INVENTED_STAT_PATTERNS = [
  /[$€£]\s?\d[\d,.]*\s?(?:k|m|mm|b|bn|t)\+?(?![a-z])/i,
  /\b\d[\d,.]*\s?(?:k|m|mm|b|bn)\+(?![a-z])/i,
  /\b\d[\d,.]*\s?(?:k|m|mm|b|bn)?\+?\s+(?:[a-z][\w-]*\s+){0,3}(?:users|customers|clients|downloads|installs|members|traders|holders|investors|people|individuals|providers|countries|teams|companies|businesses|developers|creators|wallets|transactions|reviews)\b/i,
  /\b(?:millions|thousands|billions|hundreds of thousands)\s+of\s+(?:[a-z][\w-]*\s+){0,2}(?:users|customers|clients|traders|holders|investors|people|individuals|teams|companies|businesses|developers|creators|members)\b/i,
  /\b\d[\d,.]*\+\s+(?:[a-z][\w-]*\s+){0,3}(?:networks|chains|blockchains|dexs?|exchanges|integrations|partners|countries|assets|tokens|coins|apps|dapps|currencies|languages)\b/i,
  /\b\d+(?:\.\d+)?\s?%\s?(?:apy|apr|cashback|back|uptime|faster|cheaper|savings|yield|returns?|accuracy|precision|sla|reliability|satisfaction)\b/i,
  /\b(?:soc\s?2|iso\s?27001|hipaa|pci[- ]?dss|fedramp)(?:\s+type\s+(?:ii|i|1|2))?\s+(?:certified|compliant|audited|attested|verified)\b/i,
  /\bsav(?:e|es|ing)\s+(?:up to\s+)?\d+(?:\.\d+)?\+?\s*(?:hours|hrs|minutes|mins|days|weeks)\b/i,
  /\b(?:up to|earn|get)\s+\d+(?:\.\d+)?\s?%/i,
  /(?<![\w\[/-])[1-5](?:\.\d)?\s?(?:★|stars?\b|\/\s?5\b)/i,
];

const NATIVE_CONTROL = /<(button|input|select|textarea|table)\b/g;
const SHADCN_FOR: Record<string, string> = {
  button: "Button from @/components/ui/button",
  input: "Input (or InputGroup) from @/components/ui/input",
  select: "Select or NativeSelect from @/components/ui/select / native-select",
  textarea: "Textarea from @/components/ui/textarea",
  table: "Table from @/components/ui/table",
};
const LINK_CLASSES = /<(?:a|Link)\b[^>]*?className=(?:"([^"]*)"|\{?`([^`]*)`)/g;
const ROUNDED_FULL = /(?:^|[\s"'`])rounded-full(?:[\s"'`]|$)/;
const NON_BACKDROP_BLUR = /(?:^|[\s"'`])blur-(?:sm|md|lg|xl|2xl|3xl|\[[^\]]+\])(?:[\s"'`]|$)/;
const DECORATIVE_FILL = /(?:^|[\s"'`])(?:bg|from|via|to)-[^\s"'`]+/;
const BACKDROP_BLUR = /(?:^|[\s"'`])backdrop-blur(?:-\w+)?(?:[\s"'`]|$)/;
const TRANSLUCENT_FILL = /(?:^|[\s"'`])bg-[\w-]+\/\d{1,3}(?:[\s"'`]|$)/;

/** A link carrying a fill, horizontal padding and rounding: a hand-made button. */
function buttonLookalike(text: string) {
  return [...text.matchAll(LINK_CLASSES)].some((match) => {
    const classes = match[1] ?? match[2] ?? "";
    return /(?:^|\s)bg-/.test(classes) && /(?:^|\s)px-/.test(classes) && /(?:^|\s)rounded/.test(classes);
  });
}

/** A line of bare JSX text (copy continued from a previous line), not code. */
const JSX_TEXT_LINE = /^\s*[A-Za-z][^<>{}=;()]*$/;
const FABRICATED_PROOF_FILE = /(?:testimonial|review|social-proof|customer-quote|press-quote)s?(?:-section)?\.(?:tsx|jsx)$/i;
const NAMED_ENDORSEMENT = /\b(?:audited|backed|funded|certified|trusted|used|loved|recommended|endorsed|insured|partnered|powered) by\s+(?:the\s+)?([\w.&-]+)/gi;

/** "Audited by CertiK", "Backed by a16z": an endorsement by a named organization nobody provided. */
function namedEndorsement(text: string) {
  return [...text.matchAll(NAMED_ENDORSEMENT)].find((match) => /^[A-Z]/.test(match[1] ?? ""))?.[0];
}
const FABRICATED_PROOF_LINE = /\bverified (?:buyer|subscriber|customer|purchaser|purchase|user|owner|member|reviewer)\b|\b(?:rated|rating)\s+\d(?:\.\d)?\s*(?:\/\s*5|out of 5|stars?)\b|★{3,}|\baward[- ]winning\b|\b(?:studio|agency|site) of the (?:year|day)\b|\bgrand prix\b|\bblack pencil\b|\bcannes lions?\b|\b(?:webby|red dot|awwwards|fwa|css design awards?|d&ad)\b/i;

function contentWords(words: string[], brandTokens: Set<string>) {
  return new Set(words.filter((word) => word.length > 2 && !STOPWORDS.has(word) && !brandTokens.has(word) && !/\d/.test(word)));
}

/** The human-readable text of a source line: its string literals and JSX text, without prop names. */
function literalText(line: string) {
  const parts = [...line.matchAll(/"([^"]{8,})"|'([^']{8,})'|`([^`]{8,})`|>([^<>{}]{8,})</g)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? match[4] ?? "");
  return parts.length > 0 ? parts.join(" ") : line;
}

/** A line that rewords a reference headline: most of its content words are the headline's. */
function paraphrasedHeading(words: string[], headings: Array<{ heading: string; words: Set<string> }>) {
  if (words.length < 4 || words.length > 24) return undefined;
  const line = contentWords(words, new Set());
  if (line.size < 3) return undefined;
  for (const { heading, words: target } of headings) {
    const shared = [...line].filter((word) => target.has(word)).length;
    const union = new Set([...line, ...target]).size;
    if (shared >= 4 && shared / union >= 0.5) return heading;
  }
  return undefined;
}

/** Lines present in `after` but not in `before`, with 1-based line numbers. */
function addedLines(before: string | null, after: string) {
  const previous = new Map<string, number>();
  for (const line of (before ?? "").split("\n")) {
    const key = line.trim();
    previous.set(key, (previous.get(key) ?? 0) + 1);
  }
  const added: Array<{ line: number; text: string }> = [];
  after.split("\n").forEach((text, index) => {
    const key = text.trim();
    const remaining = previous.get(key) ?? 0;
    if (remaining > 0) {
      previous.set(key, remaining - 1);
      return;
    }
    if (key) added.push({ line: index + 1, text });
  });
  return added;
}

function excerpt(text: string) {
  const trimmed = text.trim();
  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
}

/**
 * Flags newly written source lines that bypass the design tokens or reuse a
 * reference site's brand, headlines, or claims.
 */
export function lintSourceChange({
  path,
  before,
  after,
  reference,
}: {
  path: string;
  before: string | null;
  after: string;
  reference: ReferenceCopy | null;
}): DesignViolation[] {
  if (!isLintedSource(path)) return [];
  const violations: DesignViolation[] = [];
  const lines = addedLines(before, after);
  const brands = (reference?.brands ?? [])
    .map((brand) => brand.trim().toLowerCase())
    .filter((brand) => brand.length >= 3);
  const headingShingles = new Set(
    (reference?.headings ?? []).flatMap((heading) => {
      const words = normalizeWords(heading);
      return words.length >= 5 ? shingles(words, 5) : [];
    }),
  );
  const brandTokens = new Set(brands.flatMap((brand) => normalizeWords(brand)));
  const withBrandPlaceholder = (words: string[]) =>
    words.map((word) => (brandTokens.has(word) ? "{brand}" : word)).join(" ");
  const headingWordSets = (reference?.headings ?? [])
    .map((heading) => ({ heading, words: contentWords(normalizeWords(heading), brandTokens) }))
    .filter((entry) => entry.words.size >= 4);
  const shortHeadlines = new Set(
    (reference?.headings ?? []).flatMap((heading) => {
      const words = normalizeWords(heading);
      const meaningful = words.filter((word) => !STOPWORDS.has(word) && !brandTokens.has(word));
      return words.length >= 3 && words.length <= 4 && meaningful.length >= 2
        ? [withBrandPlaceholder(words)]
        : [];
    }),
  );
  const referenceClaims = new Set(
    (reference?.headings ?? []).flatMap((heading) => claimTokens(heading)),
  );

  const fileName = path.split("/").at(-1) ?? "";
  if (before === null && FABRICATED_PROOF_FILE.test(fileName)) {
    violations.push({
      path,
      line: 1,
      kind: "fabricated-proof",
      excerpt: fileName,
      fix: "Nobody provided real testimonials, reviews, or ratings. Delete this section (and its import in app/page.tsx) or replace it with a non-fabricated section: how it works, use cases, or a statement in the brand's own voice.",
    });
  }

  for (const { line, text } of lines) {
    if (/^\s*(?:import|export\s+\*|\/\/|\/\*|\*)/.test(text)) continue;
    const proof = FABRICATED_PROOF_LINE.exec(text)?.[0] ?? namedEndorsement(literalText(text));
    if (proof) {
      violations.push({
        path,
        line,
        kind: "fabricated-proof",
        excerpt: excerpt(text),
        fix: `"${proof}" presents an invented customer, review, rating, or endorsement by a named organization as real. Remove it; never fabricate testimonials, reviewer names, star ratings, auditors, investors, or partners.`,
      });
    }
    for (const match of text.matchAll(NATIVE_CONTROL)) {
      violations.push({
        path,
        line,
        kind: "hand-rolled-ui",
        excerpt: excerpt(text),
        fix: `A native <${match[1]}> skips the shadcn theme. Use ${SHADCN_FOR[match[1]!]} and style it with variants or className.`,
      });
    }
    if (buttonLookalike(text)) {
      violations.push({
        path,
        line,
        kind: "hand-rolled-ui",
        excerpt: excerpt(text),
        fix: 'A link styled as a button skips the shadcn theme. Use <Button render={<a href="..." />} nativeButton={false}> (or render={<Link href="..." />}) with a variant and size.',
      });
    }
    for (const match of text.matchAll(RAW_PALETTE_CLASS)) {
      violations.push({
        path,
        line,
        kind: "raw-color",
        excerpt: match[0],
        fix: "Replace with a semantic token class (bg-background, bg-card, bg-muted, bg-primary, text-muted-foreground, border-border, ...).",
      });
    }
    for (const match of text.matchAll(ARBITRARY_COLOR_CLASS)) {
      violations.push({
        path,
        line,
        kind: "raw-color",
        excerpt: match[0],
        fix: "Arbitrary color values bypass the design system. Use a semantic token class; if a genuinely new color is needed, change the preset instead of writing it in JSX.",
      });
    }
    if (ROUNDED_FULL.test(text) && NON_BACKDROP_BLUR.test(text) && DECORATIVE_FILL.test(text)) {
      violations.push({
        path,
        line,
        kind: "decorative-glow",
        excerpt: excerpt(text),
        fix: "A blurred rounded fill is a decorative glow blob. Remove it; build depth with real imagery, a solid surface, a border, or typographic scale instead.",
      });
    }
    if (BACKDROP_BLUR.test(text) && TRANSLUCENT_FILL.test(text)) {
      violations.push({
        path,
        line,
        kind: "glassmorphism",
        excerpt: excerpt(text),
        fix: "A backdrop blur over a translucent fill is glassmorphism. Use a solid semantic surface (bg-background, bg-card, bg-muted) with a border-border hairline instead.",
      });
    }
    const lower = text.toLowerCase();
    for (const brand of brands) {
      if (new RegExp(`(?<![a-z0-9])${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).test(lower)) {
        violations.push({
          path,
          line,
          kind: "reference-brand",
          excerpt: excerpt(text),
          fix: `"${brand}" is a reference brand. Use the brand name from the user's request instead.`,
        });
      }
    }
    if (headingShingles.size > 0 || shortHeadlines.size > 0) {
      const words = normalizeWords(text);
      const placeholderLine = ` ${withBrandPlaceholder(words)} `;
      const copied = shingles(words, 5).find((shingle) => headingShingles.has(shingle)) ??
        [...shortHeadlines].find((headline) => placeholderLine.includes(` ${headline} `)) ??
        paraphrasedHeading(normalizeWords(literalText(text)), headingWordSets);
      if (copied) {
        violations.push({
          path,
          line,
          kind: "copied-copy",
          excerpt: excerpt(text),
          fix: `"${copied}" is copied from a reference headline. Write original copy for this page.`,
        });
      }
    }
    const claim = referenceClaims.size > 0
      ? claimTokens(text).find((token) => referenceClaims.has(token))
      : undefined;
    if (claim) {
      violations.push({
        path,
        line,
        kind: "copied-claim",
        excerpt: excerpt(text),
        fix: `"${claim}" is a reference site's claim. Do not reuse or invent stats, ratings, user counts, prices, APY, or cashback; write qualitative copy instead.`,
      });
    } else if (/["'>`]/.test(text) || JSX_TEXT_LINE.test(text)) {
      const stat = INVENTED_STAT_PATTERNS.map((pattern) => pattern.exec(text)?.[0]).find(Boolean);
      if (stat) {
        violations.push({
          path,
          line,
          kind: "invented-stat",
          excerpt: excerpt(text),
          fix: `"${stat.trim()}" reads as a factual claim (usage, money, rating, or rate) that nobody provided. Remove it or replace it with qualitative copy. Numbers inside a clearly fictional product UI mockup (balances, prices in a chart) are fine; marketing claims are not.`,
        });
      }
    }
  }

  return violations;
}

export function summarizeViolations(violations: DesignViolation[], limit = 12) {
  return violations.slice(0, limit).map(
    (violation) => `${violation.path}:${violation.line} [${violation.kind}] ${violation.excerpt} -> ${violation.fix}`,
  );
}
