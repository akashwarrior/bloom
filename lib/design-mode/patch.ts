import { extendTailwindMerge } from "tailwind-merge";

import type { ElementSelection } from "@/ai/message/metadata";
import { locateElement } from "../element-selection.ts";
import { DESIGN_PROPS, editClass, type DesignEdits } from "./styles.ts";

type SourceFile = { path: string; content: string };

export type DesignPatchInput = {
  selection: ElementSelection;
  edits: DesignEdits;
  text?: { from: string; to: string };
};

export type DesignPatchResult =
  | { ok: true; path: string; content: string; line: number; classes: string[] }
  | { ok: false; error: string };

const BREAKPOINT_VARIANT = /^(?:sm|md|lg|xl|2xl|min-\[[^\]]+\]|max-\w+|max-\[[^\]]+\]):/;

/** A tailwind-merge that knows the project's own theme names (text-display, bg-surface-2, shadow-card, ...). */
function projectMerger(files: SourceFile[]) {
  const css = files.filter((file) => file.path.endsWith(".css")).map((file) => file.content).join("\n");
  const names = (prefix: string) => [
    ...new Set(
      [...css.matchAll(new RegExp(`--${prefix}-([a-z0-9-]+?)\\s*:`, "g"))]
        .map((match) => match[1]!)
        .filter((name) => !name.includes("--")),
    ),
  ];
  return extendTailwindMerge({
    extend: {
      theme: {
        text: names("text"),
        color: names("color"),
        font: names("font"),
        shadow: names("shadow"),
        radius: names("radius"),
        tracking: names("tracking"),
        leading: names("leading"),
      },
    },
  });
}

/** Two classes set the same property when each one overrides the other (leading-* survives a later text-size). */
function sameProperty(a: string, b: string, merge: (value: string) => string) {
  return !merge(`${a} ${b}`).split(" ").includes(a) && !merge(`${b} ${a}`).split(" ").includes(b);
}

function mergeClasses(existing: string, added: string[], merge: (value: string) => string) {
  const kept = existing.split(/\s+/).filter(Boolean).filter((name) => {
    const base = name.replace(BREAKPOINT_VARIANT, "");
    if (base !== name && base.includes(":")) return true;
    return added.every((add) => !sameProperty(base, add, merge));
  });
  return [...new Set([...kept, ...added])].join(" ");
}

/** Index of the `>` that closes the JSX opening tag starting at `start` (the `<`). */
function openingTagEnd(content: string, start: number) {
  let depth = 0;
  let quote: string | null = null;
  for (let index = start + 1; index < content.length; index += 1) {
    const char = content[index]!;
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === ">" && depth === 0) return index;
  }
  return -1;
}

function anchorOffset(content: string, line: number, selection: ElementSelection, by: string) {
  const lines = content.split("\n");
  const lineStart = lines.slice(0, line - 1).reduce((total, text) => total + text.length + 1, 0);
  const text = lines[line - 1] ?? "";
  const words = selection.text.replace(/\s+/g, " ").trim().split(" ").slice(0, 4).join(" ");
  const column = by === "classes"
    ? Math.max(text.indexOf("className"), text.indexOf("class="), 0)
    : Math.max(words ? text.indexOf(words) : 0, 0);
  return lineStart + column;
}

function openingTag(content: string, anchor: number, selection: ElementSelection) {
  const head = content.slice(Math.max(0, anchor - 4000), anchor + 1);
  const offset = Math.max(0, anchor - 4000);
  const candidates = [...head.matchAll(/<([A-Za-z][\w.]*)/g)].reverse();
  for (const candidate of candidates) {
    const name = candidate[1]!;
    const start = offset + candidate.index!;
    if (name.toLowerCase() !== selection.tag && !selection.components.includes(name)) continue;
    const end = openingTagEnd(content, start);
    if (end === -1) continue;
    if (end < anchor && content[end - 1] === "/") continue;
    return { name, start, end, nameEnd: start + 1 + name.length };
  }
  return null;
}

function classLiteral(content: string, from: number, to: number) {
  const attrs = content.slice(from, to);
  const attribute = /\bclassName\s*=\s*/.exec(attrs);
  if (!attribute) return null;
  let index = from + attribute.index + attribute[0].length;
  if (content[index] === "{") {
    index += 1;
    while (/\s/.test(content[index] ?? "")) index += 1;
    const call = /^(?:cn|clsx|cx|twMerge|classNames)\(\s*/.exec(content.slice(index, index + 20));
    if (call) index += call[0].length;
  }
  const quote = content[index];
  if (quote !== '"' && quote !== "'" && quote !== "`") return "dynamic" as const;
  const close = content.indexOf(quote, index + 1);
  if (close === -1 || close > to) return "dynamic" as const;
  const value = content.slice(index + 1, close);
  if (quote === "`" && value.includes("${")) return "dynamic" as const;
  return { start: index + 1, end: close, value };
}

function jsxText(value: string) {
  return /[{}<>]/.test(value) ? `{${JSON.stringify(value)}}` : value;
}

/** Writes design-panel edits into the JSX that renders the selected element. */
export function patchElementSource(files: SourceFile[], input: DesignPatchInput): DesignPatchResult {
  const { owner, match } = locateElement(input.selection, files);
  if (!owner) return { ok: false, error: "Couldn't find the component that renders this element." };
  if (!match) return { ok: false, error: `Couldn't find this element inside ${owner.file.path}.` };

  let content = owner.file.content;
  const anchor = anchorOffset(content, match.line, input.selection, match.by);
  const tag = openingTag(content, anchor, input.selection);
  if (!tag) return { ok: false, error: `Couldn't find the <${input.selection.tag}> tag in ${owner.file.path}.` };

  if (input.text && input.text.from.trim() !== input.text.to.trim()) {
    const from = input.text.from.trim();
    const region = content.slice(tag.end + 1, tag.end + 1 + 4000);
    const index = region.indexOf(from);
    if (!from || index === -1) {
      return { ok: false, error: "This text is built from code or spans several lines, so it can't be edited in place." };
    }
    const at = tag.end + 1 + index;
    content = `${content.slice(0, at)}${jsxText(input.text.to.trim())}${content.slice(at + from.length)}`;
  }

  const classes = DESIGN_PROPS.flatMap((prop) => {
    const value = input.edits[prop];
    const name = value === undefined ? null : editClass(prop, value);
    return name ? [name] : [];
  });

  if (classes.length > 0) {
    const merge = projectMerger(files);
    const literal = classLiteral(content, tag.nameEnd, tag.end);
    if (literal === "dynamic") {
      return { ok: false, error: "This element's className is computed in code, so it can't be edited in place." };
    }
    content = literal
      ? `${content.slice(0, literal.start)}${mergeClasses(literal.value, classes, merge)}${content.slice(literal.end)}`
      : `${content.slice(0, tag.nameEnd)} className="${classes.join(" ")}"${content.slice(tag.nameEnd)}`;
  }

  if (content === owner.file.content) return { ok: false, error: "Nothing to apply." };
  return {
    ok: true,
    path: owner.file.path,
    content,
    line: content.slice(0, tag.start).split("\n").length,
    classes,
  };
}
