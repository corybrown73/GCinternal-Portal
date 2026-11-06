import { useQuery } from "@tanstack/react-query";

import { CompleteSolutionsWorkspace } from "@/components/complete-solutions-workspace";
import { SolutionsCard } from "@/components/solutions-card";
import { canEditDeal, useProfile } from "@/lib/auth";
import { dealQuery, type DealData } from "@/lib/deal-query";
import { readIntake } from "@/lib/intake-answers";
import {
  normalizeServices,
  SOLUTION_STATUS_LABEL,
  solutionStatus,
  type ServiceSpec,
} from "@/lib/onboarding-services";

/**
 * The Solutions tab. The compact overview is the purchased solutions and their lifecycle
 * (Define, Build, Accept, Accepted), read from the purchase record: that is the status a
 * customer sees. Below it, the delivery detail for each solution (components, dependencies,
 * history) is PR #101's workspace, which shows the lifecycle for each solution it links to a
 * purchased item rather than a status of its own.
 */
export function SolutionsTab({
  implementationId,
  dealId,
}: {
  implementationId: string;
  dealId: string | null;
}) {
  const { profile } = useProfile();
  const editable = canEditDeal(profile?.role);
  const dealQ = useQuery({ ...dealQuery(dealId ?? ""), enabled: !!dealId });
  const deal = dealQ.data as DealData | undefined;

  return (
    <div className="space-y-5">
      {deal ? <SolutionsCard deal={deal} editable={editable} /> : null}
      {!dealId ? (
        <p className="text-[12px] text-muted-foreground">
          This implementation has no purchase record, so its purchased solutions are shown only as
          they are recorded below.
        </p>
      ) : null}
      <CompleteSolutionsWorkspace
        implementationId={implementationId}
        lifecycleFor={lifecycleOf(deal)}
      />
    </div>
  );
}

/** The lifecycle label of a purchased service on this deal, by its id; null when it is not on the deal. */
function lifecycleOf(
  deal: DealData | undefined,
): ((purchasedServiceId: string | null) => string | null) | undefined {
  if (!deal) return undefined;
  const intake = readIntake(deal.account.intake);
  const completed = intake.timeline.completed;
  const byId = new Map(
    normalizeServices(intake.timeline.services as ServiceSpec[], intake.timeline).map((s) => [
      s.id,
      SOLUTION_STATUS_LABEL[solutionStatus(s, completed)],
    ]),
  );
  return (purchasedServiceId) =>
    purchasedServiceId ? (byId.get(purchasedServiceId) ?? null) : null;
}
