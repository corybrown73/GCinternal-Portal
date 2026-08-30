import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  KeyRound,
  Plug,
  Route as RouteIcon,
  Rows3,
  ShieldCheck,
  Upload,
  Users,
  ToggleRight,
} from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";

export const Route = createFileRoute("/admin/")({
  component: AdminIndex,
});

const CARDS = [
  {
    to: "/admin/api-keys",
    icon: KeyRound,
    title: "API keys",
    description:
      "Create and revoke scoped keys for Salesforce, Zapier and monitoring integrations calling /api/v1/*.",
  },
  {
    to: "/admin/users",
    icon: Users,
    title: "Users",
    description:
      "Every portal profile and its role. Roles gate sales edits, admin areas and the customer portal.",
  },
  {
    to: "/admin/integrations",
    icon: Plug,
    title: "Integrations",
    description:
      "Salesforce auto-create: the sync log and why each decision was made, field maps, outbound webhooks and the needs-template queue.",
  },
  {
    to: "/admin/flags",
    icon: ToggleRight,
    title: "Features",
    description:
      "What is switched on for this deployment, what each switch does, and which ones customers can see. A feature is not a permission — roles decide who may act.",
  },
  {
    to: "/admin/pipeline-stages",
    icon: Rows3,
    title: "Pre-sale stages",
    description:
      "The pre-sale pipeline: label, colour and order of each stage, and which one means Closed Won. Renaming or reordering never rewrites the stage history.",
  },
  {
    to: "/admin/lifecycle-stages",
    icon: Rows3,
    title: "Post-sale stages",
    description:
      "The stages after the sale: what each is called, what it says it means, its colour and its order. The eight the application keys off can be renamed but not deleted.",
  },
  {
    to: "/admin/audit",
    icon: ShieldCheck,
    title: "Audit health",
    description:
      "Whether the audit log is actually recording what happened: failed writes, and changes the database observed but the app never attributed.",
  },
  {
    to: "/tickets/routing",
    icon: RouteIcon,
    title: "Ticket routing",
    description:
      "Assignment rules for inbound tickets: which team picks up what, and the fallback owner.",
  },
  {
    to: "/pipeline",
    icon: Upload,
    title: "CSV import",
    description:
      "Bulk-load or refresh presale deals from a Salesforce export. The import dialog lives on the Pipeline board.",
  },
] as const;

function AdminIndex() {
  return (
    <>
      <PageHeader
        title="Admin"
        description="Integration keys, people and routing. Everything here is super-admin only and audited."
      />
      <PageBody>
        <div className="grid gap-3 sm:grid-cols-2">
          {CARDS.map((card) => (
            <Link
              key={card.to}
              to={card.to}
              className="group rounded-md border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/60"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <card.icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
                  <span className="text-[13px] font-medium group-hover:underline">
                    {card.title}
                  </span>
                </span>
                <ArrowRight
                  className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  strokeWidth={1.75}
                />
              </div>
              <p className="mt-1.5 text-[12px] text-muted-foreground">{card.description}</p>
            </Link>
          ))}
        </div>
      </PageBody>
    </>
  );
}
