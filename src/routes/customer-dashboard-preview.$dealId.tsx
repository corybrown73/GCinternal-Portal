import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { CustomerDashboard } from "@/components/customer-dashboard";
import { getCustomerDashboardPreview } from "@/lib/welcome.functions";
import { localIso } from "@/lib/onboarding-timeline";

/**
 * The TIS's preview of the customer's dashboard, opened from Current
 * Implementation. It renders the same dashboard the customer's link renders,
 * from the latest saved information, read-only: no write handler is passed, so
 * every customer control on it is shown and cannot act. "Refresh" re-reads what
 * is saved, so a change made in Current Implementation shows here on refresh.
 */
export const Route = createFileRoute("/customer-dashboard-preview/$dealId")({
  validateSearch: (search: Record<string, unknown>): { customer?: string; impl?: string } => ({
    ...(typeof search["customer"] === "string" ? { customer: search["customer"] } : {}),
    ...(typeof search["impl"] === "string" ? { impl: search["impl"] } : {}),
  }),
  component: CustomerDashboardPreviewPage,
});

function CustomerDashboardPreviewPage() {
  const { dealId } = Route.useParams();
  const { customer, impl } = Route.useSearch();
  const load = useServerFn(getCustomerDashboardPreview);
  const preview = useQuery({
    queryKey: ["customer-dashboard-preview", dealId],
    queryFn: () => load({ data: { dealId } }),
  });
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(localIso()), []);

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-card px-6 py-2.5">
        {customer ? (
          <Link
            to="/customers/$customerId"
            params={{ customerId: customer }}
            search={{ tab: "implementation", ...(impl ? { impl } : {}) }}
            className="text-[12px] font-medium text-primary hover:underline"
          >
            ← Back to Current Implementation
          </Link>
        ) : (
          <Link to="/pipeline" className="text-[12px] font-medium text-primary hover:underline">
            ← Back to the pipeline
          </Link>
        )}
        <span className="text-[12px] text-muted-foreground">
          Customer dashboard preview · read-only · the information saved in the Hub
        </span>
        <button
          type="button"
          onClick={() => void preview.refetch()}
          disabled={preview.isFetching}
          className="ml-auto rounded-sm border border-border px-2.5 py-1 text-[12px] font-medium hover:bg-muted/60 disabled:opacity-50"
        >
          {preview.isFetching ? "Refreshing…" : "Refresh preview"}
        </button>
      </div>

      {preview.isPending ? (
        <p className="p-6 text-[13px] text-muted-foreground">Loading the customer's dashboard…</p>
      ) : preview.data ? (
        <div className="gc-welcome">
          <CustomerDashboard view={preview.data} today={today} mode="internal" icsBase={null} />
        </div>
      ) : (
        <p className="p-6 text-[13px] text-muted-foreground">
          This implementation has no customer dashboard to preview.
        </p>
      )}
    </div>
  );
}
