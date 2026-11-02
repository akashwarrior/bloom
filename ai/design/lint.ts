export type DesignViolation = {
  path: string;
  line: number;
  kind: "hand-rolled-ui" | "invented-stat" | "fabricated-proof";
  excerpt: string;
  fix: string;
};

function isLintedSource(path: string) {
  return (
    /\.(?:tsx|jsx|ts|js|mdx)$/i.test(path) &&
    !path.startsWith("node_modules/") &&
    !path.startsWith("app/b/") &&
    !/(?:^|\/)route\.ts$/.test(path)
  );
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

/** Widget roles ui-sdk ships a component for; hand-writing one loses its keyboard, focus and dismissal handling. */
const UI_SDK_FOR_ROLE: Record<string, string> = {
  dialog: "dialog",
  alertdialog: "alert-dialog",
  menu: "menu",
  menubar: "menubar",
  listbox: "listbox or select",
  combobox: "combobox",
  tablist: "tabs",
  switch: "switch",
  slider: "slider",
  radiogroup: "radio",
  tooltip: "tooltip",
  tree: "tree",
  toolbar: "toolbar",
};
const WIDGET_ROLE = new RegExp(`\\brole=(?:"|'|\\{["'])(${Object.keys(UI_SDK_FOR_ROLE).join("|")})["']`, "g");

/** A line of bare JSX text (copy continued from a previous line), not code. */
const JSX_TEXT_LINE = /^\s*[A-Za-z][^<>{}=;()]*$/;
const FABRICATED_PROOF_FILE = /(?:testimonial|review|social-proof|customer-quote|press-quote)s?(?:-section)?\.(?:tsx|jsx)$/i;
const NAMED_ENDORSEMENT = /\b(?:audited|backed|funded|certified|trusted|used|loved|recommended|endorsed|insured|partnered|powered) by\s+(?:the\s+)?([\w.&-]+)/gi;

/** "Audited by CertiK", "Backed by a16z": an endorsement by a named organization nobody provided. */
function namedEndorsement(text: string) {
  return [...text.matchAll(NAMED_ENDORSEMENT)].find((match) => /^[A-Z]/.test(match[1] ?? ""))?.[0];
}
const FABRICATED_PROOF_LINE = /\bverified (?:buyer|subscriber|customer|purchaser|purchase|user|owner|member|reviewer)\b|\b(?:rated|rating)\s+\d(?:\.\d)?\s*(?:\/\s*5|out of 5|stars?)\b|★{3,}|\baward[- ]winning\b|\b(?:studio|agency|site) of the (?:year|day)\b|\bgrand prix\b|\bblack pencil\b|\bcannes lions?\b|\b(?:webby|red dot|awwwards|fwa|css design awards?|d&ad)\b/i;

/** The human-readable text of a source line: its string literals and JSX text, without prop names. */
function literalText(line: string) {
  const parts = [...line.matchAll(/"([^"]{8,})"|'([^']{8,})'|`([^`]{8,})`|>([^<>{}]{8,})</g)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? match[4] ?? "");
  return parts.length > 0 ? parts.join(" ") : line;
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
 * Flags newly written source lines that invent proof or hand-roll a widget ui-sdk ships.
 */
export function lintSourceChange({
  path,
  before,
  after,
}: {
  path: string;
  before: string | null;
  after: string;
}): DesignViolation[] {
  if (!isLintedSource(path)) return [];
  const violations: DesignViolation[] = [];
  const lines = addedLines(before, after);

  const fileName = path.split("/").at(-1) ?? "";
  if (before === null && FABRICATED_PROOF_FILE.test(fileName)) {
    violations.push({
      path,
      line: 1,
      kind: "fabricated-proof",
      excerpt: fileName,
      fix: "Nobody provided real testimonials, reviews, or ratings. Remove unsupported claims and any content that depended on them. Keep only what the request needs.",
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
    for (const match of text.matchAll(WIDGET_ROLE)) {
      violations.push({
        path,
        line,
        kind: "hand-rolled-ui",
        excerpt: excerpt(text),
        fix: `A hand-written role="${match[1]}" has no keyboard, focus or dismissal handling. Use ui-sdk's ${UI_SDK_FOR_ROLE[match[1]!]} component (uiDocs shows its parts) and style it for this design.`,
      });
    }
    if (/["'>`]/.test(text) || JSX_TEXT_LINE.test(text)) {
      const stat = INVENTED_STAT_PATTERNS.map((pattern) => pattern.exec(text)?.[0]).find(Boolean);
      if (stat) {
        violations.push({
          path,
          line,
          kind: "invented-stat",
          excerpt: excerpt(text),
          fix: `Check "${stat.trim()}" against the user's source material. If unsupported, remove the claim and its supporting decoration. Rewording it still makes the same claim. Clearly illustrative product data can stay.`,
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
