import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware to disable the Vercel toolbar on mobile capture routes.
 *
 * Vercel injects a parser-blocking <script> from vercel.live into preview
 * deployments. This script sits before the inline RSC payload scripts in
 * the HTML. If the script fails to load on mobile (content blockers, slow
 * DNS, unreliable connectivity to vercel.live), the browser never parses
 * the inline scripts, React never hydrates, and the page is stuck on the
 * SSR "Loading..." state forever.
 *
 * Setting x-vercel-skip-toolbar tells Vercel's edge not to inject that
 * script, so the mobile pages hydrate reliably on any device.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/mobile-auth") ||
    pathname.startsWith("/mobile-order-review")
  ) {
    const response = NextResponse.next();
    response.headers.set("x-vercel-skip-toolbar", "1");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/mobile-auth/:path*", "/mobile-order-review/:path*"],
};
