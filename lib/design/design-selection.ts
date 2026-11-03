import z from "zod/v4";

import { shadcnThemeSchema } from "./shadcn-theme.ts";

/**
 * The design director's entire output: one shadcn create preset. The page,
 * brand, copy and layout belong to the main agent, so they are deliberately
 * not part of this schema.
 */
export const designSelectionSchema = z.strictObject({
  shadcn: shadcnThemeSchema,
});

export type DesignSelection = z.infer<typeof designSelectionSchema>;
