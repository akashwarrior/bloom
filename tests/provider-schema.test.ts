import assert from "node:assert/strict";
import test from "node:test";

import { relaxFunctionDeclarations } from "../ai/provider-schema.ts";

test("removes decoding-heavy constraints but keeps structure, enums, and property names", () => {
  const [relaxed] = relaxFunctionDeclarations([
    {
      functionDeclarations: [
        {
          name: "generateAsset",
          parametersJsonSchema: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              prompt: { type: "string", maxLength: 4000, description: "Prompt" },
              format: { type: "string", enum: ["png", "svg"] },
              pattern: { type: "string", pattern: "^a+$" },
              references: {
                type: "array",
                maxItems: 4,
                items: {
                  type: "object",
                  properties: { assetId: { type: "string", format: "uuid", pattern: "^x$" } },
                  required: ["assetId"],
                },
              },
              frame: { type: "integer", minimum: 1, maximum: 40 },
            },
            required: ["prompt", "format"],
          },
        },
      ],
    },
  ]) as Array<{ functionDeclarations: Array<{ parametersJsonSchema: Record<string, unknown> }> }>;
  const schema = relaxed!.functionDeclarations[0]!.parametersJsonSchema;
  assert.deepEqual(schema, {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Prompt" },
      format: { type: "string", enum: ["png", "svg"] },
      pattern: { type: "string" },
      references: {
        type: "array",
        items: {
          type: "object",
          properties: { assetId: { type: "string" } },
          required: ["assetId"],
        },
      },
      frame: { type: "integer" },
    },
    required: ["prompt", "format"],
  });
  assert.equal(relaxFunctionDeclarations(undefined), undefined);
});
