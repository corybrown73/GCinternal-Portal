import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { useCompleteSolutions } from "@/lib/complete-solutions-view";
import { CARD } from "@/components/current-implementation-context";
import { dealQuery, type DealData } from "@/lib/deal-query";
import { readIntake } from "@/lib/intake-answers";
import { normalizeServices, type ServiceSpec } from "@/lib/onboarding-services";
import { solutionsOverview, type Blocker } from "@/lib/solutions-overview";
import { cn } from "@/lib/utils";

const BLOCKER_SHOWN = 3;

/**
 * The Solutions line on Current Implementation: how delivery stands, what is launch-critical
 * and still open, and the genuine blockers. It links to the Solutions tab, where the work is
 * managed. It shows nothing when the implementation has no purchase record.
 */
export function SolutionsSummary({
  customerId,
  implementationId,
  dealId,
}: {
  customerId: string;
  implementationId: string;
  dealId: string;
}) {
  const dealQ = useQuery({ ...dealQuery(dealId), enabled: !!dealId });
  const ws = useCompleteSolutions(implementationId);
  const deal = dealQ.data as DealData | undefined;
  // The lifecycle and the blockers from the purchase record show even while complete
  // solutions are off; the delivery records only add to them.
  if (!deal) return null;

  const intake = readIntake(deal.account.intake);
  const services = normalizeServices(intake.timeline.services as ServiceSpec[], intake.timeline);
  const overview = solutionsOverview({
    services,
    completed: intake.timeline.completed,
    solutions: ws.data?.solutions ?? [],
  });
  if (overview.purchased === 0) return null;

  const shown = overview.blockers.slice(0, BLOCKER_SHOWN);
  const more = overview.blockers.length - shown.length;

  return (
    <section className={cn(CARD, "space-y-2 px-4 py-3 text-[13px]")} aria-label="Solutions summary">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          <span className="font-medium">Solutions:</span> {overview.accepted} of{" "}
          {overview.purchased} accepted · {overview.open} open
          {overview.components.total > 0 ? (
            <>
              {" "}
              · {overview.components.complete} of {overview.components.total} delivery components
              complete
            </>
          ) : null}
        </p>
        <Link
          to="/customers/$customerId"
          params={{ customerId }}
          search={{ tab: "solutions", impl: implementationId }}
          className="text-[12px] font-medium text-primary hover:underline"
        >
          Open Solutions →
        </Link>
      </div>

      {overview.launchCriticalOutstanding.length > 0 ? (
        <p className="text-[12px] text-amber-800 dark:text-amber-300">
          Launch-critical and not yet accepted:{" "}
          {overview.launchCriticalOutstanding.map((s) => s.name).join(", ")}
        </p>
      ) : null}

      {shown.length > 0 ? (
        <ul className="space-y-0.5 text-[12px]" aria-label="Blockers">
          {shown.map((b) => (
            <li key={`${b.kind}:${b.id}`} className="text-status-blocked-foreground">
              {blockerText(b)}
            </li>
          ))}
          {more > 0 ? (
            <li className="text-muted-foreground">and {more} more on the Solutions tab</li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}

function blockerText(b: Blocker): string {
  if (b.kind === "solution") {
    return `${b.label}: blocked by ${b.who === "blocked_customer" ? "the customer" : "us"}`;
  }
  return `${b.label} (${b.solution}): ${b.detail}`;
}
