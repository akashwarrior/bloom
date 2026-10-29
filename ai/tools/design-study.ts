import { tool } from "ai";
import z from "zod/v4";

import type { ToolParams } from "@/ai/tools";
import { designStudySchema, formatDesignStudy, validateDesignStudy } from "@/lib/design/study";

export const submitDesignStudy = ({ session, logger }: Pick<ToolParams, "session" | "logger">) => tool({
  description: "Original sites only; skip this for a named reference, clone, or edit. Synthesize captured reference frames into an original design idea before choosing tokens or writing code. Explain observed composition, the transferable principle, a concrete adaptation and what not to copy. This does not select a preset or clone a site.",
  inputSchema: designStudySchema,
  outputSchema: z.strictObject({
    status: z.enum(["accepted", "rejected"]),
    problems: z.array(z.string()),
    next: z.string(),
  }),
  execute: async (study) => {
    const problems = session.original
      ? validateDesignStudy(study, session.references)
      : ["A design study is used only for original sites."];
    if (session.references.length < session.requiredReferences()) {
      problems.push("Complete reference research before submitting a design study.");
    }
    if (session.references.length === 0) problems.push("No usable reference screenshots are available. Restore research access before synthesizing a design.");
    if (problems.length > 0) {
      session.studyRejections += 1;
      if (session.studyRejections >= 4) session.abortReason = "The design study could not be grounded in captured reference evidence after four submissions.";
      await logger.write("design_study.rejected", { problems });
      return {
        status: "rejected" as const,
        problems,
        next: session.original
          ? "Fix the evidence links so every cited frame exists in a captured reference, then resubmit."
          : "This tool is for original sites only. Skip the design study and submit the design brief.",
      };
    }
    session.designStudy = study;
    await logger.write("design_study.accepted", { study });
    return { status: "accepted" as const, problems: [], next: `${formatDesignStudy(study)}\n\nSubmit the full design brief now. Choose tokens and section geometry that implement this concept; references are evidence, not templates to reproduce.` };
  },
});
