/**
 * Host-level SEO handling that runs before the app renders:
 * - landing hosts serve "/" as full server-rendered HTML (search engines can read it);
 * - landing hosts send app screens straight to the web app instead of an empty shell;
 * - every HTML response gets the host's X-Robots-Tag (the Android shell and private
 *   web-app screens stay out of search results).
 */
import { landingRedirect, requestHostOrigin, robotsTagFor, surfaceFor } from "@/config/domains";

const NON_PAGE = /^\/(api|_|lovable|@|src|node_modules|assets)(\/|$)|\/[^/]+\.[a-z0-9]+$/i;

export async function landingHostResponse(request: Request): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const { url, host } = requestHostOrigin(request);
  if (surfaceFor(host) !== "landing") return null;
  if (url.pathname === "/") {
    const m = await import("@/components/landing/serveLanding.server");
    const { isPageLang } = await import("@/components/landing/localePages");
    const asked = url.searchParams.get("lang");
    const lang = asked && isPageLang(asked) ? asked : m.langFromRequest(request);
    return m.landingResponse(request, { lang, root: true });
  }
  if (NON_PAGE.test(url.pathname)) return null;
  const to = landingRedirect(host, url.pathname, url.search);
  return to ? Response.redirect(to, 302) : null;
}

export function withRobotsTag(request: Request, response: Response): Response {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return response;
  const { url, host } = requestHostOrigin(request);
  const tag = robotsTagFor(host, url.pathname);
  if (!tag) return response;
  const out = new Response(response.body, response);
  out.headers.set("X-Robots-Tag", tag);
  return out;
}
