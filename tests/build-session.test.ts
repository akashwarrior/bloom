import assert from "node:assert/strict";
import test from "node:test";

import { BuildSession } from "../ai/build-session.ts";
test("each source edit invalidates both previews until they are captured again", () => {
  const session = new BuildSession();
  assert.equal(session.hasEdits, false);
  assert.equal(session.previewIsCurrent("desktop"), false);
  assert.equal(session.previewIsCurrent("mobile"), false);

  session.recordEdit();
  session.recordPreview("desktop");
  session.recordInteraction();
  assert.equal(session.interactionIsCurrent, true);
  assert.equal(session.previewIsCurrent("desktop"), true);
  assert.equal(session.previewIsCurrent("mobile"), false);

  session.recordPreview("mobile");
  assert.equal(session.previewIsCurrent("desktop"), true);
  assert.equal(session.previewIsCurrent("mobile"), true);

  session.recordEdit();
  assert.equal(session.hasEdits, true);
  assert.equal(session.interactionIsCurrent, false);
  assert.equal(session.previewIsCurrent("desktop"), false);
  assert.equal(session.previewIsCurrent("mobile"), false);
});

test("a passing typecheck only covers the source version it ran on", () => {
  const session = new BuildSession();
  assert.equal(session.typecheckIsCurrent, false);

  session.recordTypecheckPassed();
  assert.equal(session.typecheckIsCurrent, true);

  session.recordEdit();
  assert.equal(session.typecheckIsCurrent, false);

  session.recordTypecheckPassed();
  assert.equal(session.typecheckIsCurrent, true);
});

test("page tracking remembers the last page route edited in the run", () => {
  const session = new BuildSession();
  assert.equal(session.lastPagePath, null);

  session.recordPagePath("components/hero.tsx", true);
  assert.equal(session.lastPagePath, null);

  session.recordPagePath("app/page.tsx", true);
  assert.equal(session.lastPagePath, "app/page.tsx");

  session.recordPagePath("app/dashboard/page.tsx", true);
  assert.equal(session.lastPagePath, "app/dashboard/page.tsx");

  session.recordPagePath("app/dashboard/page.tsx", false);
  assert.equal(session.lastPagePath, null);
});

test("a successful build verification applies only to the checked workspace version", () => {
  const session = new BuildSession();
  assert.equal(session.verificationIsCurrent, false);
  session.recordVerification();
  assert.equal(session.verificationIsCurrent, true);
  session.recordEdit();
  assert.equal(session.verificationIsCurrent, false);
});

test("the session remembers the captured route and the proven interaction for the final check", () => {
  const session = new BuildSession();
  session.recordEdit();
  session.recordPreview("desktop", [{ url: "/api/assets/full", label: "Full page" }], "/pricing");
  const interaction = { url: "/pricing", viewport: "desktop" as const, actions: [{ selector: "#plan", fill: null }], expectVisible: "#summary" };
  session.recordInteraction(interaction);
  assert.equal(session.previewUrl, "/pricing");
  assert.deepEqual(session.previewImages.get("desktop"), ["/api/assets/full"]);
  assert.deepEqual(session.previewShots("desktop"), [{ url: "/api/assets/full", label: "Full page" }]);
  assert.equal(session.interactionIsCurrent, true);

  // A later edit makes both stale but keeps what to redo.
  session.recordEdit();
  assert.equal(session.previewIsCurrent("desktop"), false);
  assert.equal(session.interactionIsCurrent, false);
  assert.equal(session.previewUrl, "/pricing");
  assert.deepEqual(session.interaction, interaction);
  session.recordInteraction();
  assert.equal(session.interactionIsCurrent, true);
});
