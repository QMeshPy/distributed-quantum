import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { ROUTES } from "@/constants";

const AUTH_PATHS = [ROUTES.SIGNIN, ROUTES.SIGNUP];

const PUBLIC_PREFIX_PATHS = [...AUTH_PATHS, "/api/auth", "/api/network/node-script", "/api/network/coordinator-info", "/api/agentkit"];

const PUBLIC_EXACT_PATHS = ["/"];

function isPublic(pathname: string): boolean {
  return PUBLIC_EXACT_PATHS.includes(pathname) || PUBLIC_PREFIX_PATHS.some((p) => pathname.startsWith(p));
}

function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((p) => pathname.startsWith(p));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = getSessionCookie(request);

  if (isAuthPath(pathname) && sessionCookie) {
    return NextResponse.redirect(new URL(ROUTES.DASHBOARD, request.url));
  }

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  if (!sessionCookie) {
    const url = new URL(ROUTES.SIGNIN, request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
