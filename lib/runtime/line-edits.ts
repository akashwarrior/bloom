export type LineEdit = { startLine: number; endLine: number; content: string };

/**
 * Replaces 1-based inclusive line ranges. Every range refers to the file as it
 * was before any of the edits; endLine = startLine - 1 inserts before startLine.
 */
export function applyLineEdits(path: string, content: string, edits: LineEdit[]) {
  const lines = content.length === 0 ? [] : content.split("\n");
  const sorted = [...edits].sort((a, b) => a.startLine - b.startLine);
  for (const [index, edit] of sorted.entries()) {
    if (!Number.isInteger(edit.startLine) || !Number.isInteger(edit.endLine)) {
      throw new Error(`${path}: startLine and endLine must be integers`);
    }
    if (edit.startLine < 1 || edit.startLine > lines.length + 1) {
      throw new Error(`${path}: startLine ${edit.startLine} is outside the file (1-${lines.length + 1}); the file has ${lines.length} lines. Reread it and use current line numbers.`);
    }
    if (edit.endLine < edit.startLine - 1 || edit.endLine > lines.length) {
      throw new Error(`${path}: endLine ${edit.endLine} must be between ${edit.startLine - 1} (insert) and ${lines.length}.`);
    }
    const previous = sorted[index - 1];
    if (previous && edit.startLine <= Math.max(previous.endLine, previous.startLine - 1)) {
      throw new Error(`${path}: edits at lines ${previous.startLine}-${previous.endLine} and ${edit.startLine}-${edit.endLine} overlap. Merge them into one edit.`);
    }
  }
  for (const edit of [...sorted].reverse()) {
    const replacement = edit.content.length === 0 ? [] : edit.content.replace(/\n$/, "").split("\n");
    lines.splice(edit.startLine - 1, edit.endLine - edit.startLine + 1, ...replacement);
  }
  return lines.join("\n");
}
