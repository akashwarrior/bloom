import { after } from "next/server";
import { z } from "zod";

import {
  MAX_CHAT_ATTACHMENT_SIZE,
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_ATTACHMENTS_SIZE,
  SUPPORTED_CHAT_ATTACHMENT_TYPES,
} from "@/lib/assets";
import { HttpError, parseJson, route } from "@/lib/http.server";
import { requireProject } from "@/lib/projects/access.server";
import {
  createProjectUploads,
  expireProjectUploads,
  finalizeProjectUploads,
} from "@/lib/projects/uploads.server";

const INVALID = "Invalid attachments";

const createSchema = z.strictObject({
  files: z
    .array(z.strictObject({
      filename: z.string().trim().min(1).max(255),
      mediaType: z.enum(SUPPORTED_CHAT_ATTACHMENT_TYPES),
      size: z.int().positive().max(MAX_CHAT_ATTACHMENT_SIZE),
    }))
    .min(1)
    .max(MAX_CHAT_ATTACHMENTS)
    .refine((files) => files.reduce((total, file) => total + file.size, 0) <= MAX_CHAT_ATTACHMENTS_SIZE),
});

const finalizeSchema = z.strictObject({
  assetIds: z
    .array(z.uuid())
    .min(1)
    .max(MAX_CHAT_ATTACHMENTS)
    .refine((ids) => new Set(ids).size === ids.length),
});

export const POST = route(async (request, { params }: RouteContext<"/api/projects/[id]/assets">) => {
  const project = await requireProject(request, (await params).id);
  after(() => expireProjectUploads(project.id).catch(() => {}));
  const { files } = await parseJson(request, createSchema, INVALID);
  return Response.json({ assets: await createProjectUploads(project.id, files) }, { status: 201 });
});

export const PATCH = route(async (request, { params }: RouteContext<"/api/projects/[id]/assets">) => {
  const project = await requireProject(request, (await params).id);
  const { assetIds } = await parseJson(request, finalizeSchema, INVALID);
  const files = await finalizeProjectUploads(project.id, assetIds).catch((error) => {
    console.error("Failed to finalize asset uploads", error);
    throw new HttpError(409, "Attachments are not ready");
  });
  if (!files) throw new HttpError(400, INVALID);
  return Response.json({ files });
});
