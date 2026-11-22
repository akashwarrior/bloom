import z from "zod/v4";

import { designDirectionSchema } from "./direction.ts";
import { shadcnThemeSchema, type ShadcnTheme } from "./shadcn-theme.ts";

/**
 * The parts of a shadcn create preset that the direction cannot express in
 * CSS: component geometry, the icon package and menu markup. Colors, fonts and
 * radius come from the direction itself.
 */
export const componentBaseSchema = shadcnThemeSchema.pick({
  style: true,
  iconLibrary: true,
  radius: true,
  menuAccent: true,
  menuColor: true,
});

export type ComponentBase = z.infer<typeof componentBaseSchema>;

/**
 * The design director's output: an art direction written for this request and
 * the component base it is built on. Brand name and final copy stay with the
 * main agent.
 */
export const designSelectionSchema = z.strictObject({
  direction: designDirectionSchema,
  components: componentBaseSchema,
});

export type DesignSelection = z.infer<typeof designSelectionSchema>;

/**
 * The shadcn preset that carries a direction. Its own colors and fonts are the
 * neutral defaults because the direction's tokens and fonts replace them.
 */
export function presetForComponents(components: ComponentBase, mode: "light" | "dark"): ShadcnTheme {
  return {
    ...components,
    baseColor: "neutral",
    theme: "neutral",
    chartColor: "neutral",
    font: "inter",
    fontHeading: "inherit",
    mode,
  };
}
