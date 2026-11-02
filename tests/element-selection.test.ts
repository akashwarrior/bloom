import assert from "node:assert/strict";
import test from "node:test";

import { describeSelections } from "../lib/element-selection.ts";

const files = [
  {
    path: "components/ui/button.tsx",
    content: "export function Button(props) {\n  return <button {...props} />;\n}\n",
  },
  {
    path: "components/hero.tsx",
    content: [
      "import { Button } from \"@/components/ui/button\";",
      "",
      "export function Hero() {",
      "  return (",
      "    <section className=\"py-section bg-surface-1\">",
      "      <h1 className=\"font-display text-6xl tracking-tight\">Learn languages from what you love</h1>",
      "      <Button className=\"mt-8 rounded-full px-6\">Start free</Button>",
      "    </section>",
      "  );",
      "}",
    ].join("\n"),
  },
];

const base = { route: "/", selector: "section > h1", html: "<h1>…</h1>" };

test("selections resolve to the owning section file and the element's line", () => {
  const context = describeSelections(
    [
      { ...base, tag: "h1", components: ["Hero", "Home"], classes: "font-display text-6xl tracking-tight", text: "Learn languages from what you love" },
      { ...base, tag: "button", components: ["Button", "Hero"], classes: "mt-8 rounded-full px-6 inline-flex", text: "" },
    ],
    files,
  );

  assert.match(context, /source: components\/hero\.tsx:6 \(matched by text\)/);
  assert.match(context, /source: components\/hero\.tsx:7 \(matched by classes\)/);
  assert.match(context, /component chain: Button \(components\/ui\/button\.tsx:1\) < Hero \(components\/hero\.tsx:3\)/);
});

test("unknown components fall back to a search hint", () => {
  const context = describeSelections(
    [{ ...base, tag: "div", components: [], classes: "", text: "" }],
    files,
  );
  assert.match(context, /not resolved/);
});

test("containers with long text resolve by their classes", () => {
  const context = describeSelections(
    [{ ...base, tag: "section", components: ["Hero"], classes: "py-section bg-surface-1", text: "Learn languages from what you love Start free and keep going with stories, songs and shows" }],
    files,
  );
  assert.match(context, /source: components\/hero\.tsx:5 \(matched by classes\)/);
});
