import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateReviewQuality,
  MAX_FINISH_ATTEMPTS,
  REVIEW_DIMENSIONS,
  type ReviewCritique,
  type ReviewEvidence,
} from "../lib/design/review-quality.ts";

function cleanCritique(): ReviewCritique {
  return {
    scores: { composition: 5, typography: 5, color: 5, imagery: 5, craft: 5, distinctiveness: 5 },
    findings: [],
  };
}

function completeEvidence(): ReviewEvidence {
  return {
    typecheckStatus: "passed",
    desktop: { frames: 6, profile: true },
    mobile: { frames: 6, profile: true },
  };
}

test("model critique findings and scores are advisory and never decide the gate", () => {
  const critique = cleanCritique();
  critique.scores.craft = 2;
  critique.findings = [
    { severity: "blocking", section: "Mobile hero", evidence: "The headline is cut at the frame edge.", fix: "Add padding." },
    { severity: "major", section: "Features", evidence: "Cards feel dense.", fix: "Add space." },
  ];
  const result = evaluateReviewQuality({ critique, evidence: completeEvidence(), attempt: 1 });
  assert.equal(result.passed, true);
  assert.deepEqual(result.blocking, []);
  assert.deepEqual(result.major, []);
  assert.equal(result.minor.length, 3);
  assert.match(result.minor.join("\n"), /Advisory visual review: craft 2\/5/);
  assert.match(result.minor.join("\n"), /Advisory visual review \(blocking\) Mobile hero/);
});

test("a perfect model critique cannot clear measured defects on any attempt", () => {
  assert.equal(MAX_FINISH_ATTEMPTS, 3);
  const blocking = ["The primary reference is light but the preview renders dark"];
  const major = ["The hero headline renders at 56px; the reference sets 96px"];
  for (let attempt = 1; attempt <= MAX_FINISH_ATTEMPTS; attempt += 1) {
    const result = evaluateReviewQuality({ critique: cleanCritique(), evidence: completeEvidence(), attempt, blocking, major });
    assert.equal(result.passed, false);
    assert.equal(result.exhausted, attempt === MAX_FINISH_ATTEMPTS);
    assert.deepEqual(result.blocking, blocking);
    assert.deepEqual(result.major, major);
    assert.notEqual(result.blocking, blocking);
  }
});

test("an unavailable model critique is disclosed without blocking measured success", () => {
  const result = evaluateReviewQuality({ critique: null, evidence: completeEvidence(), attempt: 1 });
  assert.equal(result.passed, true);
  assert.match(result.minor.join("\n"), /Advisory visual review unavailable/);
});

test("a skipped, failed, timed-out, missing, or unavailable typecheck never passes", () => {
  for (const typecheckStatus of ["skipped", "failed", "timed-out", "unavailable", null]) {
    for (let attempt = 1; attempt <= MAX_FINISH_ATTEMPTS; attempt += 1) {
      const evidence = { ...completeEvidence(), typecheckStatus };
      const result = evaluateReviewQuality({ critique: cleanCritique(), evidence, attempt });
      assert.equal(result.passed, false, `${typecheckStatus}, attempt ${attempt}`);
      assert.match(result.blocking.join("\n"), /TypeScript verification did not pass/);
    }
  }
});

test("missing desktop or mobile screenshots or profiles reject independently", () => {
  for (const viewport of ["desktop", "mobile"] as const) {
    for (const missing of ["frames", "profile"] as const) {
      const evidence = completeEvidence();
      if (missing === "frames") evidence[viewport].frames = 0;
      else evidence[viewport].profile = false;
      const result = evaluateReviewQuality({ critique: cleanCritique(), evidence, attempt: 1 });
      assert.equal(result.passed, false, `${viewport} ${missing}`);
      assert.match(result.blocking.join("\n"), new RegExp(`${viewport}.*${missing === "frames" ? "screenshots" : "profile"}`));
    }
  }
});

test("low advisory scores are reported for every weak dimension", () => {
  for (const dimension of REVIEW_DIMENSIONS) {
    const critique = cleanCritique();
    critique.scores[dimension] = 3;
    const result = evaluateReviewQuality({ critique, evidence: completeEvidence(), attempt: 1 });
    assert.match(result.minor.join("\n"), new RegExp(`${dimension} 3/5`));
  }
});
