/**
 * Helpers for public mobile flows that need to work on Vercel preview
 * deployments protected by deployment protection.
 *
 * We only append the automation bypass secret on preview deployments and only
 * for the generated public mobile links. The `x-vercel-set-bypass-cookie`
 * flag lets the phone browser keep accessing follow-up API requests after the
 * initial page load.
 */

const VERCEL_PROTECTION_BYPASS_PARAM = "x-vercel-protection-bypass";
const VERCEL_SET_BYPASS_COOKIE_PARAM = "x-vercel-set-bypass-cookie";

export function buildPublicMobileFlowUrl(requestUrl: string | URL, path: string) {
  const baseUrl = typeof requestUrl === "string" ? new URL(requestUrl) : requestUrl;
  const publicUrl = new URL(path, baseUrl.origin);
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

  if (process.env.VERCEL_ENV === "preview" && bypassSecret) {
    publicUrl.searchParams.set(VERCEL_PROTECTION_BYPASS_PARAM, bypassSecret);
    publicUrl.searchParams.set(VERCEL_SET_BYPASS_COOKIE_PARAM, "true");
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
  const setBypassCookie = currentParams.get(VERCEL_SET_BYPASS_COOKIE_PARAM);

  if (bypassSecret && !url.searchParams.has(VERCEL_PROTECTION_BYPASS_PARAM)) {
    url.searchParams.set(VERCEL_PROTECTION_BYPASS_PARAM, bypassSecret);
  }

  if (setBypassCookie && !url.searchParams.has(VERCEL_SET_BYPASS_COOKIE_PARAM)) {
    url.searchParams.set(VERCEL_SET_BYPASS_COOKIE_PARAM, setBypassCookie);
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
