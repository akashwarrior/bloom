import type { ElementSelection } from "@/ai/message/metadata";

type SourceFile = { path: string; content: string };

export const ELEMENT_SELECTED_EVENT = "bloom:element-selected";

export function selectionLabel(selection: ElementSelection) {
  return selection.components[0]
    ? `${selection.components[0]} · ${selection.tag}`
    : selection.tag;
}

export function selectionKey(selection: ElementSelection) {
  return `${selection.route} ${selection.selector}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineOf(content: string, index: number) {
  return content.slice(0, index).split("\n").length;
}

function declarationOf(files: SourceFile[], name: string) {
  const pattern = new RegExp(
    `\\b(?:function|const|let|class)\\s+${escapeRegExp(name)}\\b`,
  );
  const matches = files.flatMap((file) => {
    const match = pattern.exec(file.content);
    return match ? [{ file, line: lineOf(file.content, match.index) }] : [];
  });
  return (
    matches.find(({ file }) => !file.path.includes("components/ui/")) ??
    matches[0] ??
    null
  );
}

function textLine(lines: string[], selection: ElementSelection) {
  const text = selection.text.replace(/\s+/g, " ").trim();
  const probes = [text.slice(0, 40), text.split(" ").slice(0, 4).join(" ")]
    .filter((probe) => probe.length >= 4);
  for (const probe of probes) {
    const index = lines.findIndex((line) => line.includes(probe));
    if (index !== -1) return { line: index + 1, by: "text" };
  }
  return null;
}

function classLine(lines: string[], selection: ElementSelection) {
  const classes = selection.classes.split(/\s+/).filter(Boolean);
  if (classes.length === 0) return null;
  let best = { line: 0, score: 0 };
  lines.forEach((line, index) => {
    if (!/class(?:Name)?=|cn\(/.test(line)) return;
    const score = classes.filter((name) => line.includes(name)).length;
    if (score > best.score) best = { line: index + 1, score };
  });
  return best.score >= Math.min(2, classes.length)
    ? { line: best.line, by: "classes" }
    : null;
}

function elementLine(file: SourceFile, selection: ElementSelection) {
  const lines = file.content.split("\n");
  return selection.text.length > 80
    ? classLine(lines, selection) ?? textLine(lines, selection)
    : textLine(lines, selection) ?? classLine(lines, selection);
}

/** The component file that renders a selection and the line of the element inside it. */
export function locateElement(selection: ElementSelection, files: SourceFile[]) {
  const sources = files.filter((file) => /\.[jt]sx$/.test(file.path));
  const owners = selection.components.flatMap((name) => {
    const declaration = declarationOf(sources, name);
    return declaration ? [{ name, ...declaration }] : [];
  });
  const owner =
    owners.find(({ file }) => !file.path.includes("components/ui/")) ??
    owners[0] ??
    null;
  const match = owner ? elementLine(owner.file, selection) : null;
  return { owners, owner, match };
}

/** Turns preview selections into model context that names the source each element comes from. */
export function describeSelections(
  selections: ElementSelection[],
  files: SourceFile[],
) {
  const entries = selections.map((selection, index) => {
    const { owners, owner, match } = locateElement(selection, files);
    const source = owner
      ? match
        ? `${owner.file.path}:${match.line} (matched by ${match.by})`
        : `${owner.file.path}, inside ${owner.name} (declared at line ${owner.line})`
      : "not resolved; search for the text or classes below";

    return [
      `${index + 1}. <${selection.tag}>${selection.components[0] ? ` in ${selection.components[0]}` : ""} on route ${selection.route}`,
      `   source: ${source}`,
      owners.length > 0
        ? `   component chain: ${owners.map(({ name, file, line }) => `${name} (${file.path}:${line})`).join(" < ")}`
        : null,
      selection.text ? `   text: ${JSON.stringify(selection.text.slice(0, 200))}` : null,
      `   selector: ${selection.selector}`,
      `   html: ${selection.html}`,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return `<selected-elements>
The user picked these elements in the live preview. Apply the request to these exact elements and leave the rest of the page unchanged.
${entries.join("\n\n")}
</selected-elements>`;
}

export const SEND_TO_CHAT_EVENT = "bloom:send-to-chat";

export type SendToChatDetail = { text: string; selections: ElementSelection[] };
