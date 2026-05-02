/**
 * Next.js Middleware - Authentication & Authorization
 *
 * Validates JWT tokens and session state for protected routes.
 * - Checks session cookie on protected routes
 * - Redirects to /login if not authenticated
 * - Passes through for public routes
 * - Validates JWT and checks session in DB
 * - Sets user info in headers for route handlers
 *
 * @module middleware
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';
import { getSession } from '@/lib/auth/session';

/**
 * Public routes that don't require authentication
 */
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/logout',
];

/**
 * Check if a path is public (doesn't require authentication)
 *
 * @param pathname - Request pathname
 * @returns true if route is public
 */
function isPublicRoute(pathname: string): boolean {
  // Exact match for public routes
  if (PUBLIC_ROUTES.includes(pathname)) {
    return true;
  }

  // Allow all /api/auth/* routes
  if (pathname.startsWith('/api/auth/')) {
    return true;
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.')
  ) {
    return true;
  }

  return false;
}

/**
 * Next.js Middleware Function
 *
 * Runs on every request to validate authentication state.
 * Protected routes require valid session cookie.
 *
 * @param request - Next.js request object
 * @returns NextResponse with redirect or modified headers
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip authentication for public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Get session token from cookie
  const sessionToken = request.cookies.get('session')?.value;

  // No token - redirect to login
  if (!sessionToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    // Verify JWT token
    const payload = await verifyToken(sessionToken);

    if (!payload) {
      // Invalid or expired JWT - redirect to login
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      const response = NextResponse.redirect(loginUrl);

      // Clear invalid session cookie
      response.cookies.delete('session');

      return response;
    }

    // Check session in database
    const session = await getSession(sessionToken);

    if (!session) {
      // Session not found or expired in DB - redirect to login
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      const response = NextResponse.redirect(loginUrl);

      // Clear invalid session cookie
      response.cookies.delete('session');

      return response;
    }

    // Session is valid - continue request with user info in headers
    const response = NextResponse.next();

    // Set user info in headers for route handlers to access
    response.headers.set('x-user-id', payload.userId);
    response.headers.set('x-user-email', payload.email);

    return response;
  } catch (error) {
    // Error during validation - log and redirect to login
    console.error('Authentication middleware error:', error);

    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    const response = NextResponse.redirect(loginUrl);

    // Clear session cookie on error
    response.cookies.delete('session');

    return response;
  }
}

/**
 * Middleware configuration
 *
 * Defines which routes the middleware should run on.
 * Uses matcher to include all routes except static files.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
