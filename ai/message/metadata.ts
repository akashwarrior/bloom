import z from "zod/v4";

export const elementSelectionSchema = z.object({
  route: z.string().max(300),
  tag: z.string().max(40),
  components: z.array(z.string().max(80)).max(8),
  selector: z.string().max(400),
  classes: z.string().max(600),
  text: z.string().max(400),
  html: z.string().max(2_000),
});

export type ElementSelection = z.infer<typeof elementSelectionSchema>;

const messageMetadataSchema = z.object({
  mode: z.enum(["BUILD", "PLAN"]).default("BUILD"),
  selections: z.array(elementSelectionSchema).max(8).optional(),
});

export const metadataSchema = messageMetadataSchema.optional().nullable();

export type Metadata = z.infer<typeof messageMetadataSchema>;
