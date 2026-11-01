"use client";

import { useEffect, useState } from "react";
import { Loader2Icon, PaletteIcon, ShuffleIcon, Undo2Icon } from "lucide-react";
import {
  PRESET_BASE_COLORS,
  PRESET_CHART_COLORS,
  PRESET_FONT_HEADINGS,
  PRESET_FONTS,
  PRESET_ICON_LIBRARIES,
  PRESET_RADII,
  PRESET_STYLES,
  PRESET_THEMES,
} from "shadcn/preset";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { chartColorsForBaseColor, compatibleShadcnTheme, randomShadcnTheme, shadcnFontFamily, themesForBaseColor, type ShadcnTheme } from "@/lib/design/shadcn-theme";

const STYLE_NOTES: Record<string, string> = {
  vega: "Clean, neutral, and familiar",
  nova: "Reduced padding and margins",
  maia: "Rounded, with generous spacing",
  lyra: "Boxy and sharp. For mono fonts",
  mira: "Made for compact interfaces",
  luma: "Fluid, luminous, and soft",
  sera: "Editorial and typographic",
  rhea: "Like Luma but compact",
};

const SWATCHES: Record<string, string> = {
  neutral: "#737373", stone: "#78716c", zinc: "#71717a", gray: "#6b7280",
  mauve: "#79697b", olive: "#7c7c67", mist: "#67787c", taupe: "#7c6d67",
  amber: "#f59e0b", blue: "#3b82f6", cyan: "#06b6d4", emerald: "#10b981",
  fuchsia: "#d946ef", green: "#22c55e", indigo: "#6366f1", lime: "#84cc16",
  orange: "#f97316", pink: "#ec4899", purple: "#a855f7", red: "#ef4444",
  rose: "#f43f5e", sky: "#0ea5e9", teal: "#14b8a6", violet: "#8b5cf6", yellow: "#eab308",
};

const ICON_LIBRARIES: Record<string, string> = {
  lucide: "Lucide",
  hugeicons: "Hugeicons",
  tabler: "Tabler Icons",
  phosphor: "Phosphor Icons",
  remixicon: "Remix Icon",
};

const title = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

type Option = { value: string; label: string; note?: string; swatch?: string };

const FIELDS: Array<{ key: keyof ShadcnTheme; label: string; options: Option[] }> = [
  { key: "style", label: "Style", options: PRESET_STYLES.map((value) => ({ value, label: title(value), note: STYLE_NOTES[value] })) },
  { key: "baseColor", label: "Base color", options: PRESET_BASE_COLORS.map((value) => ({ value, label: title(value), swatch: SWATCHES[value] })) },
  { key: "theme", label: "Theme", options: PRESET_THEMES.map((value) => ({ value, label: title(value), swatch: SWATCHES[value] })) },
  { key: "chartColor", label: "Chart color", options: PRESET_CHART_COLORS.map((value) => ({ value, label: title(value), swatch: SWATCHES[value] })) },
  { key: "fontHeading", label: "Heading font", options: PRESET_FONT_HEADINGS.map((value) => ({ value, label: value === "inherit" ? "Same as body" : shadcnFontFamily(value) })) },
  { key: "font", label: "Font", options: PRESET_FONTS.map((value) => ({ value, label: shadcnFontFamily(value) })) },
  { key: "iconLibrary", label: "Icon library", options: PRESET_ICON_LIBRARIES.map((value) => ({ value, label: ICON_LIBRARIES[value] ?? title(value) })) },
  { key: "radius", label: "Radius", options: PRESET_RADII.map((value) => ({ value, label: title(value) })) },
  { key: "mode", label: "Mode", options: [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }] },
];

function Swatch({ color }: { color?: string }) {
  if (!color) return null;
  return <span className="size-3 shrink-0 rounded-full ring-1 ring-foreground/10" style={{ backgroundColor: color }} />;
}

