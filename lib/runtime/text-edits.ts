export type TextEdit = { oldString: string; newString: string };

function occurrences(haystack: string, needle: string) {
  let count = 0;
  let index = 0;
  while (true) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) return count;
    count++;
    index = found + 1;
  }
}

/** Where the file comes closest to a missed anchor, shown so the next attempt needs no extra read. */
function nearestText(content: string, anchor: string) {
  const lines = content.split("\n");
  const wanted = anchor.split("\n").map((line) => line.trim()).filter((line) => line.length >= 12);
  for (const line of wanted) {
    const at = lines.findIndex((candidate) => candidate.trim() === line);
    if (at === -1) continue;
    const from = Math.max(0, at - 2);
    const shown = lines.slice(from, at + 6).join("\n").slice(0, 900);
    return ` The closest text starts at line ${from + 1}:\n${shown}`;
  }
  return "";
}

/**
 * Replaces exact text anchors in order. Each anchor must appear exactly once
 * in the file as it exists when that replacement is applied. Later edits see
 * the result of earlier edits.
 */
export function applyTextEdits(path: string, content: string, edits: TextEdit[]) {
  let next = content;

  for (const [index, edit] of edits.entries()) {
    const label = `replacement ${index + 1}`;

    if (edit.oldString.length === 0) {
      throw new Error(`${path}: ${label} oldString must not be empty.`);
    }

    const first = next.indexOf(edit.oldString);
    if (first === -1) {
      throw new Error(
        `${path}: ${label} oldString was not found. Copy the exact current text, including indentation.${nearestText(next, edit.oldString) || " Reread the file first."}`,
      );
    }

    const count = occurrences(next, edit.oldString);
    if (count > 1) {
      throw new Error(
        `${path}: ${label} oldString appears ${count} times. Include more surrounding text so it matches exactly once.`,
      );
    }

    if (edit.oldString === edit.newString) {
      throw new Error(
        `${path}: ${label} newString is identical to oldString; make an actual change.`,
      );
    }

    next = `${next.slice(0, first)}${edit.newString}${next.slice(first + edit.oldString.length)}`;
  }

  if (next === content) {
    throw new Error(`${path}: replacement made no change.`);
  }

  return next;
}
