import assert from "node:assert/strict";
import test from "node:test";

import { findAssetSlots, replacePlaceholder } from "../lib/design/asset-slots.ts";

const source = `import { Hero, Bento, FeatureSplit } from "@/components/blocks"
export function Page() {
  return (
    <>
      <Hero variant="split" surface={1} title="Coffee" image="asset:hero-beans" />
      <Bento surface={2} tiles={[
        { title: "Farms", size: "lg", image: "asset:farm-rows" },
        { title: "Roast", image: "asset:roaster-drum", size: "sm" },
      ]} />
      <FeatureSplit rows={[{ title: "Cupping", description: "x", image: "asset:cupping-table" }]} />
      <Hero variant="split" image="asset:hero-beans" title="again" />
    </>
  )
}`;

test("asset placeholders are found once each with the aspect of their frame", () => {
  const slots = findAssetSlots("components/page.tsx", source);
  assert.deepEqual(
    slots.map((slot) => `${slot.name}:${slot.aspect}`),
    ["hero-beans:4:5", "farm-rows:16:9", "roaster-drum:1:1", "cupping-table:5:4"],
  );
  assert.match(slots[0]!.context, /<Hero variant="split"/);
});

test("placeholders are swapped for the generated file everywhere they appear", () => {
  const replaced = replacePlaceholder(source, "hero-beans", "/bloom-generated-assets/abc.jpg");
  assert.equal(replaced.match(/\/bloom-generated-assets\/abc\.jpg/g)?.length, 2);
  assert.ok(replaced.includes("asset:farm-rows"));
  assert.equal(replacePlaceholder("asset:hero-beans-2", "hero-beans", "/x.jpg"), "asset:hero-beans-2");
});
