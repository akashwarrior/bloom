export const MAX_FINISH_ATTEMPTS = 3;

export const REVIEW_DIMENSIONS = [
  "composition",
  "typography",
  "color",
  "imagery",
  "craft",
  "distinctiveness",
] as const;

export type ReviewCritique = {
  scores: Record<(typeof REVIEW_DIMENSIONS)[number], number>;
  findings: Array<{
    severity: "blocking" | "major" | "minor";
    section: string;
    evidence: string;
    fix: string;
  }>;
};

export type ReviewEvidence = {
  typecheckStatus: string | null;
  desktop: { frames: number; profile: boolean };
  mobile: { frames: number; profile: boolean };
};

export function evaluateReviewQuality({
  critique,
  evidence,
  attempt,
  blocking: existingBlocking = [],
  major: existingMajor = [],
  minor: existingMinor = [],
}: {
  critique: ReviewCritique | null;
  evidence: ReviewEvidence;
  attempt: number;
  blocking?: readonly string[];
  major?: readonly string[];
  minor?: readonly string[];
}) {
  const blocking = [...existingBlocking];
  const major = [...existingMajor];
  const minor = [...existingMinor];

  if (evidence.typecheckStatus !== "passed") {
    blocking.push(`TypeScript verification did not pass (${evidence.typecheckStatus ?? "unavailable"}). A successful typecheck is required.`);
  }
  for (const viewport of ["desktop", "mobile"] as const) {
    if (!(evidence[viewport].frames > 0)) {
      blocking.push(`No ${viewport} preview screenshots were available. Capture the rendered page before accepting its visual quality.`);
    }
    if (!evidence[viewport].profile) {
      blocking.push(`The ${viewport} design profile is unavailable. Layout, image loading, and contrast measurements were not verified.`);
    }
  }

  if (!critique) {
    minor.push("Advisory visual review unavailable; only the measured checks above were applied.");
  } else {
    for (const dimension of REVIEW_DIMENSIONS) {
      const score = critique.scores[dimension];
      if (Number.isInteger(score) && score < 4) minor.push(`Advisory visual review: ${dimension} ${score}/5.`);
    }
    for (const finding of critique.findings) {
      minor.push(`Advisory visual review (${finding.severity}) ${finding.section}: ${finding.evidence} Fix: ${finding.fix}`);
    }
  }

  const passed = blocking.length === 0 && major.length === 0;
  return {
    passed,
    exhausted: !passed && attempt >= MAX_FINISH_ATTEMPTS,
    blocking,
    major,
    minor,
  };
}
