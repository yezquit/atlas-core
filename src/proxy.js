import { NextResponse } from "next/server";

import { personalSessionFromRequest } from "@/core/auth/personalAccessPolicy";

export function proxy(request) {
  if (personalSessionFromRequest(request)) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { status: "unauthorized", errorCode: "personal_session_required" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!login|api/auth/login|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
