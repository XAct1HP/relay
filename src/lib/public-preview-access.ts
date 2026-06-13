/**
 * Helpers for public mobile flows that need to work on Vercel preview
 * deployments protected by deployment protection.
 *
 * We only append the automation bypass secret on preview deployments and only
 * for the generated public mobile links.
 *
 * We intentionally do not ask Vercel to set the bypass cookie on the initial
 * QR-opened request. Some mobile scanner / in-app browser flows handle that
 * redirect poorly and can render a blank page. Instead, the public mobile
 * pages keep the bypass secret in the URL and forward it to their follow-up
 * API calls directly.
 */

const VERCEL_PROTECTION_BYPASS_PARAM = "x-vercel-protection-bypass";

export function buildPublicMobileFlowUrl(requestUrl: string | URL, path: string) {
  const baseUrl = typeof requestUrl === "string" ? new URL(requestUrl) : requestUrl;
  const publicUrl = new URL(path, baseUrl.origin);
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

  if (process.env.VERCEL_ENV === "preview" && bypassSecret) {
    publicUrl.searchParams.set(VERCEL_PROTECTION_BYPASS_PARAM, bypassSecret);
  }

  return publicUrl.toString();
}

export function appendCurrentProtectionBypass(path: string) {
  if (typeof window === "undefined") {
    return path;
  }

  const url = new URL(path, window.location.origin);
  const currentParams = new URLSearchParams(window.location.search);
  const bypassSecret = currentParams.get(VERCEL_PROTECTION_BYPASS_PARAM);

  if (bypassSecret && !url.searchParams.has(VERCEL_PROTECTION_BYPASS_PARAM)) {
    url.searchParams.set(VERCEL_PROTECTION_BYPASS_PARAM, bypassSecret);
  }

  if (url.origin === window.location.origin) {
    return `${url.pathname}${url.search}${url.hash}`;
  }

  return url.toString();
}

export async function fetchWithCurrentProtectionBypass(
  path: string,
  init?: RequestInit
) {
  return fetch(appendCurrentProtectionBypass(path), {
    ...init,
    credentials: init?.credentials ?? "same-origin",
  });
}
