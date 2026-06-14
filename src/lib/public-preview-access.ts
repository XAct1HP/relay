/**
 * Helpers for public mobile flows that need to work on Vercel preview
 * deployments protected by deployment protection.
 *
 * We append the automation bypass secret on preview deployments for the
 * generated public mobile links, AND request that Vercel sets a bypass
 * cookie (SameSite=None) on the response.
 *
 * The cookie is essential: without it, the browser can load the HTML page
 * (the bypass param is in the URL) but every subsequent request for JS
 * chunks, CSS, images, etc. gets blocked by deployment protection because
 * those requests don't carry the bypass param. Setting the cookie makes
 * all follow-up requests (including script loads) pass through protection.
 *
 * Vercel responds with a 307 redirect that strips the bypass params and
 * sets the cookie. The final URL is clean and all resources load normally.
 */

const VERCEL_PROTECTION_BYPASS_PARAM = "x-vercel-protection-bypass";
const VERCEL_SET_BYPASS_COOKIE_PARAM = "x-vercel-set-bypass-cookie";

export function buildPublicMobileFlowUrl(requestUrl: string | URL, path: string) {
  const baseUrl = typeof requestUrl === "string" ? new URL(requestUrl) : requestUrl;
  const publicUrl = new URL(path, baseUrl.origin);
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

  if (process.env.VERCEL_ENV === "preview" && bypassSecret) {
    publicUrl.searchParams.set(VERCEL_PROTECTION_BYPASS_PARAM, bypassSecret);
    publicUrl.searchParams.set(VERCEL_SET_BYPASS_COOKIE_PARAM, "samesitenone");
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
