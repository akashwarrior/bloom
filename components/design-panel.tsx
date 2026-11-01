"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  ChevronRightIcon,
  ItalicIcon,
  Loader2Icon,
  MessageSquarePlusIcon,
  Redo2Icon,
  RotateCcwIcon,
  SparklesIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import type { ElementSelection } from "@/ai/message/metadata";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DESIGN_PROPS,
  displayValue,
  editCss,
  FONT_WEIGHTS,
  rgbToHex,
  SHADOWS,
  type DesignEdits,
  type DesignElement,
  type DesignProp,
} from "@/lib/design-mode/styles";
import {
  ELEMENT_SELECTED_EVENT,
  SEND_TO_CHAT_EVENT,
  selectionLabel,
  type SendToChatDetail,
} from "@/lib/element-selection";
import { cn } from "@/lib/utils";

type Draft = { edits: DesignEdits; text: string };

const PRESETS = ["modern", "contrast", "spacious", "simplify", "readable", "shadows", "pop", "hierarchy"];

const LABELS: Record<DesignProp, string> = {
  position: "position",
  display: "display",
  flexDirection: "direction",
  alignItems: "align items",
  justifyContent: "justify content",
  width: "width",
  height: "height",
  paddingTop: "padding top",
  paddingRight: "padding right",
  paddingBottom: "padding bottom",
  paddingLeft: "padding left",
  marginTop: "margin top",
  marginRight: "margin right",
  marginBottom: "margin bottom",
  marginLeft: "margin left",
  gap: "gap",
  fontFamily: "font",
  fontWeight: "font weight",
  fontSize: "font size",
  lineHeight: "line height",
  letterSpacing: "letter spacing",
  color: "text color",
  fontStyle: "font style",
  textAlign: "text align",
  opacity: "opacity",
  borderRadius: "corner radius",
  backgroundColor: "background",
  boxShadow: "shadow",
};

const PX_UNITS = new Set<DesignProp>([
  "width", "height", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "marginTop", "marginRight", "marginBottom", "marginLeft", "gap", "fontSize",
  "lineHeight", "letterSpacing", "borderRadius",
]);

function describeEdits(edits: DesignEdits, text: string | null) {
  const parts = DESIGN_PROPS.flatMap((prop) => {
    const value = edits[prop];
    if (value === undefined) return [];
    const shown = value.startsWith("token:")
      ? `the ${value.slice(6)} token`
      : PX_UNITS.has(prop) && /^-?\d/.test(value) ? `${value}px` : prop === "opacity" ? `${value}%` : value;
    return [`${LABELS[prop]} ${shown}`];
  });
  if (text !== null) parts.push(`text "${text}"`);
  return parts.join(", ");
}

