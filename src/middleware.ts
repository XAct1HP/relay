import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware for mobile capture routes.
 *
 * On Vercel preview deployments, deployment protection blocks ALL requests
 * (including JS chunks, CSS, images) unless they carry a bypass cookie or
 * the bypass query param. The QR code URL now sets the bypass cookie via
 * x-vercel-set-bypass-cookie=samesitenone, which handles this.
 *
 * This middleware also sets x-vercel-skip-toolbar to prevent Vercel from
 * injecting its parser-blocking toolbar script into mobile pages.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("x-vercel-skip-toolbar", "1");
  return response;
}

export const config = {
  matcher: ["/mobile-auth/:path*", "/mobile-order-review/:path*"],
};
