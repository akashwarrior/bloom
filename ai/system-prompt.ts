import basePrompt from "@/ai/prompts/base.md";
import buildPrompt from "@/ai/prompts/build.md";
import explainInterfacePrompt from "@/ai/prompts/explain-interface.md";
import interfaceDesignPrompt from "@/ai/prompts/interface-design.md";

export function buildSystemPrompt() {
  const currentDate = new Date().toISOString().slice(0, 10);

  return [
    basePrompt.trim().replace("{{CURRENT_DATE}}", currentDate),
    buildPrompt.trim(),
    interfaceDesignPrompt.trim(),
    explainInterfacePrompt.trim(),
  ].join("\n\n");
}
