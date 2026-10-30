/**
 * Repair the two unified-diff mistakes models make most often before handing
 * the patch to applyPatch:
 *
 * 1. Bare empty lines that should be context — the model emits a truly empty
 *    line ("") instead of a single-space prefix (" "). applyPatch rejects
 *    these as "invalid line".
 *
 * 2. Wrong line counts in @@ hunk headers — models cannot reliably count
 *    lines, so the "-X,Y +A,B" header frequently disagrees with the body.
 *    We recount from the actual body content and rewrite the header.
 *
 * The patch body content itself is left untouched; only prefixes and the
 * hunk header metadata are normalized.
 */
export function normalizePatch(patch: string) {
  const lines = patch.split("\n");
  // The patch string usually ends with a newline, which yields a phantom
  // trailing "" element. Treating it as a context line inflates the final
  // hunk's counts and makes applyPatch reject the patch.
  if (lines.at(-1) === "") {
    lines.pop();
  }
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Pass through file headers (--- / +++) verbatim if the model included them.
    if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      out.push(line);
      i++;
      continue;
    }

    // Hunk header: @@ -startOld,countOld +startNew,countNew @@ [section]
    if (line.startsWith("@@")) {
      // Collect the full body of this hunk to recount.
      const bodyStart = i + 1;
      let oldCount = 0;
      let newCount = 0;
      let j = bodyStart;

      while (j < lines.length) {
        const body = lines[j];
        if (body.startsWith("@@")) break;
        // Stop at file headers (next file in a multi-file patch — not used
        // here since each patch targets one file, but be safe).
        if (body.startsWith("--- ") || body.startsWith("+++ ")) break;

        if (body === "") {
          // Bare empty line → treat as context.
          oldCount++;
          newCount++;
        } else if (body.startsWith("-")) {
          oldCount++;
        } else if (body.startsWith("+")) {
          newCount++;
        } else if (body.startsWith(" ")) {
          oldCount++;
          newCount++;
        } else if (body.startsWith("\\")) {
          // "\ No newline at end of file" marker — not counted.
        } else {
          // Any other unprefixed non-empty line is also treated as context,
          // which is the most common intent (model forgot the leading space).
          oldCount++;
          newCount++;
        }
        j++;
      }

      // Preserve the original start line numbers; only recount the counts.
      const replaced = line.replace(
        /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/,
        `@@ -$1,${oldCount} +$2,${newCount} @@`,
      );
      out.push(replaced);

      // Emit the body with bare empty lines fixed to single-space context.
      for (let k = bodyStart; k < j; k++) {
        const body = lines[k];
        if (body === "") {
          out.push(" ");
        } else {
          out.push(body);
        }
      }

      i = j;
      continue;
    }

    // Lines before the first hunk header (rare): pass through.
    out.push(line);
    i++;
  }

  return out.join("\n");
}