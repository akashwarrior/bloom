import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";

const createProjectSchema = z.strictObject({
  title: z.string().trim().min(1).max(120).optional(),
});

const listProjectsSchema = z.strictObject({
  cursor: z.cuid2().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(14),
  query: z.string().trim().max(120).default(""),
  sort: z.enum(["updatedAt", "createdAt", "title"]).default("updatedAt"),
});

const projectSelect = {
  id: true,
  title: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(req: NextRequest) {
  const userId = req.headers.get("user-id") as string;
  const parsed = listProjectsSchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }

  const { cursor, limit, query, sort } = parsed.data;

  const projectWhere = {
    userId,
    ...(query && {
      title: { contains: query, mode: "insensitive" as const },
    }),
  };

  if (cursor) {
    const cursorProject = await prisma.project.findFirst({
      where: { id: cursor, ...projectWhere },
      select: { id: true },
    });

    if (!cursorProject) {
      return NextResponse.json(
        { error: "Invalid cursor" },
        { status: 400 }
      );
    }
  }

  const projects = await prisma.project.findMany({
    where: projectWhere,
    orderBy: [
      { [sort]: sort === "title" ? "asc" : "desc" },
      { id: sort === "title" ? "asc" : "desc" },
    ],
    cursor: cursor ? { id: cursor } : undefined,
    skip: cursor ? 1 : undefined,
    take: limit + 1,
    select: projectSelect,
  });

  const hasNextPage = projects.length > limit;
  const items = hasNextPage ? projects.slice(0, limit) : projects;

  return NextResponse.json({
    projects: items,
    nextCursor: hasNextPage ? items.at(-1)?.id ?? null : null,
  });
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get("user-id") as string;
  const body = await req.json().catch(() => null);

  const parsed = createProjectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }

  const title = parsed.data.title || "Untitled project";

  const project = await prisma.project.create({
    data: {
      userId,
      title,
    },
    select: projectSelect,
  });

  return NextResponse.json(project, {
    status: 201,
  });
}
