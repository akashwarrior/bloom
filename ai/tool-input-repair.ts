/**
 * Repairs for tool input a model got almost right. A whole page of source is
 * not worth rejecting over a field sent as a JSON string or one extra key.
 */

/** Parses a stringified object or array, ignoring stray characters a model left after its closing bracket. */
function parseNested(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    const closer = value.trimStart().startsWith("[") ? "]" : "}";
    for (let end = value.lastIndexOf(closer); end > 0; end = value.lastIndexOf(closer, end - 1)) {
      try {
        return JSON.parse(value.slice(0, end + 1));
      } catch {
        // Not the end of the value; try the previous closing bracket.
      }
      if (value.length - end > 40) break;
    }
    return undefined;
  }
}

/**
 * A model sometimes sends a nested object or array as a JSON string: `direction`
 * for the design director, `changes` for a large file write. Returns the tool
 * input with those fields unwrapped, or null when there is nothing to unwrap.
 */
export function unwrapStringifiedFields(input: string) {
  try {
    const parsed = JSON.parse(input) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    let changed = false;
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== "string" || !/^\s*[{[]/.test(value)) continue;
      const unwrapped = parseNested(value);
      if (!unwrapped || typeof unwrapped !== "object") continue;
      parsed[key] = unwrapped;
      changed = true;
    }
    return changed ? JSON.stringify(parsed) : null;
  } catch {
    return null;
  }
}

/**
 * The tool input with stringified fields unwrapped and keys the tool does not
 * take removed, or null when neither applies. `allowedKeys` are the top-level
 * properties of the tool's input schema.
 */
export function repairToolInput(input: string, allowedKeys: string[] | null) {
  const unwrapped = unwrapStringifiedFields(input) ?? input;
  if (!allowedKeys) return unwrapped === input ? null : unwrapped;
  try {
    const parsed = JSON.parse(unwrapped) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const extra = Object.keys(parsed).filter((key) => !allowedKeys.includes(key));
    if (extra.length === 0) return unwrapped === input ? null : unwrapped;
    for (const key of extra) delete parsed[key];
    return JSON.stringify(parsed);
  } catch {
    return null;
  }
}
