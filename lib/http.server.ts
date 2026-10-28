import "server-only";

import type { NextRequest } from "next/server";
import type { z } from "zod";

import { auth } from "@/lib/auth";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function errorResponse(status: number, message: string, details?: Record<string, unknown>) {
  return Response.json({ error: message, ...details }, { status });
}

export async function requireUserId(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new HttpError(401, "Unauthorized");
  return session.user.id;
}

export async function parseJson<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
  message = "Invalid request",
): Promise<z.output<Schema>> {
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) throw new HttpError(400, message);
  return parsed.data;
}

export function parseSearchParams<Schema extends z.ZodType>(
  request: NextRequest,
  schema: Schema,
  message = "Invalid request",
): z.output<Schema> {
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) throw new HttpError(400, message);
  return parsed.data;
}

/** Turns thrown HttpErrors into their response and anything else into a logged 500. */
export function route<Context>(
  handler: (request: NextRequest, context: Context) => Promise<Response>,
) {
  return async (request: NextRequest, context: Context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error.status, error.message, error.details);
      console.error(`${request.method} ${request.nextUrl.pathname} failed`, error);
      return errorResponse(500, "Something went wrong. Try again.");
    }
  };
}
