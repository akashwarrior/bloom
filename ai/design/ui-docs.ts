/**
 * Reads ui-sdk's documentation from the project's own node_modules, so it
 * matches the installed version. A component page runs to 60 KB; the builder
 * gets the part that decides how to use it (what it is, a working example, how
 * its parts nest, the attributes to style from) and asks for further sections
 * by name.
 */

export type UiDocsRequest = Array<{ name: string; section: string | null }>;

export type UiDocsPage = {
  name: string;
  section: string | null;
  content: string;
  /** Sections of the page that were not returned. */
  otherSections: string[];
  truncated: boolean;
};

export type UiDocsResult = {
  pages: UiDocsPage[];
  /** Names that match no page, with every available name so the next call can be exact. */
  unknown: string[];
  available: string[];
};

/** Sections every digest carries when the page has them, each up to this many characters. The opening of a page is its description and a working example. */
const DIGEST_SECTIONS: Record<string, number> = { "": 3_000, Composition: 1_500, Usage: 2_000, Styling: 1_200, "Data Attributes": 3_000 };
const SECTION_LIMIT = 9_000;

/**
 * Runs inside the project runtime: `node -e SCRIPT <request json>`. It prints a
 * `UiDocsResult` as JSON. Plain CommonJS with no dependencies.
 */
export const UI_DOCS_SCRIPT = `
const fs = require("node:fs");
const path = require("node:path");
const docs = path.join(process.cwd(), "node_modules/@ui-sdk/react/docs");
const DIGEST = ${JSON.stringify(DIGEST_SECTIONS)};
const SECTION_LIMIT = ${SECTION_LIMIT};
// Indexes and whole-library files; far too large to hand over and not about one component.
const SKIPPED = new Set(["README", "llms", "core", "agents"]);

const names = (dir) => fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((file) => file.endsWith(".md")).map((file) => file.slice(0, -3)).filter((name) => !SKIPPED.has(name))
  : [];
const components = names(path.join(docs, "components"));
const guides = names(docs);
const key = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, "");

function locate(name) {
  const wanted = key(name);
  const component = components.find((entry) => key(entry) === wanted);
  if (component) return path.join(docs, "components", component + ".md");
  const guide = guides.find((entry) => key(entry) === wanted);
  return guide ? path.join(docs, guide + ".md") : null;
}

function split(markdown) {
  const parts = [{ title: "", lines: [] }];
  let fenced = false;
  for (const line of markdown.split("\\n")) {
    if (line.startsWith("\`\`\`")) fenced = !fenced;
    const heading = !fenced && /^## (.+)$/.exec(line);
    if (heading) parts.push({ title: heading[1].trim(), lines: [line] });
    else parts.at(-1).lines.push(line);
  }
  return parts.map((part) => ({ title: part.title, body: part.lines.join("\\n").trim() }));
}

function clip(text, limit) {
  if (text.length <= limit) return { text, truncated: false };
  const cut = text.lastIndexOf("\\n", limit);
  return { text: text.slice(0, cut > limit / 2 ? cut : limit) + "\\n[Section continues; request it by name to read it in full.]", truncated: true };
}

const pages = [];
const unknown = [];
for (const request of JSON.parse(process.argv[1])) {
  const file = locate(request.name);
  if (!file) {
    unknown.push(request.name);
    continue;
  }
  const parts = split(fs.readFileSync(file, "utf8"));
  const titles = parts.map((part) => part.title).filter(Boolean);
  if (request.section) {
    const wanted = key(request.section);
    const match = parts.find((part) => part.title && key(part.title) === wanted) ?? parts.find((part) => part.title && key(part.title).startsWith(wanted));
    if (!match) {
      pages.push({ name: request.name, section: request.section, content: "No section named \\"" + request.section + "\\" on this page.", otherSections: titles, truncated: false });
      continue;
    }
    const body = clip(match.body, SECTION_LIMIT);
    pages.push({ name: request.name, section: match.title, content: body.text, otherSections: titles.filter((title) => title !== match.title), truncated: body.truncated });
    continue;
  }
  const isComponent = file.includes(path.sep + "components" + path.sep);
  const chosen = isComponent ? parts.filter((part) => part.title in DIGEST) : parts;
  let truncated = false;
  const content = chosen.map((part) => {
    const body = clip(part.body, isComponent ? DIGEST[part.title] : SECTION_LIMIT);
    truncated = truncated || body.truncated;
    return body.text;
  }).join("\\n\\n");
  const whole = isComponent ? { text: content, truncated: false } : clip(content, SECTION_LIMIT);
  pages.push({
    name: request.name,
    section: null,
    content: whole.text,
    // A clipped section stays listed, so it can be requested in full.
    otherSections: titles.filter((title) => title !== "Installation" && (!chosen.some((part) => part.title === title) || (isComponent && parts.find((part) => part.title === title).body.length > DIGEST[title]))),
    truncated: truncated || whole.truncated,
  });
}
process.stdout.write(JSON.stringify({ pages, unknown, available: unknown.length ? [...components, ...guides] : [] }));
`;

/** The result as the builder reads it: documentation as plain Markdown, not JSON-escaped. */
export function formatUiDocs(result: UiDocsResult) {
  const blocks = result.pages.map((page) => [
    `# ui-sdk: ${page.name}${page.section ? ` — ${page.section}` : ""}`,
    page.content,
    page.otherSections.length > 0 ? `Other sections of this page (request by name): ${page.otherSections.join(", ")}.` : "",
  ].filter(Boolean).join("\n\n"));
  if (result.unknown.length > 0) {
    blocks.push(`No page for: ${result.unknown.join(", ")}. Available: ${result.available.join(", ")}.`);
  }
  return blocks.join("\n\n---\n\n");
}
