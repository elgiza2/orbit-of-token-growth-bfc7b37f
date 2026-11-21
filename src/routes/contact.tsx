import { createFileRoute } from "@tanstack/react-router";
import { legalRouteComponent } from "@/pages/legal/LegalRoute";
import { documentHead } from "@/pages/legal/documents";
export const Route = createFileRoute("/contact")({ component: legalRouteComponent("contact"), head: () => documentHead("contact") });