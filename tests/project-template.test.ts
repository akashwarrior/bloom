import assert from "node:assert/strict";
import test from "node:test";

import { PROJECT_DEPENDENCY_STEPS, PROJECT_TEMPLATE_FILES, PROJECT_TEMPLATE_SIGNATURE, UI_SDK_VERSION } from "../lib/runtime/project-template.ts";

const file = (path: string) => PROJECT_TEMPLATE_FILES.find((entry) => entry.path === path)?.content ?? "";

test("a new project runs Tailwind through PostCSS, not the Turbopack loader that serves a stale stylesheet", () => {
  assert.deepEqual(PROJECT_DEPENDENCY_STEPS[0], ["remove", "@tailwindcss/turbopack"]);
  assert.ok(PROJECT_DEPENDENCY_STEPS.some((step) => step[0] === "add" && step.some((arg) => arg.startsWith("@tailwindcss/postcss@"))));
  assert.match(file("postcss.config.mjs"), /"@tailwindcss\/postcss": \{\}/);
  assert.doesNotMatch(file("next.config.ts"), /turbopack|loaders/);
  assert.match(file("next.config.ts"), /cacheComponents: true/);
});

test("a new project has ui-sdk pinned, with its base stylesheet under Tailwind's utilities", () => {
  assert.ok(PROJECT_DEPENDENCY_STEPS.some((step) => step.includes(`@ui-sdk/react@${UI_SDK_VERSION}`) && step.includes(`@ui-sdk/core@${UI_SDK_VERSION}`)));
  const css = file("app/globals.css");
  assert.ok(css.startsWith("@layer ui-sdk;\n\n@import \"tailwindcss\";\n@import \"@ui-sdk/core/web.css\" layer(components);\n"));
  assert.match(css, /a:not\(\[data-slot\]\)/);
  assert.doesNotMatch(PROJECT_TEMPLATE_FILES.map((entry) => entry.content).join("\n"), /shadcn|components\/ui/);
});

test("the empty project says it is empty instead of rendering a blank page", () => {
  assert.match(file("app/page.tsx"), /This project is empty\. Its first page will appear here\./);
});

test("the template signature covers every file, so a prepared runtime image cannot outlive a template change", () => {
  for (const entry of PROJECT_TEMPLATE_FILES) assert.ok(PROJECT_TEMPLATE_SIGNATURE.includes(JSON.stringify(entry.content)));
});
