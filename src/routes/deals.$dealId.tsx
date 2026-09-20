import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { DealRecord } from "@/components/deal-record";
import { dealQuery } from "@/lib/deal-query";

/**
 * A deal that has not closed yet. Once it closes, the customer's page is the
 * account page and this URL sends you to its Pre-kickoff tab.
 */
export const Route = createFileRoute("/deals/$dealId")({
  head: () => ({
    meta: [
      { title: "Deal — GoCanvas Handoff Hub" },
      {
        name: "description",
        content:
          "Presale deal record: notes, Gong reports, account briefs, TAM requests and stage history.",
      },
    ],
  }),
  // Awaited, so the route can show a skeleton while the record loads. Before,
  // Create deal blanked the screen for the whole fetch and people clicked it
  // twice.
  loader: async ({ context, params }) => {
    const { dealId } = params as unknown as { dealId: string };
    await context.queryClient.ensureQueryData(dealQuery(dealId)).catch(() => {});
  },
  pendingMs: 120,
  pendingComponent: () => (
    <div className="animate-pulse space-y-4 p-6" aria-busy="true" aria-label="Loading the deal">
      <div className="h-6 w-64 rounded bg-muted" />
      <div className="h-14 rounded-md bg-muted/70" />
      <div className="h-16 rounded-md bg-muted/60" />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-48 rounded-md bg-muted/50" />
        <div className="h-48 rounded-md bg-muted/50" />
      </div>
      <div className="h-64 rounded-md bg-muted/40" />
    </div>
  ),
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load this deal: {error.message}
    </div>
  ),
  component: DealPage,
});

function DealPage() {
  const { dealId } = Route.useParams() as unknown as { dealId: string };
  const { data } = useSuspenseQuery(dealQuery(dealId));

  if (!data) {
    return <div className="p-6 text-[13px] text-muted-foreground">This deal does not exist.</div>;
  }
  if (data.account.customer_id) {
    return (
      <Navigate
        to="/customers/$customerId"
        params={{ customerId: data.account.customer_id }}
        search={{
          tab: "prekickoff",
          ...(data.implementation_id ? { impl: data.implementation_id } : {}),
        }}
        replace
      />
    );
  }
  return <DealRecord deal={data} />;
}