export function ThemePanel({ projectId }: { projectId: string }) {
  const [saved, setSaved] = useState<ShadcnTheme | null>(null);
  const [draft, setDraft] = useState<ShadcnTheme | null>(null);
  const [hasDesignSystem, setHasDesignSystem] = useState(false);
  const [editable, setEditable] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      fetch(`/api/projects/${projectId}/theme`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Failed to load the theme");
          return response.json() as Promise<{ theme: ShadcnTheme; hasDesignSystem: boolean; editable: boolean }>;
        })
        .then((result) => {
          setSaved(result.theme);
          setDraft(result.theme);
          setHasDesignSystem(result.hasDesignSystem);
          setEditable(result.editable);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) toast.error(error instanceof Error ? error.message : "Failed to load the theme");
        });
    void load();
    window.addEventListener("bloom:revision-changed", load);
    return () => {
      controller.abort();
      window.removeEventListener("bloom:revision-changed", load);
    };
  }, [projectId]);

  if (!draft || !saved) {
    return (
      <div className="flex w-full max-w-2xl flex-col gap-4 p-4 pt-6">
        {FIELDS.map(({ key }) => <Skeleton key={key} className="h-14 w-full rounded-lg" />)}
      </div>
    );
  }

  const fields = hasDesignSystem ? FIELDS : FIELDS.filter((field) => field.key !== "mode");
  const dirty = fields.some(({ key }) => draft[key] !== saved[key]);

  const apply = async () => {
    setApplying(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/theme`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await response.json().catch(() => null) as { error?: string; warnings?: string[] } | null;
      if (!response.ok) throw new Error(body?.error ?? "Failed to apply the theme");
      setSaved(draft);
      window.dispatchEvent(new Event("bloom:revision-changed"));
      toast.success("Theme applied", body?.warnings?.length ? { description: body.warnings.join(" ") } : undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to apply the theme");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="flex min-h-0 w-full max-w-2xl flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 pt-5 pb-3">
        <PaletteIcon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Theme</h2>
        <span className="text-xs text-muted-foreground">The same options as shadcn create</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <div className="grid grid-cols-2 gap-x-3 gap-y-4 pb-4">
          {fields.map(({ key, label, options: all }) => {
            const options = key === "theme" || key === "chartColor"
              ? all.filter((option) => (key === "theme" ? themesForBaseColor : chartColorsForBaseColor)(draft.baseColor).includes(option.value as never))
              : all;
            const selected = options.find((option) => option.value === draft[key]);
            return (
              <label key={key} className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                {label}
                <Select
                  modal={false}
                  value={draft[key]}
                  disabled={applying || !editable}
                  onValueChange={(value) => setDraft(compatibleShadcnTheme({ ...draft, [key]: value } as ShadcnTheme).theme)}
                >
                  <SelectTrigger className="h-9 w-full text-foreground">
                    <SelectValue>
                      <Swatch color={selected?.swatch} />
                      {selected?.label ?? draft[key]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false} sideOffset={6} className="max-h-80 min-w-72">
                    <SelectGroup>
                      {options.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="py-1.5">
                          <Swatch color={option.swatch} />
                          <span>{option.label}</span>
                          {option.note ? <span className="text-xs text-muted-foreground">{option.note}</span> : null}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>
            );
          })}
        </div>
        {!editable ? (
          <p className="pb-4 text-xs text-muted-foreground">
            This site was designed before theme editing existed, so its theme can&apos;t be changed here. Generate it again to make the theme editable.
          </p>
        ) : !hasDesignSystem ? (
          <p className="pb-4 text-xs text-muted-foreground">
            This project has no Bloom design system yet, so the preset is applied with plain shadcn apply.
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t p-3">
        <Button
          type="button"
          variant="ghost"
          disabled={applying || !editable}
          onClick={() => setDraft({ ...randomShadcnTheme(), mode: draft.mode })}
        >
          <ShuffleIcon />
          Shuffle
        </Button>
        <Button type="button" variant="ghost" disabled={applying || !dirty} onClick={() => setDraft(saved)}>
          <Undo2Icon />
          Reset
        </Button>
        <Button type="button" className="ml-auto" disabled={applying || !dirty || !editable} onClick={() => void apply()}>
          {applying ? <Loader2Icon className="animate-spin" /> : null}
          {applying ? "Applying, about a minute" : "Apply theme"}
        </Button>
      </div>
    </div>
  );
}
