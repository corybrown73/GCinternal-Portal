import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { SharedPlanView } from "@/components/shared-plan-view";
import { completePortalPlanTask, getPortalPlan } from "@/lib/portal-plan.functions";
import type { SharedPlan } from "@/lib/shared-plan";

/**
 * The authenticated door onto the same plan — the strict-IT fallback for
 * customers whose security team will not accept a magic link.
 *
 * Same component, same DTO, same serializer as /plan/$token. The URL carries
 * the implementation's `portal_key`, never a uuid, and the key is an
 * identifier rather than a credential: this route still requires a login and
 * still resolves scope from `customer_users`.
 *
 * Fetched client-side rather than in the loader because the Supabase bearer is
 * attached by a CLIENT middleware (auth-attacher.ts) — an SSR loader here would
 * have no token to send.
 */
export const Route = createFileRoute("/portal/plan/$portalKey")({
  component: PortalPlanPage,
});

function PortalPlanPage() {
  const { portalKey } = Route.useParams();
  const [override, setOverride] = useState<SharedPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["portal", "plan", portalKey],
    queryFn: () => getPortalPlan({ data: { portalKey } }),
  });

  const plan = override ?? query.data ?? null;

  if (query.isError) {
    return (
      <div role="alert" className="rounded-md border border-border bg-card p-6 text-[13px]">
        <p className="font-medium">We couldn&apos;t load this plan.</p>
        <p className="mt-1 text-muted-foreground">
          It may belong to a different account, or your access may have changed.
        </p>
      </div>
    );
  }
  if (!plan) {
    return (
      <p className="p-6 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        Loading…
      </p>
    );
  }

  return (
    <>
      {error ? (
        <p role="alert" className="mb-2 text-[12px] text-destructive">
          {error}
        </p>
      ) : null}
      <SharedPlanView
        plan={plan}
        actions={{
          busy,
          onComplete: async (ref) => {
            setBusy(true);
            setError(null);
            try {
              setOverride(await completePortalPlanTask({ data: { portalKey, ref } }));
            } catch {
              setError("That didn't go through.");
            } finally {
              setBusy(false);
            }
          },
        }}
      />
    </>
  );
}
