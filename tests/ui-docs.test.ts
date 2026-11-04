import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { formatUiDocs, UI_DOCS_SCRIPT, type UiDocsRequest, type UiDocsResult } from "../ai/design/ui-docs.ts";

const fence = "```";
const DIALOG = `# Dialog

Open a focused task over the page.

${fence}tsx title="basic.tsx"
import { Dialog, DialogContent } from "@ui-sdk/react/dialog"
## not a heading, this line is inside a code block
${fence}

## Installation

npm install

## Composition

Dialog > DialogTrigger, DialogBackdrop, DialogContent

## Usage

Import the parts and put them together.

## Forms

${"A long explanation of forms in dialogs. ".repeat(400)}

## Styling

Each part has a data-slot.

## Data Attributes

- \`data-open\`: Present while the dialog is open.

## API Reference

- \`modal?\` (\`boolean\`)
`;

function project() {
  const root = mkdtempSync(path.join(tmpdir(), "bloom-ui-docs-"));
  const docs = path.join(root, "node_modules/@ui-sdk/react/docs");
  mkdirSync(path.join(docs, "components"), { recursive: true });
  writeFileSync(path.join(docs, "components/dialog.md"), DIALOG);
  writeFileSync(path.join(docs, "components/alert-dialog.md"), "# Alert Dialog\n\nAsk someone to confirm.\n");
  writeFileSync(path.join(docs, "popups.md"), "# Popups\n\nPlace popup content.\n\n## Focus\n\nWhere focus goes.\n");
  writeFileSync(path.join(docs, "core.md"), "# Core\n");
  return root;
}

function read(request: UiDocsRequest): UiDocsResult {
  const root = project();
  try {
    return JSON.parse(execFileSync(process.execPath, ["-e", UI_DOCS_SCRIPT, JSON.stringify(request)], { cwd: root, encoding: "utf8" }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("a component's overview is its description, example, composition and styling hooks, not the whole page", () => {
  const { pages, unknown } = read([{ name: "Dialog", section: null }]);
  assert.deepEqual(unknown, []);
  const [page] = pages;
  assert.ok(page);
  assert.match(page.content, /^# Dialog\n\nOpen a focused task over the page\./);
  assert.match(page.content, /## not a heading, this line is inside a code block/);
  for (const kept of ["## Composition", "## Usage", "## Styling", "## Data Attributes"]) assert.ok(page.content.includes(kept), kept);
  assert.doesNotMatch(page.content, /## Installation|## Forms|## API Reference/);
  assert.deepEqual(page.otherSections, ["Forms", "API Reference"]);
  assert.equal(page.truncated, false);
});

test("a named section is returned in full up to its limit, matched loosely by heading", () => {
  const { pages } = read([{ name: "dialog", section: "api reference" }, { name: "dialog", section: "forms" }, { name: "dialog", section: "nonsense" }]);
  assert.equal(pages[0]?.section, "API Reference");
  assert.match(pages[0]?.content ?? "", /`modal\?`/);
  assert.equal(pages[1]?.truncated, true);
  assert.ok((pages[1]?.content.length ?? 0) < 9_200);
  assert.match(pages[1]?.content ?? "", /Section continues/);
  assert.match(pages[2]?.content ?? "", /No section named "nonsense"/);
  assert.ok(pages[2]?.otherSections.includes("Forms"));
});

test("guides are read too, hyphenated names resolve, and an unknown name lists what exists", () => {
  const { pages, unknown, available } = read([{ name: "popups", section: null }, { name: "AlertDialog", section: null }, { name: "modal", section: null }, { name: "core", section: null }]);
  assert.match(pages[0]?.content ?? "", /## Focus\n\nWhere focus goes\./);
  assert.match(pages[1]?.content ?? "", /^# Alert Dialog/);
  assert.deepEqual(unknown, ["modal", "core"]);
  assert.deepEqual(available, ["alert-dialog", "dialog", "popups"]);
});

test("the builder reads documentation as Markdown with the remaining sections named", () => {
  const text = formatUiDocs(read([{ name: "dialog", section: null }, { name: "modal", section: null }]));
  assert.match(text, /^# ui-sdk: dialog\n\n# Dialog/);
  assert.match(text, /Other sections of this page \(request by name\): Forms, API Reference\./);
  assert.match(text, /No page for: modal\. Available: alert-dialog, dialog, popups\./);
});
