import { NextResponse, type NextRequest } from "next/server";
import { auth } from "./lib/auth";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // TOOD: fetch from cache this is a db call on each req
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    const isApi = pathname.startsWith("/api/");
    if (!isApi) {
      return NextResponse.redirect(new URL("/login", req.nextUrl));
    }

    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("user-id", session.user.id);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/api/:path*"],
};
