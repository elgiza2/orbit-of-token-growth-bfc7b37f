import { createFileRoute } from "@tanstack/react-router";
import { marketingPaths } from "@/components/landing/localePages";
import { canonicalOrigin, requestHostOrigin } from "@/config/domains";

/** Company and legal pages, also public and crawlable. */
const DOC_PATHS = ["/about", "/contact", "/terms", "/privacy", "/subscription-terms", "/cookies", "/security"];

const priorityOf = (p: string) => (p === "/" ? "1.0" : p === "/pricing" || /^\/[a-z]{2}$/.test(p) ? "0.9" : DOC_PATHS.includes(p) ? "0.3" : "0.7");

export const Route = createFileRoute("/sitemap.xml")({
  server: { handlers: { GET: ({ request }) => {
    const { host, origin } = requestHostOrigin(request);
    const base = canonicalOrigin(host, origin);
    const paths = [...new Set([...marketingPaths(), ...DOC_PATHS])];
    const body = paths.map((p) => `<url><loc>${base}${p}</loc><changefreq>${DOC_PATHS.includes(p) ? "monthly" : "weekly"}</changefreq><priority>${priorityOf(p)}</priority></url>`).join("");
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  } } },
});
