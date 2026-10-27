import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { deleteStoredObjects } from "@/lib/storage";
import { z } from "zod";

const updateProjectSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
});

const projectIdSchema = z.cuid2();

type RouteContext = {
  params: Promise<{ id: string }>;
};

const projectSelect = {
  id: true,
  title: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(req: Request, context: RouteContext) {
  const userId = req.headers.get("user-id") as string;

  const { id: rawId } = await context.params;
  const parsedId = projectIdSchema.safeParse(rawId);

  if (!parsedId.success) {
    return NextResponse.json(
      { error: "Project not found" },
      { status: 404 }
    );
  }

  const id = parsedId.data;
  const project = await prisma.project.findFirst({
    where: { id, userId },
    select: projectSelect,
  });

  if (!project) {
    return NextResponse.json(
      { error: "Project not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(project);
}

export async function PATCH(req: Request, context: RouteContext) {
  const userId = req.headers.get("user-id") as string;

  const { id: rawId } = await context.params;
  const parsedId = projectIdSchema.safeParse(rawId);
  if (!parsedId.success) {
    return NextResponse.json(
      { error: "Project not found" },
      { status: 404 }
    );
  }
  const id = parsedId.data;

  const body = await req.json().catch(() => null);

  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.project.update({
      where: { id, userId },
      data: { title: parsed.data.title },
      select: projectSelect,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update project", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  const userId = req.headers.get("user-id") as string;
  const { id: rawId } = await context.params;

  const parsedId = projectIdSchema.safeParse(rawId);
  if (!parsedId.success) {
    return NextResponse.json(
      { error: "Project not found" },
      { status: 404 }
    );
  }

  const project = await prisma.project.findFirst({
    where: { id: parsedId.data, userId },
    select: {
      id: true,
      assets: {
        select: { objectKey: true },
      },
      fileBlobs: {
        select: { objectKey: true },
      },
    },
  });

  if (!project) {
    return NextResponse.json(
      { error: "Project not found" },
      { status: 404 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      // File blobs deliberately use RESTRICT so a referenced blob cannot be
      // removed accidentally. Clear this project's revision links first so
      // the project cascade can then remove both revisions and blobs safely.
      await tx.revisionFile.deleteMany({
        where: {
          revision: { projectId: project.id },
        },
      });
      await tx.project.delete({
        where: { id: project.id },
      });
    });

    try {
      await deleteStoredObjects(
        [
          ...project.assets.map((asset) => asset.objectKey),
          ...project.fileBlobs.map((blob) => blob.objectKey),
        ],
      );
    } catch (error) {
      console.error("Failed to delete project assets", error);
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete project", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
