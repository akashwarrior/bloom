import assert from "node:assert/strict";
import test from "node:test";

import { BuildSession, type ReferenceCapture } from "../ai/build-session.ts";
import { buildPageDna } from "../lib/design/dna.ts";
import { designStudySchema, formatDesignStudy, isGalleryUrl, validateDesignStudy } from "../lib/design/study.ts";

function capture(url: string): ReferenceCapture {
  return {
    url, host: new URL(url).hostname, brand: "Reference", title: "Reference page",
    pageHeight: 5000, viewportHeight: 1000,
    dna: buildPageDna({ frames: [], profile: null, pageHeight: 5000, viewportHeight: 1000 }),
    dnaText: "Measured design evidence",
    frames: [{ number: 1, assetId: "frame", assetUrl: "/api/assets/frame", scrollY: 0, scrollPercentage: 0 }],
    headings: [], largeMedia: 0, heroImagery: 0, frameNotes: {}, fonts: [],
  };
}

const captures = [capture("https://first.example/"), capture("https://second.example/")];
const study = designStudySchema.parse({
  audience: "People comparing self-custody wallets for everyday transfers.",
  thesis: "An open ledger composition makes ownership tangible through an oversized transaction route.",
  references: captures.map(({ url }) => ({
    url, frame: 1,
    observation: "A narrow left text column aligns with an oversized visual that extends across the remaining two thirds.",
    principle: "One dominant visual explains the product while asymmetric spacing leads to the action.",
    adaptation: "The wallet hero uses a code-built transfer route as the large visual instead of a photograph.",
    avoid: "Do not transfer the product photography, headline or customer claims.",
  })),
  hero: {
    composition: "Align a short headline to the left grid line and let a transfer diagram occupy the right two thirds.",
    focalPoint: "A single route connects the sending and receiving accounts.",
    mobile: "Move the transfer diagram below the headline and simplify it to a vertical route with one action beneath.",
  },
  rhythm: "Follow the large hero with a compact numbered process, then a quiet full-width ownership statement.",
});
test("an original site requires a reference and starts without a study or brief", () => {
  const session = new BuildSession("site");
  assert.ok(session.references.length < session.requiredReferences());
  assert.equal(session.designStudy, null);
  assert.equal(session.brief, null);
  session.recordReference(captures[0]!);
  assert.ok(session.references.length >= session.requiredReferences());
  assert.equal(session.comparisonAnchor, null);
});

test("clones and named references retain their fidelity workflow", () => {
  for (const session of [new BuildSession("clone", captures[0]!.url), new BuildSession("site", null, captures[0]!.url)]) {
    assert.equal(session.requiredReferences(), 1);
    session.recordReference(captures[0]!);
    assert.equal(session.comparisonAnchor?.url, captures[0]!.url);
    assert.equal(session.brief, null);
  }
  assert.equal(new BuildSession("app").requiredReferences(), 0);
  assert.equal(new BuildSession("app").gated, true);
  assert.equal(new BuildSession("edit").gated, false);
});

test("a valid study cites frames from distinct captured sites", () => {
  assert.deepEqual(validateDesignStudy(study, captures), []);
  assert.match(formatDesignStudy(study), /Mobile recomposition:/);
  assert.match(formatDesignStudy(study), /Do not transfer:/);
});

test("uncaptured and nonexistent frames cannot ground a study", () => {
  const missing = { ...study, references: [{ ...study.references[0]!, frame: 20 }, study.references[1]!] };
  assert.ok(validateDesignStudy(missing, captures).some((problem) => problem.includes("no frame 20")));
  const guessed = { ...study, references: [{ ...study.references[0]!, url: "https://first.example.evil/" }, study.references[1]!] };
  assert.ok(validateDesignStudy(guessed, captures).some((problem) => problem.includes("not captured")));
  assert.ok(validateDesignStudy({ ...study, references: [study.references[0]!, study.references[0]!] }, captures).some((problem) => problem.includes("2 different")));
});

test("reference headlines cannot seed the original design concept", () => {
  const copied = { ...study, hero: { ...study.hero, composition: 'A centered display headline reading "Experience Crypto in Color" above an oversized interface.' } };
  const evidence = captures.map((capture) => ({ ...capture, headings: ["Experience Crypto in Color"] }));
  assert.ok(validateDesignStudy(copied, evidence).some((problem) => problem.includes("repeats reference copy")));
  assert.deepEqual(validateDesignStudy(study, evidence), []);
});

test("bounded research failure relaxes the reference requirement rather than forcing an ungrounded template", () => {
  const session = new BuildSession("site");
  session.failedScrapes = 3;
  assert.equal(session.requiredReferences(), 0);
  const fallback = { ...study, references: [] };
  assert.deepEqual(validateDesignStudy(fallback, []), []);
  assert.match(formatDesignStudy(fallback), /unbenchmarked/);
  assert.ok(validateDesignStudy(study, []).length > 0);
});

test("generated images remain bound when a later rewrite restores named placeholders", () => {
  const session = new BuildSession("site");
  session.generatedAssets.push({ name: "hero-art", localPath: "/generated/hero.jpg", role: "hero" });
  session.generatedAssets.push({ name: "project-art", localPath: "/generated/project.jpg", role: "work" });
  const content = '<img src="asset:hero-art" /><img src="asset:project-art" /><img src="asset:hero-art-extra" />';
  assert.equal(session.resolveAssetSlots(content), '<img src="/generated/hero.jpg" /><img src="/generated/project.jpg" /><img src="asset:hero-art-extra" />');
  session.generatedAssets.push({ name: "hero-art", localPath: "/generated/new-hero.jpg", role: "hero" });
  assert.match(session.resolveAssetSlots(content), /new-hero\.jpg/);
});

test("gallery, article and code-host URLs are not product references", () => {
  for (const url of ["https://kage.design/designs/phantom-landing-page", "https://www.landing.love/sites/phantom/", "https://dribbble.com/tags/phantom-wallet", "https://rainbowallet.vercel.app/", "medium.com/collab-currency/x"]) {
    assert.equal(isGalleryUrl(url), true, url);
  }
  for (const url of ["https://phantom.com/", "rainbow.me", "https://notdribbble.com", "https://www.portorocha.com/"]) {
    assert.equal(isGalleryUrl(url), false, url);
  }
});
