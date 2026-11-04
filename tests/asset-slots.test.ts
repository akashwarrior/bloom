import assert from "node:assert/strict";
import test from "node:test";

import { findAssetSlots, replacePlaceholder } from "../lib/design/asset-slots.ts";

const source = `export function Page() {
  return (
    <>
      <img src="asset:hero-beans" className="aspect-[4/5] w-full object-cover" alt="" />
      <img src="asset:farm-rows" className="aspect-video w-full" alt="" />
      <Image src="asset:roaster-drum" className="aspect-square" alt="" />
      <img src="asset:cupping-table" className="aspect-[5/4] w-full" alt="" />
      <img src="asset:hero-beans" className="aspect-[4/5] w-full" alt="" />
    </>
  )
}`;

test("asset placeholders are found once each with the aspect of their frame", () => {
  const slots = findAssetSlots("components/page.tsx", source);
  assert.deepEqual(
    slots.map((slot) => `${slot.name}:${slot.aspect}`),
    ["hero-beans:4:5", "farm-rows:16:9", "roaster-drum:1:1", "cupping-table:5:4"],
  );
});

test("placeholders without an aspect utility fall back to a landscape frame", () => {
  const [slot] = findAssetSlots("components/page.tsx", '<img src="asset:quiet-water" alt="" />');
  assert.equal(slot!.aspect, "4:3");
});

test("placeholders are swapped for the generated file everywhere they appear", () => {
  const replaced = replacePlaceholder(source, "hero-beans", "/bloom-generated-assets/abc.jpg");
  assert.equal(replaced.match(/\/bloom-generated-assets\/abc\.jpg/g)?.length, 2);
  assert.ok(replaced.includes("asset:farm-rows"));
  assert.equal(replacePlaceholder("asset:hero-beans-2", "hero-beans", "/x.jpg"), "asset:hero-beans-2");
});
