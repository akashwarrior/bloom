import assert from "node:assert/strict";
import test from "node:test";

import { repairToolInput, unwrapStringifiedFields } from "../ai/tool-input-repair.ts";
import { designSelectionSchema } from "../ai/design/design-selection.ts";
import { designNotesSchema, generateDesignDoc } from "../ai/design/design-skill.ts";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolveFonts, storedDirection, type FontCatalog } from "../ai/design/direction.ts";
import { directionInput } from "./fixtures/direction.ts";

const direction = storedDirection(directionInput);
const catalog = JSON.parse(readFileSync(
  createRequire(import.meta.url).resolve("next/dist/compiled/@next/font/dist/google/font-data.json"),
  "utf8",
)) as FontCatalog;
const resolved = resolveFonts(direction.typography, catalog);
if (!("fonts" in resolved)) throw new Error("fixture fonts must resolve");
const fonts = resolved.fonts;

test("the design selection is a written direction and nothing else", () => {
  assert.equal(designSelectionSchema.safeParse({ direction: directionInput }).success, true);
  assert.equal(designSelectionSchema.safeParse({ direction: directionInput, components: { style: "nova" } }).success, false);
  assert.equal(designSelectionSchema.safeParse({}).success, false);

  // A model sometimes sends the direction as a JSON string; the tool call is repaired instead of rejected.
  const stringified = JSON.stringify({ direction: JSON.stringify(directionInput) });
  const repaired = unwrapStringifiedFields(stringified);
  assert.ok(repaired);
  assert.equal(designSelectionSchema.safeParse(JSON.parse(repaired)).success, true);
  assert.equal(unwrapStringifiedFields(JSON.stringify({ direction: directionInput })), null);
  assert.equal(unwrapStringifiedFields("not json"), null);

  // The same repair covers a file write whose list of changes arrived as a string.
  const changes = [{ type: "create", path: "app/page.tsx", content: "export default function Page() {\n  return <main>{\"[\"}</main>\n}\n" }];
  const repairedWrite = unwrapStringifiedFields(JSON.stringify({ changes: JSON.stringify(changes) }));
  assert.deepEqual(JSON.parse(repairedWrite ?? "{}"), { changes });
  // Stray characters after the closing bracket do not cost a whole page of source.
  assert.deepEqual(JSON.parse(unwrapStringifiedFields(JSON.stringify({ changes: `${JSON.stringify(changes)}}>` })) ?? "{}"), { changes });
  assert.equal(unwrapStringifiedFields(JSON.stringify({ changes: "[{\"type\": \"create\", \"path\": " })), null);
  // A key the tool does not take is dropped instead of rejecting the call; valid input is left untouched.
  assert.deepEqual(JSON.parse(repairToolInput(JSON.stringify({ changes, purpose: "Build the page" }), ["changes"]) ?? "{}"), { changes });
  assert.deepEqual(JSON.parse(repairToolInput(JSON.stringify({ changes: JSON.stringify(changes), purpose: "x" }), ["changes"]) ?? "{}"), { changes });
  assert.equal(repairToolInput(JSON.stringify({ changes }), ["changes"]), null);
  assert.equal(repairToolInput("not json", ["changes"]), null);
  // Text that only looks like JSON is left alone.
  assert.equal(unwrapStringifiedFields(JSON.stringify({ focus: "[draft] a page", interaction: null })), null);
});

test("DESIGN.md carries the written direction as decisions, with no generated tokens or classes", () => {
  const notes = designNotesSchema.parse({
    conceptUrl: "/api/assets/concept-1",
    inspiration: [{ number: 1, imageId: "quiet-editorial", assetUrl: "/api/assets/library-frame-1.webp", batch: 1 }],
  });
  const doc = generateDesignDoc(direction, fonts, notes);

  assert.match(doc, /^# Design direction/m);
  for (const heading of ["The idea", "Composition", "Imagery", "Motion", "Voice", "What this design refuses", "Color", "Type", "Shape and controls", "Visual study", "Inspiration"]) {
    assert.match(doc, new RegExp(`^## ${heading}$`, "m"));
  }
  for (const written of [direction.concept, direction.signature, direction.composition, direction.color.strategy, direction.typography.treatment, direction.shape.treatment]) {
    assert.ok(doc.includes(written));
  }
  // Colors are listed under the names the director gave them, each with its text color.
  assert.match(doc, /\| `canvas` \| #10231C \| #F2EDE3 \| The page background\. \|/);
  assert.match(doc, /\| `brass` \| #E8B04A \| #10231C \| Actions and the tide curve\. \|/);
  assert.match(doc, /\| `signal` \| #FF5A36 \| #10231C \| The current reading only/);
  assert.match(doc, /Display: Fraunces, with italics/);
  assert.match(doc, /Utility: DM Mono, weights 400\/500/);
  // The fonts arrive as a snippet the builder puts in the layout, already checked against the catalog.
  assert.match(doc, /import \{ Fraunces, Hanken_Grotesk, DM_Mono \} from "next\/font\/google";/);
  assert.match(doc, /`--font-display: var\(--display-font\), serif;`/);
  assert.match(doc, /Corners: 2px on a standard control and card/);
  assert.match(doc, /a standard button, field and select is 40px tall/);
  assert.match(generateDesignDoc({ ...direction, shape: { treatment: direction.shape.treatment, controlHeightPx: 52 } }, fonts), /no single radius; follow the treatment below[\s\S]*52px tall/);
  assert.match(doc, /Frame 1: image `quiet-editorial` — \/api\/assets\/library-frame-1\.webp/);
  assert.match(doc, /## Visual study\n\n\/api\/assets\/concept-1\n/);
  // Nothing from a component library's theme, and no class names decided for the builder.
  assert.doesNotMatch(doc, /shadcn|bg-primary|text-muted-foreground|bg-card|--primary|popover|chart-1|bloom-fonts|node_modules/);

  const bare = generateDesignDoc(direction, fonts);
  assert.doesNotMatch(bare, /Visual study/);
  assert.match(bare, /No saved reference images\./);
});
