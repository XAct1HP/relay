"use client";

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

/**
 * Dynamically import AuthProvider so the @supabase/ssr bundle is NOT included
 * in the client JS for mobile capture routes.
 *
 * Mobile Safari private mode fails to hydrate when the Supabase client
 * probes localStorage/cookies during module initialization. By code-splitting
 * AuthProvider behind a dynamic import that is only triggered for non-mobile
 * routes, mobile pages load with zero auth dependencies.
 */
const AuthProvider = dynamic(
  () =>
    import("@/components/layout/AuthProvider").then((m) => ({
      default: m.AuthProvider,
    })),
  { ssr: true }
);

export function RootShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isMobileCaptureRoute =
    pathname.startsWith("/mobile-auth") ||
    pathname.startsWith("/mobile-order-review");

  if (isMobileCaptureRoute) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="relay-site-bg" />
      <AuthProvider>{children}</AuthProvider>
    </>
  );
}
