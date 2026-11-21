import { ClientOnly } from "@tanstack/react-router";
import { SpaMount } from "@/lib/spaMount";
import { StaticLegalDoc } from "./StaticLegalDoc";
import type { LegalSlug } from "./documents";

/** Public legal page: full text in the server HTML, then the app mounts over it without a blank gap. */
export function legalRouteComponent(slug: LegalSlug) {
  return function LegalRoute() {
    const page = <StaticLegalDoc slug={slug} />;
    return <ClientOnly fallback={page}><SpaMount fallback={page} /></ClientOnly>;
  };
}