function baseValues(design: DesignElement, classes: string) {
  const values = {} as Record<DesignProp, string>;
  const classList = classes.split(/\s+/);
  for (const prop of DESIGN_PROPS) {
    const computed = design.styles[prop] ?? "";
    if (prop === "color" || prop === "backgroundColor") {
      const prefix = prop === "color" ? "text-" : "bg-";
      const matches = design.tokens.colors
        .filter((entry) => entry.value === computed)
        .sort((a, b) => a.name.length - b.name.length);
      const token = matches.find((entry) => classList.includes(`${prefix}${entry.name}`)) ?? matches[0];
      values[prop] = token ? `token:${token.name}` : rgbToHex(computed) ?? computed;
    } else if (prop === "fontFamily") {
      const first = (value: string) => value.split(",")[0]!.replace(/["']/g, "").trim().toLowerCase();
      const token = design.tokens.fonts.find((entry) => first(entry.value) === first(computed));
      values[prop] = token ? `token:${token.name}` : computed;
    } else if (prop === "boxShadow") {
      const match = Object.entries(SHADOWS).find(([, value]) => value === computed);
      values[prop] = computed === "none" ? "none" : match?.[0] ?? "custom";
    } else if (prop === "alignItems" || prop === "justifyContent") {
      values[prop] = computed.replace(/^flex-/, "").replace(/^space-/, "").replace("normal", "stretch");
    } else if (prop === "flexDirection") {
      values[prop] = computed.startsWith("column") ? "col" : "row";
    } else {
      values[prop] = displayValue(prop, computed);
    }
  }
  return values;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-b px-3 py-3">
      <h3 className="text-[11px] font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

const fieldClass =
  "h-7 w-full min-w-0 rounded-md border border-transparent bg-muted/60 px-2 text-xs tabular-nums outline-none transition-colors hover:border-border focus:border-ring focus:bg-background";

function NumberField({ label, value, onChange, title }: { label: ReactNode; value: string; onChange: (value: string) => void; title: string }) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const shown = focused ? draft : value;

  const step = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const number = Number(shown);
    if (!Number.isFinite(number)) return;
    event.preventDefault();
    const delta = (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1);
    const next = String(Math.round((number + delta) * 10) / 10);
    setDraft(next);
    onChange(next);
  };

  return (
    <label
      className="flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-transparent bg-muted/60 px-2 transition-colors hover:border-border focus-within:border-ring focus-within:bg-background"
      title={title}
    >
      <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{label}</span>
      <input
        value={shown}
        className="h-full w-full min-w-0 bg-transparent text-xs tabular-nums outline-none"
        onFocus={(event) => {
          setDraft(value);
          setFocused(true);
          event.currentTarget.select();
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          step(event);
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = event.target.value.trim();
          if (/^-?\d+(?:\.\d+)?$/.test(next) || ["auto", "100%", "fit-content", "normal"].includes(next)) onChange(next);
        }}
      />
    </label>
  );
}

function SelectField({ value, options, onChange, title }: { value: string; options: [string, string][]; onChange: (value: string) => void; title: string }) {
  const known = options.some(([option]) => option === value);
  return (
    <select title={title} value={value} className={cn(fieldClass, "pr-1")} onChange={(event) => onChange(event.target.value)}>
      {!known && <option value={value}>{value.replace(/^token:/, "")}</option>}
      {options.map(([option, label]) => (
        <option key={option} value={option}>{label}</option>
      ))}
    </select>
  );
}

function ColorField({ value, tokens, onChange, title }: { value: string; tokens: DesignElement["tokens"]["colors"]; onChange: (value: string) => void; title: string }) {
  const token = value.startsWith("token:") ? tokens.find((entry) => entry.name === value.slice(6)) : null;
  const hex = token ? rgbToHex(token.value) ?? "#000000" : value;
  const swatch = hex === "transparent" || !hex.startsWith("#") ? "#ffffff" : hex.slice(0, 7);
  return (
    <div className="flex items-center gap-1.5" title={title}>
      <label
        className="relative size-7 shrink-0 overflow-hidden rounded-md border"
        style={{ background: hex === "transparent" ? "repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 0 0 / 8px 8px" : hex }}
      >
        <input type="color" value={swatch} className="absolute inset-0 cursor-pointer opacity-0" onChange={(event) => onChange(event.target.value)} />
      </label>
      <input
        key={value}
        defaultValue={token ? token.name : hex}
        className={cn(fieldClass, "font-mono")}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        onBlur={(event) => {
          const next = event.target.value.trim();
          if (/^#?[0-9a-f]{6}$/i.test(next)) onChange(next.startsWith("#") ? next : `#${next}`);
          else if (tokens.some((entry) => entry.name === next)) onChange(`token:${next}`);
          else if (next === "transparent") onChange("transparent");
        }}
      />
      <select
        aria-label="Design token"
        value={token ? value : ""}
        className={cn(fieldClass, "w-20 shrink-0 px-1")}
        onChange={(event) => event.target.value && onChange(event.target.value)}
      >
        <option value="">Token</option>
        {tokens.map((entry) => (
          <option key={entry.name} value={`token:${entry.name}`}>{entry.name}</option>
        ))}
      </select>
    </div>
  );
}

function ToggleButton({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" size="icon-sm" variant={active ? "secondary" : "ghost"} aria-label={label} aria-pressed={active} title={label} onClick={onClick}>
      {children}
    </Button>
  );
}

export function DesignPanel({
  projectId,
  selection,
  design,
  inlineText,
  post,
  onClose,
}: {
  projectId: string;
  selection: ElementSelection;
  design: DesignElement;
  inlineText: string | null;
  post: (message: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const base = useMemo(() => baseValues(design, selection.classes), [design, selection.classes]);
  const originalText = selection.text;
  const [history, setHistory] = useState<Draft[]>([{ edits: {}, text: originalText }]);
  const [cursor, setCursor] = useState(0);
  const [instruction, setInstruction] = useState("");
  const [applying, setApplying] = useState(false);
  const draft = history[cursor]!;
  const lastInline = useRef<string | null>(null);

  const lastChange = useRef({ key: "", at: 0 });

  const commitDraft = useCallback((next: Draft, key: string) => {
    const now = Date.now();
    const coalesce = key === lastChange.current.key && now - lastChange.current.at < 1000 && cursor > 0;
    lastChange.current = { key, at: now };
    if (coalesce) {
      setHistory((current) => [...current.slice(0, cursor), next]);
      return;
    }
    setHistory((current) => [...current.slice(0, cursor + 1), next].slice(-100));
    setCursor((current) => Math.min(current + 1, 99));
  }, [cursor]);

  useEffect(() => {
    const css: Record<string, string> = {};
    for (const prop of DESIGN_PROPS) {
      const value = draft.edits[prop];
      if (value !== undefined) css[prop] = editCss(prop, value);
    }
    post({ type: "style", css });
  }, [draft.edits, post]);

  useEffect(() => {
    if (design.textEditable && draft.text !== lastInline.current) post({ type: "text", value: draft.text });
  }, [design.textEditable, draft.text, post]);

  useEffect(() => {
    if (inlineText === null || inlineText === lastInline.current || inlineText === draft.text) return;
    lastInline.current = inlineText;
    commitDraft({ edits: draft.edits, text: inlineText }, "inline-text");
  }, [inlineText, draft, commitDraft]);

  const value = (prop: DesignProp) => draft.edits[prop] ?? base[prop];
  const set = (prop: DesignProp) => (next: string) => {
    if (value(prop) === next) return;
    const edits = { ...draft.edits };
    if (next === base[prop]) delete edits[prop];
    else edits[prop] = next;
    commitDraft({ edits, text: draft.text }, prop);
  };

  const textChanged = design.textEditable && draft.text.trim() !== originalText.trim();
  const changeCount = Object.keys(draft.edits).length + (textChanged ? 1 : 0);

  const sendToChat = (text: string) => {
    window.dispatchEvent(new CustomEvent<SendToChatDetail>(SEND_TO_CHAT_EVENT, { detail: { text, selections: [selection] } }));
  };

  const reset = () => {
    setHistory([{ edits: {}, text: originalText }]);
    setCursor(0);
    post({ type: "reset" });
  };

  const apply = async () => {
    if (changeCount === 0 || applying) return;
    setApplying(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/design-edit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          selection,
          edits: draft.edits,
          ...(textChanged ? { text: { from: originalText, to: draft.text } } : {}),
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; fallback?: boolean; path?: string; line?: number };
      if (!response.ok) {
        if (result.fallback) {
          sendToChat(`Apply these design changes to the selected element: ${describeEdits(draft.edits, textChanged ? draft.text : null)}.`);
          toast.info(`${result.error} Sent the change to Bloom instead.`);
          return;
        }
        throw new Error(result.error || "Failed to apply the edit");
      }
      post({ type: "commit" });
      window.dispatchEvent(new Event("bloom:revision-changed"));
      toast.success(`Saved to ${result.path}:${result.line}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to apply the edit");
    } finally {
      setApplying(false);
    }
  };

  const submitInstruction = () => {
    const text = instruction.trim();
    if (!text) return;
    const pending = changeCount > 0 ? ` Also apply these design changes: ${describeEdits(draft.edits, textChanged ? draft.text : null)}.` : "";
    sendToChat(`${text}${pending}`);
    setInstruction("");
  };

  const isFlex = /flex|grid/.test(value("display"));
  const fontOptions: [string, string][] = design.tokens.fonts.map((font) => [`token:${font.name}`, `${font.name} · ${font.value.split(",")[0]!.replace(/["']/g, "")}`]);
  const weight = value("fontWeight");

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l bg-background text-xs">
      <header className="flex h-10 shrink-0 items-center gap-1 border-b px-3">
        <span className="font-mono text-sm font-medium">{selection.tag}</span>
        {selection.components[0] && <span className="truncate text-muted-foreground">in {selection.components[0]}</span>}
        <div className="ml-auto flex items-center">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Add to chat"
            title="Add this element to the chat"
            onClick={() => window.dispatchEvent(new CustomEvent(ELEMENT_SELECTED_EVENT, { detail: selection }))}
          >
            <MessageSquarePlusIcon />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Close design panel" onClick={onClose}>
            <XIcon />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Position">
          <SelectField
            title="Position"
            value={value("position")}
            options={[["static", "Auto (static)"], ["relative", "Relative"], ["absolute", "Absolute"], ["fixed", "Fixed"], ["sticky", "Sticky"]]}
            onChange={set("position")}
          />
        </Section>

        <Section title="Layout">
          <div className="grid grid-cols-2 gap-1.5">
            <SelectField
              title="Display"
              value={value("display")}
              options={[["block", "Block"], ["flex", "Flex"], ["grid", "Grid"], ["inline", "Inline"], ["inline-block", "Inline block"], ["inline-flex", "Inline flex"], ["none", "Hidden"]]}
              onChange={set("display")}
            />
            {isFlex ? (
              <SelectField title="Direction" value={value("flexDirection")} options={[["row", "Row →"], ["col", "Column ↓"]]} onChange={set("flexDirection")} />
            ) : <span />}
            {isFlex && (
              <>
                <SelectField
                  title="Align items"
                  value={value("alignItems")}
                  options={[["start", "Align start"], ["center", "Align center"], ["end", "Align end"], ["stretch", "Stretch"], ["baseline", "Baseline"]]}
                  onChange={set("alignItems")}
                />
                <SelectField
                  title="Justify content"
                  value={value("justifyContent")}
                  options={[["start", "Justify start"], ["center", "Justify center"], ["end", "Justify end"], ["between", "Space between"], ["around", "Space around"], ["evenly", "Space evenly"]]}
                  onChange={set("justifyContent")}
                />
              </>
            )}
            <NumberField label="W" title="Width (px, auto or 100%)" value={value("width")} onChange={set("width")} />
            <NumberField label="H" title="Height (px or auto)" value={value("height")} onChange={set("height")} />
          </div>
          <p className="pt-1 text-[10px] text-muted-foreground">Padding</p>
          <div className="grid grid-cols-4 gap-1.5">
            <NumberField label="T" title="Padding top" value={value("paddingTop")} onChange={set("paddingTop")} />
            <NumberField label="R" title="Padding right" value={value("paddingRight")} onChange={set("paddingRight")} />
            <NumberField label="B" title="Padding bottom" value={value("paddingBottom")} onChange={set("paddingBottom")} />
            <NumberField label="L" title="Padding left" value={value("paddingLeft")} onChange={set("paddingLeft")} />
          </div>
          <p className="pt-1 text-[10px] text-muted-foreground">Margin</p>
          <div className="grid grid-cols-4 gap-1.5">
            <NumberField label="T" title="Margin top" value={value("marginTop")} onChange={set("marginTop")} />
            <NumberField label="R" title="Margin right" value={value("marginRight")} onChange={set("marginRight")} />
            <NumberField label="B" title="Margin bottom" value={value("marginBottom")} onChange={set("marginBottom")} />
            <NumberField label="L" title="Margin left" value={value("marginLeft")} onChange={set("marginLeft")} />
          </div>
          {isFlex && (
            <div className="grid grid-cols-2 gap-1.5">
              <NumberField label="Gap" title="Gap between children" value={value("gap") === "normal" ? "0" : value("gap")} onChange={set("gap")} />
            </div>
          )}
        </Section>

        <Section title="Typography">
          <div className="flex items-center gap-0.5">
            <ToggleButton
              active={Number(weight) >= 600}
              label="Bold"
              onClick={() => set("fontWeight")(Number(weight) >= 600 ? "400" : "700")}
            >
              <BoldIcon />
            </ToggleButton>
            <ToggleButton
              active={value("fontStyle") === "italic"}
              label="Italic"
              onClick={() => set("fontStyle")(value("fontStyle") === "italic" ? "normal" : "italic")}
            >
              <ItalicIcon />
            </ToggleButton>
            <span className="mx-1 h-4 w-px bg-border" />
            {([["left", AlignLeftIcon], ["center", AlignCenterIcon], ["right", AlignRightIcon], ["justify", AlignJustifyIcon]] as const).map(([align, Icon]) => (
              <ToggleButton
                key={align}
                active={value("textAlign") === align || (align === "left" && value("textAlign") === "start")}
                label={`Align ${align}`}
                onClick={() => set("textAlign")(align)}
              >
                <Icon />
              </ToggleButton>
            ))}
          </div>
          {fontOptions.length > 0 && (
            <SelectField title="Font family" value={value("fontFamily")} options={fontOptions} onChange={set("fontFamily")} />
          )}
          <div className="grid grid-cols-2 gap-1.5">
            <SelectField
              title="Font weight"
              value={weight}
              options={Object.entries(FONT_WEIGHTS).map(([number, name]) => [number, `${number} ${name}`])}
              onChange={set("fontWeight")}
            />
            <NumberField label="Size" title="Font size (px)" value={value("fontSize")} onChange={set("fontSize")} />
            <NumberField label="LH" title="Line height (px)" value={value("lineHeight")} onChange={set("lineHeight")} />
            <NumberField label="LS" title="Letter spacing (px)" value={value("letterSpacing")} onChange={set("letterSpacing")} />
          </div>
          <ColorField title="Text color" value={value("color")} tokens={design.tokens.colors} onChange={set("color")} />
          {design.textEditable && (
            <Textarea
              value={draft.text}
              aria-label="Text content"
              className="min-h-14 resize-none text-xs"
              onChange={(event) => commitDraft({ edits: draft.edits, text: event.target.value }, "text")}
            />
          )}
          {design.textEditable && (
            <p className="text-[10px] text-muted-foreground">Tip: double-click the text in the preview to edit it in place.</p>
          )}
        </Section>

        <Section title="Appearance">
          <div className="grid grid-cols-2 gap-1.5">
            <NumberField label="%" title="Opacity (%)" value={value("opacity")} onChange={set("opacity")} />
            <NumberField label="R" title="Corner radius (px)" value={value("borderRadius")} onChange={set("borderRadius")} />
          </div>
        </Section>

        <Section title="Background">
          <ColorField title="Background color" value={value("backgroundColor")} tokens={design.tokens.colors} onChange={set("backgroundColor")} />
        </Section>

        <Section title="Shadow">
          <SelectField
            title="Shadow"
            value={value("boxShadow")}
            options={Object.keys(SHADOWS).map((name) => [name, name === "none" ? "None" : name.toUpperCase()])}
            onChange={set("boxShadow")}
          />
        </Section>

        <Section title="Instructions">
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                onClick={() => setInstruction((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}/${preset} `)}
              >
                /{preset}
              </button>
            ))}
          </div>
          <Textarea
            value={instruction}
            placeholder="Describe a change for this element… (↵ to send, ⇧↵ for a new line)"
            className="min-h-20 resize-none text-xs"
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submitInstruction();
              }
            }}
          />
        </Section>
      </div>

      <footer className="shrink-0 space-y-2 border-t p-3">
        <div className="flex items-center gap-1">
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Undo" disabled={cursor === 0} onClick={() => {
            lastChange.current = { key: "", at: 0 };
            setCursor((current) => current - 1);
          }}>
            <Undo2Icon />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Redo" disabled={cursor >= history.length - 1} onClick={() => {
            lastChange.current = { key: "", at: 0 };
            setCursor((current) => current + 1);
          }}>
            <Redo2Icon />
          </Button>
          <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={() => sendToChat("Delete this element.")}>
            <Trash2Icon />
            Delete
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={changeCount === 0} onClick={reset}>
            <RotateCcwIcon />
            Reset
          </Button>
        </div>
        <Button type="button" className="w-full" disabled={changeCount === 0 || applying} onClick={() => void apply()}>
          {applying ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
          {changeCount === 0 ? "Apply" : `Apply ${changeCount} change${changeCount === 1 ? "" : "s"}`}
        </Button>
      </footer>

      {design.ancestors.length > 0 && (
        <nav aria-label="Element path" className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-t px-3 py-2 text-[11px] text-muted-foreground">
          {[...design.ancestors].reverse().slice(-4).map((ancestor, index, list) => (
            <button
              key={`${ancestor.tag}-${index}`}
              type="button"
              className="flex shrink-0 items-center gap-0.5 rounded px-1 hover:bg-muted hover:text-foreground"
              title={ancestor.component ? `${ancestor.tag} in ${ancestor.component}` : ancestor.tag}
              onClick={() => post({ type: "select-ancestor", depth: list.length - index })}
            >
              {ancestor.tag}
              <ChevronRightIcon className="size-3" />
            </button>
          ))}
          <span className="shrink-0 px-1 font-medium text-foreground">{selectionLabel(selection)}</span>
        </nav>
      )}
    </aside>
  );
}
