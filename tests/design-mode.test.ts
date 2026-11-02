import assert from "node:assert/strict";
import test from "node:test";

import { patchElementSource } from "../lib/design-mode/patch.ts";
import { editClass, editCss } from "../lib/design-mode/styles.ts";

const globals = {
  path: "app/globals.css",
  content: "@theme inline {\n  --text-display: 4rem;\n  --text-display--font-weight: 700;\n  --color-surface-1: var(--surface-1);\n  --color-primary: var(--primary);\n  --shadow-card: var(--shadow-card-value);\n}\n",
};

const hero = {
  path: "components/hero.tsx",
  content: [
    "import { Button } from \"@/components/ui/button\";",
    "import { cn } from \"@/lib/utils\";",
    "",
    "export function Hero() {",
    "  return (",
    "    <section className={cn(\"py-section bg-surface-1\", \"relative\")}>",
    "      <h1",
    "        className=\"font-display text-display md:text-[96px] tracking-tight text-primary\"",
    "      >",
    "        Learn languages from what you love",
    "      </h1>",
    "      <p>Stories, songs and shows</p>",
    "      <Button className=\"mt-8 rounded-full\">Start free</Button>",
    "    </section>",
    "  );",
    "}",
  ].join("\n"),
};

const files = [globals, hero, { path: "components/ui/button.tsx", content: "export function Button(props) {\n  return <button {...props} />;\n}\n" }];
const selection = (tag: string, components: string[], classes: string, text: string) => ({
  route: "/", tag, components, classes, text, selector: tag, html: `<${tag}>`,
});

test("edits replace conflicting classes, including responsive variants of the same property", () => {
  const result = patchElementSource(files, {
    selection: selection("h1", ["Hero"], "font-display text-display md:text-[96px] tracking-tight text-primary", "Learn languages from what you love"),
    edits: { fontSize: "76", letterSpacing: "-4.94", color: "#171440", fontWeight: "800" },
  });
  assert.ok(result.ok, !result.ok ? result.error : "");
  assert.match(result.content, /className="font-display font-extrabold text-\[76px\] tracking-\[-4\.94px\] text-\[#171440\]"/);
  assert.equal(result.line, 7);
});

test("text edits and classes on a tag without className", () => {
  const result = patchElementSource(files, {
    selection: selection("p", ["Hero"], "", "Stories, songs and shows"),
    edits: { textAlign: "center" },
    text: { from: "Stories, songs and shows", to: "Films, music & {more}" },
  });
  assert.ok(result.ok, !result.ok ? result.error : "");
  assert.match(result.content, /<p className="text-center">\{"Films, music & \{more\}"\}<\/p>/);
});

test("component instances get classes at the usage site and cn() literals are merged", () => {
  const button = patchElementSource(files, {
    selection: selection("button", ["Button", "Hero"], "inline-flex mt-8 rounded-full", "Start free"),
    edits: { borderRadius: "8", boxShadow: "md" },
  });
  assert.ok(button.ok, !button.ok ? button.error : "");
  assert.match(button.content, /<Button className="mt-8 rounded-\[8px\] shadow-md">Start free<\/Button>/);

  const section = patchElementSource(files, {
    selection: selection("section", ["Hero"], "py-section bg-surface-1 relative", "Learn languages from what you love Stories, songs and shows Start free and more text here to be long"),
    edits: { backgroundColor: "token:primary", paddingTop: "0" },
  });
  assert.ok(section.ok, !section.ok ? section.error : "");
  assert.match(section.content, /cn\("py-section pt-0 bg-primary", "relative"\)/);
});

test("css and class mappings agree", () => {
  assert.equal(editCss("fontFamily", "token:display"), "var(--font-display)");
  assert.equal(editClass("fontFamily", "token:display"), "font-display");
  assert.equal(editCss("opacity", "40"), "0.4");
  assert.equal(editClass("opacity", "40"), "opacity-40");
  assert.equal(editClass("width", "100%"), "w-full");
  assert.equal(editClass("justifyContent", "between"), "justify-between");
  assert.equal(editCss("justifyContent", "between"), "space-between");
});
