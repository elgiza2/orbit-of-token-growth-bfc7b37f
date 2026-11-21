import { createFileRoute } from "@tanstack/react-router";
import { legalRouteComponent } from "@/pages/legal/LegalRoute";
import { documentHead } from "@/pages/legal/documents";
export const Route = createFileRoute("/about")({ component: legalRouteComponent("about"), head: () => documentHead("about") });