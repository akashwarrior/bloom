"use client";

import { useEffect, useState } from "react";
import { Loader2Icon, PaletteIcon, ShuffleIcon, Undo2Icon } from "lucide-react";
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
import {
  BASE_COLOR_OPTIONS,
  FONT_OPTIONS,
  HEADING_FONT_OPTIONS,
  ICON_OPTIONS,
  MENU_ACCENT_OPTIONS,
  MENU_COLOR_OPTIONS,
  MODE_OPTIONS,
  RADIUS_OPTIONS,
  STYLE_OPTIONS,
  THEME_COLOR_OPTIONS,
  THEME_FIELDS,
  type ThemeSelection,
} from "@/lib/design/theme-options";
import { chartColorsForBaseColor, compatibleShadcnTheme, randomShadcnTheme, themesForBaseColor, type ShadcnTheme } from "@/lib/design/shadcn-theme";

type Option = { value: string; label: string; note?: string; swatch?: string };

const OPTIONS: Record<keyof ThemeSelection, Option[]> = {
  style: Object.entries(STYLE_OPTIONS).map(([value, option]) => ({
    value,
    label: option.label,
    note: option.description,
  })),
  baseColor: Object.entries(BASE_COLOR_OPTIONS).map(([value, option]) => ({
    value,
    label: option.label,
    note: option.temperature,
    swatch: option.swatch,
  })),
  theme: Object.entries(THEME_COLOR_OPTIONS).map(([value, option]) => ({
    value,
    label: option.label,
    swatch: option.swatch,
  })),
  chartColor: Object.entries(THEME_COLOR_OPTIONS).map(([value, option]) => ({
    value,
    label: option.label,
    swatch: option.swatch,
  })),
  fontHeading: Object.entries(HEADING_FONT_OPTIONS).map(([value, option]) => ({
    value,
    label: option.label,
  })),
  font: Object.entries(FONT_OPTIONS).map(([value, option]) => ({
    value,
    label: option.label,
  })),
  iconLibrary: Object.entries(ICON_OPTIONS).map(([value, option]) => ({
    value,
    label: option.label,
  })),
  radius: Object.entries(RADIUS_OPTIONS).map(([value, option]) => ({
    value,
    label: option.label,
    note: option.px === null ? undefined : `${option.px}px`,
  })),
  mode: MODE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
  menuAccent: Object.entries(MENU_ACCENT_OPTIONS).map(([value, option]) => ({
    value,
    label: option.label,
    note: option.note,
  })),
  menuColor: Object.entries(MENU_COLOR_OPTIONS).map(([value, option]) => ({
    value,
    label: option.label,
    note: option.note,
  })),
};

const FIELDS: Array<{ key: keyof ShadcnTheme; label: string; options: Option[] }> =
  THEME_FIELDS.map(({ key, label }) => ({ key, label, options: OPTIONS[key] }));

function Swatch({ color }: { color?: string }) {
  if (!color) return null;
  return <span className="size-3 shrink-0 rounded-full ring-1 ring-foreground/10" style={{ backgroundColor: color }} />;
}

export function ThemePanel({ projectId }: { projectId: string }) {
  const [saved, setSaved] = useState<ShadcnTheme | null>(null);
  const [draft, setDraft] = useState<ShadcnTheme | null>(null);
  const [hasDesignSystem, setHasDesignSystem] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      fetch(`/api/projects/${projectId}/theme`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Failed to load the theme");
          return response.json() as Promise<{ theme: ShadcnTheme; hasDesignSystem: boolean }>;
        })
        .then((result) => {
          setSaved(result.theme);
          setDraft(result.theme);
          setHasDesignSystem(result.hasDesignSystem);
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
                  disabled={applying}
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
        {!hasDesignSystem ? (
          <p className="pb-4 text-xs text-muted-foreground">
            This project has no Bloom design system yet, so the preset is applied with plain shadcn apply.
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t p-3">
        <Button
          type="button"
          variant="ghost"
          disabled={applying}
          onClick={() => setDraft({ ...randomShadcnTheme(), mode: draft.mode })}
        >
          <ShuffleIcon />
          Shuffle
        </Button>
        <Button type="button" variant="ghost" disabled={applying || !dirty} onClick={() => setDraft(saved)}>
          <Undo2Icon />
          Reset
        </Button>
        <Button type="button" className="ml-auto" disabled={applying || !dirty} onClick={() => void apply()}>
          {applying ? <Loader2Icon className="animate-spin" /> : null}
          {applying ? "Applying, about a minute" : "Apply theme"}
        </Button>
      </div>
    </div>
  );
}
