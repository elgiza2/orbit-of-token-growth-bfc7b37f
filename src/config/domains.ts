import { marketerCodeForHost } from "@/lib/referrals/rules";
/** Which Ceyo surface this host serves. Browser-safe.
 *  ceyo.si and ceyo.app = landing (web only), web.ceyo.si = web app,
 *  app.ceyo.si = Android app shell (Google Play). Other hosts (preview, localhost) act as the web app. */
export type Surface = "landing" | "web" | "android";

export const DOMAINS = { landing: "ceyo.si", web: "web.ceyo.si", android: "app.ceyo.si" } as const;

/** Every host that serves the public landing pages. */
export const LANDING_HOSTS = ["ceyo.si", "ceyo.app", "matra.ceyo.app"] as const;

/** Marketer landing subdomains add ?ref=<code> to every link into the web app. */
const withRef = (host: string, url: string) => {
  const code = marketerCodeForHost(host);
  return code ? `${url}${url.includes("?") ? "&" : "?"}ref=${code}` : url;
};

const PUBLIC_PATHS = /^\/(terms|privacy|subscription-terms|about|contact|cookies|security|docs|pricing|compare|countries|sitemap\.xml|en|ar|es|fr|de|pt|ru|tr|hi|zh)(\/|$)/;

const bare = (host: string) => host.toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");

export function surfaceFor(host: string): Surface {
  const h = bare(host);
  if ((LANDING_HOSTS as readonly string[]).includes(h)) return "landing";
  if (h === DOMAINS.android) return "android";
  return "web";
}

/** True on a production Ceyo domain (landing, web or Android). */
export function isProductionHost(host: string): boolean {
  const h = bare(host);
  return (LANDING_HOSTS as readonly string[]).includes(h) || h === DOMAINS.web || h === DOMAINS.android;
}

/** Whether "/" should show the landing page. Previews can opt in with ?landing=1. */
export function showsLanding(host: string, search = ""): boolean {
  if (surfaceFor(host) === "landing") return true;
  return !isProductionHost(host) && new URLSearchParams(search).get("landing") === "1";
}

/** On a landing domain only "/" and public pages stay; app paths move to the web app with the same path. */
export function landingRedirect(host: string, path: string, search = ""): string | null {
  if (surfaceFor(host) !== "landing") return null;
  if (path === "/" || PUBLIC_PATHS.test(path)) return null;
  return withRef(host, `https://${DOMAINS.web}${path}${search}`);
}

/** Where landing buttons send people to use the app. */
export function webAppUrl(host: string, currentOrigin: string, path: string): string {
  return withRef(host, `${webAppOrigin(host, currentOrigin)}${path}`);
}

export function webAppOrigin(host: string, currentOrigin: string): string {
  return isProductionHost(host) ? `https://${DOMAINS.web}` : currentOrigin;
}

/** The one address search engines should index. Every production host points its canonical links here,
 *  so ceyo.si, ceyo.app, marketer subdomains and web.ceyo.si never compete as duplicate copies. */
export const SEO_HOST = "ceyo.app";

/** Origin for canonical/hreflang/sitemap links: the SEO host on production, the current origin on previews. */
export function canonicalOrigin(host: string, requestOrigin: string): string {
  return isProductionHost(host) ? `https://${SEO_HOST}` : requestOrigin;
}

/** True for paths that belong to the public website (crawlable on every host). */
export function isPublicPath(path: string): boolean {
  return path === "/" || PUBLIC_PATHS.test(path);
}

/** X-Robots-Tag for a page: the Android app shell is never indexed, and private app screens on the web host stay out of search. */
export function robotsTagFor(host: string, path: string): string | null {
  const surface = surfaceFor(host);
  if (surface === "android") return "noindex, nofollow";
  if (surface === "web" && isProductionHost(host) && (path === "/" || !PUBLIC_PATHS.test(path))) return "noindex";
  return null;
}

/** Host and origin of a request, trusting x-forwarded-host only behind the local dev proxy. */
export function requestHostOrigin(request: Request): { url: URL; host: string; origin: string } {
  const url = new URL(request.url);
  const fwd = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
  return { url, host: fwd || url.host, origin: fwd ? `https://${fwd}` : url.origin };
}
