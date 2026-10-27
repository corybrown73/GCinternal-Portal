import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { CompleteSolutionsWorkspace } from "@/components/complete-solutions-workspace";
import { PageBody } from "@/components/page";

/**
 * The Solutions workspace for one implementation: the detailed view behind the
 * summary on Customer 360. The customer comes from the search parameter, so the
 * way back lands on the same account.
 */
export const Route = createFileRoute("/solutions/$implId")({
  validateSearch: (raw: Record<string, unknown>): { customer?: string } => {
    const customer = typeof raw["customer"] === "string" ? (raw["customer"] as string) : "";
    return customer ? { customer } : {};
  },
  head: () => ({
    meta: [
      { title: "Solutions — GoCanvas Handoff Hub" },
      {
        name: "description",
        content:
          "The complete solutions being delivered on an implementation, with their components, readiness and next actions.",
      },
    ],
  }),
  component: SolutionsPage,
});

function SolutionsPage() {
  const { implId } = Route.useParams();
  const { customer } = Route.useSearch();
  return <SolutionsWorkspacePage implementationId={implId} customerId={customer ?? null} />;
}

function SolutionsWorkspacePage({
  implementationId,
  customerId,
}: {
  implementationId: string;
  customerId: string | null;
}) {
  return (
    <PageBody className="space-y-5">
      <nav
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
        aria-label="Breadcrumb"
      >
        <Link
          to="/customers"
          search={{ sort: "days", dir: "desc" }}
          className="hover:text-foreground hover:underline"
        >
          Customers
        </Link>
        <ChevronRight className="h-3 w-3" />
        {customerId ? (
          <Link
            to="/customers/$customerId"
            params={{ customerId }}
            search={{ tab: "overview" }}
            className="hover:text-foreground hover:underline"
          >
            Back to the customer
          </Link>
        ) : (
          <span>Customer</span>
        )}
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground">Solutions</span>
      </nav>
      <div>
        <h1 className="text-[18px] font-semibold tracking-tight">Solutions being delivered</h1>
      </div>
      <CompleteSolutionsWorkspace implementationId={implementationId} />
    </PageBody>
  );
}
