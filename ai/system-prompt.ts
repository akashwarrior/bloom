import basePrompt from "@/ai/prompts/base.md";
import buildPrompt from "@/ai/prompts/build.md";
import planPrompt from "@/ai/prompts/plan.md";

export function buildSystemPrompt(mode: "BUILD" | "PLAN") {
  const currentDate = new Date().toISOString().slice(0, 10);
  return [
    basePrompt.trim().replace("{{CURRENT_DATE}}", currentDate),
    (mode === "BUILD" ? buildPrompt : planPrompt).trim(),
  ].join("\n\n");
}
