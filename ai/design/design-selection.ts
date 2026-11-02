import { z } from "zod";

import { designDirectionSchema } from "./direction.ts";

/**
 * The design director's output: an art direction written for this request.
 * Brand name and final copy stay with the main agent.
 */
export const designSelectionSchema = z.strictObject({
  direction: designDirectionSchema,
});

export type DesignSelection = z.infer<typeof designSelectionSchema>;
