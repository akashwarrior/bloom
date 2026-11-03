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
        `${path}: ${label} oldString was not found. Reread the file and copy the exact current text, including indentation.`,
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
