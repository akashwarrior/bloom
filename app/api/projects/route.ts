import { z } from "zod";

import { parseJson, parseSearchParams, requireUserId, route } from "@/lib/http.server";
import prisma from "@/lib/prisma";
import { projectSummarySelect } from "@/lib/projects/access.server";

const listSchema = z.object({
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(14),
  query: z.string().trim().max(120).default(""),
  sort: z.enum(["updatedAt", "createdAt", "title"]).default("updatedAt"),
});

const createSchema = z.strictObject({
  title: z.string().trim().min(1).max(120).optional(),
});

export const GET = route(async (request) => {
  const userId = await requireUserId(request);
  const { cursor, limit, query, sort } = parseSearchParams(request, listSchema, "Invalid query parameters");
  const direction = sort === "title" ? "asc" : "desc";
  const projects = await prisma.project.findMany({
    where: { userId, ...(query && { title: { contains: query, mode: "insensitive" } }) },
    orderBy: [{ [sort]: direction }, { id: direction }],
    ...(cursor && { cursor: { id: cursor, userId }, skip: 1 }),
    take: limit + 1,
    select: projectSummarySelect,
  });
  const page = projects.slice(0, limit);
  return Response.json({
    projects: page,
    nextCursor: projects.length > limit ? page.at(-1)!.id : null,
  });
});

export const POST = route(async (request) => {
  const userId = await requireUserId(request);
  const { title = "Untitled project" } = await parseJson(request, createSchema);
  const project = await prisma.project.create({
    data: { userId, title },
    select: projectSummarySelect,
  });
  return Response.json(project, { status: 201 });
});
