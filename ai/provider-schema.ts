const DECODING_HEAVY_KEYWORDS = new Set([
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "pattern",
  "format",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "$schema",
]);

function stripKeywords(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripKeywords);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !DECODING_HEAVY_KEYWORDS.has(key))
      .map(([key, item]) => [
        key,
        key === "properties" && item && typeof item === "object" && !Array.isArray(item)
          ? Object.fromEntries(
            Object.entries(item as Record<string, unknown>).map(([name, schema]) => [name, stripKeywords(schema)]),
          )
          : stripKeywords(item),
      ]),
  );
}

/**
 * Gemini compiles function schemas into a decoding grammar when a tool call is
 * required. Length, count, range, and regex constraints multiply grammar
 * states until the request is rejected as an invalid argument, so they are
 * removed from the provider payload. Tool inputs are still validated against
 * the full zod schemas on the server.
 */
export function relaxFunctionDeclarations(tools: unknown) {
  if (!Array.isArray(tools)) return tools;
  return tools.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const record = entry as Record<string, unknown>;
    if (!Array.isArray(record.functionDeclarations)) return entry;
    return {
      ...record,
      functionDeclarations: record.functionDeclarations.map((declaration) => {
        if (!declaration || typeof declaration !== "object") return declaration;
        const fn = declaration as Record<string, unknown>;
        return {
          ...fn,
          ...(fn.parametersJsonSchema ? { parametersJsonSchema: stripKeywords(fn.parametersJsonSchema) } : {}),
          ...(fn.parameters ? { parameters: stripKeywords(fn.parameters) } : {}),
        };
      }),
    };
  });
}
