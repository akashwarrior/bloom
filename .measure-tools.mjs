import { readFileSync } from "node:fs";
import path from "node:path";
import z from "zod/v4";

import { tools } from "/home/skygupta/Desktop/bloom/ai/tools/index.ts";
import { BuildSession } from "/home/skygupta/Desktop/bloom/ai/build-session.ts";

const root = "/home/skygupta/Desktop/bloom";
const system = [
  readFileSync(path.join(root, "ai/prompts/base.md"), "utf8").trim().replace("{{CURRENT_DATE}}", new Date().toISOString().slice(0, 10)),
  readFileSync(path.join(root, "ai/prompts/build.md"), "utf8").trim(),
].join("\n\n");

const session = new BuildSession("site");
const t = tools({
  projectId: "measure",
  writer: { write() {} },
  mode: "BUILD",
  signal: new AbortController().signal,
  logger: { write: async () => {}, track: () => {} },
  session,
});

function schemaText(tool) {
  if (!tool?.inputSchema) return "";
  try {
    return JSON.stringify(z.toJSONSchema(tool.inputSchema));
  } catch (error) {
    return `[schema error: ${error instanceof Error ? error.message : String(error)}]`;
  }
}

const rows = Object.entries(t).map(([name, tool]) => {
  const description = String(tool.description ?? "");
  const schema = schemaText(tool);
  return {
    name,
    descriptionChars: description.length,
    schemaChars: schema.length,
    chars: description.length + schema.length,
    description,
  };
});
rows.sort((a, b) => b.chars - a.chars);

const fmt = (n) => n.toLocaleString("en-US");
console.log(`SYSTEM PROMPT: ${fmt(system.length)} chars (~${fmt(Math.ceil(system.length / 3))} tok @3, ~${fmt(Math.ceil(system.length / 4))} tok @4)`);
console.log("");
console.log("TOOL".padEnd(20), "DESC CHARS".padStart(11), "SCHEMA CHARS".padStart(13), "TOTAL".padStart(9), "~TOK@4".padStart(9));
for (const row of rows) {
  console.log(
    row.name.padEnd(20),
    fmt(row.descriptionChars).padStart(11),
    fmt(row.schemaChars).padStart(13),
    fmt(row.chars).padStart(9),
    fmt(Math.ceil(row.chars / 4)).padStart(9),
  );
}

const totals = rows.reduce((acc, row) => ({
  desc: acc.desc + row.descriptionChars,
  schema: acc.schema + row.schemaChars,
  chars: acc.chars + row.chars,
}), { desc: 0, schema: 0, chars: 0 });
console.log("");
console.log("TOOL TOTALS", totals);
console.log("TOOL ~TOK@3", Math.ceil(totals.chars / 3), "~TOK@4", Math.ceil(totals.chars / 4));
console.log("SYSTEM+TOOLS ~TOK@3", Math.ceil((system.length + totals.chars) / 3), "~TOK@4", Math.ceil((system.length + totals.chars) / 4));
