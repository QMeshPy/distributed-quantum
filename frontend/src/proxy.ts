import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { ROUTES } from "@/constants";

const AUTH_PATHS = [ROUTES.SIGNIN, ROUTES.SIGNUP];

const PUBLIC_PREFIX_PATHS = [
  ...AUTH_PATHS,
  "/api/auth",
  "/api/network/node-script",
  "/api/network/coordinator-info",
  "/api/agentkit",
];

const PUBLIC_EXACT_PATHS = ["/robots.txt", "/sitemap.xml"];

function isLandingPath(pathname: string): boolean {
  return pathname === "" || pathname === "/";
}

function isPathOrChild(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function isPublic(pathname: string): boolean {
  return (
    PUBLIC_EXACT_PATHS.includes(pathname) ||
    PUBLIC_PREFIX_PATHS.some((route) => isPathOrChild(pathname, route))
  );
}

function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((route) => isPathOrChild(pathname, route));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The marketing site is always public. Keep this before Better Auth so the
  // production domain can never inherit an application-shell sign-in guard.
  if (isLandingPath(pathname)) {
    return NextResponse.next();
  }

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
