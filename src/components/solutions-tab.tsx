import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  NewSolutionForm,
  PurchaseCheckNote,
  SolutionCard,
  SolutionDetail,
} from "@/components/complete-solutions-workspace";
import { errorText, useCompleteSolutions, type WorkspaceView } from "@/lib/complete-solutions-view";
import { SolutionsCard, type SolutionDetailSlot } from "@/components/solutions-card";
import { SowSolutionsReview } from "@/components/complete-solutions-sow-review";
import { canEditDeal, useProfile } from "@/lib/auth";
import { dealQuery, type DealData } from "@/lib/deal-query";
import { readIntake } from "@/lib/intake-answers";
import { normalizeServices, type ServiceSpec } from "@/lib/onboarding-services";
import { linkedSolutionFor, solutionsOverview } from "@/lib/solutions-overview";

const NO_RECORD = { hasRecord: false, solutionsWithoutRecord: [], recordsWithoutSolution: [] };

const PRIMARY =
  "rounded-sm border border-primary/40 bg-primary/5 px-2.5 py-1 text-[12px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50";
const BUTTON =
  "rounded-sm border border-border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50";

/**
 * The one Solutions view for an implementation.
 *
 * The purchased solutions are one list, taken from the purchase record: each shows its
 * lifecycle (Define, Build, Accept, Accepted), owner, ball and acceptance, with the actions
 * those have always had. Each one expands to its linked delivery record: components,
 * dependencies, readiness, next action, blockers and history. Solutions that are not in the
 * purchase record (requested, or added by hand) come after, under their own heading.
 *
 * Nothing is copied between the two sources: the delivery record is read by the purchased
 * service's id, and the lifecycle is read from the purchase record.
 */
export function SolutionsTab({
  implementationId,
  dealId,
}: {
  implementationId: string;
  dealId: string | null;
}) {
  const { profile } = useProfile();
  const editableDeal = canEditDeal(profile?.role);
  const dealQ = useQuery({ ...dealQuery(dealId ?? ""), enabled: !!dealId });
  const ws = useCompleteSolutions(implementationId);
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  if (ws.isPending) {
    return <p className="text-[12px] text-muted-foreground">Loading the solutions…</p>;
  }
  // The purchased solutions come from the purchase record and show whatever the delivery
  // records say. While complete solutions are off, the delivery read refuses: the purchased
  // list still shows, and the delivery detail says it is not turned on.
  const deliveryOff = ws.isError;
  const {
    solutions: all,
    canEdit,
    purchase,
  } = deliveryOff
    ? ({ solutions: [], canEdit: false, purchase: NO_RECORD } as WorkspaceView)
    : (ws.data as WorkspaceView);
  const deal = dealQ.data as DealData | undefined;
  const services = deal ? purchasedServices(deal) : [];
  const serviceIds = new Set(services.map((s) => s.id));
  const active = all.filter((s) => !s.archived);
  const other = active.filter(
    (s) => !(s.purchasedServiceId && serviceIds.has(s.purchasedServiceId)),
  );
  const archived = all.filter((s) => s.archived);
  const overview = deal
    ? solutionsOverview({ services, completed: completedOf(deal), solutions: all })
    : null;
  const lifecycle = new Map(overview?.rows.map((r) => [r.service.id, r.statusLabel]) ?? []);

  // The purchased solutions' expandable delivery detail, by the purchased service's id.
  const detailFor = (serviceId: string): SolutionDetailSlot | null => {
    if (deliveryOff) {
      return {
        summary: "Not turned on",
        body: <p className="text-[12px] text-muted-foreground">{errorText(ws.error)}</p>,
      };
    }
    const linked = linkedSolutionFor(serviceId, all);
    if (!linked) {
      return {
        summary: "No delivery record yet",
        body: (
          <p className="text-[12px] text-muted-foreground">
            No delivery record is linked to this solution yet. Add one from “Add a solution”, or set
            it up from the signed SOW.
          </p>
        ),
      };
    }
    const open = linked.components.filter((c) => !c.archived && c.status !== "complete").length;
    const blockers = linked.components.filter((c) => !c.archived && c.blocker?.trim()).length;
    return {
      summary: `${open} component${open === 1 ? "" : "s"} open${blockers ? ` · ${blockers} blocked` : ""}`,
      body: (
        <SolutionDetail
          solution={linked}
          implementationId={implementationId}
          editable={canEdit}
          all={all}
        />
      ),
    };
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted-foreground">
          Each purchased solution, its lifecycle and its delivery detail. Requested solutions are
          listed below the purchased ones.
        </p>
        {canEdit && !deliveryOff ? (
          <div className="flex gap-2">
            <SowSolutionsReview implementationId={implementationId} />
            <button type="button" className={PRIMARY} onClick={() => setAdding((v) => !v)}>
              {adding ? "Close" : "Add a solution"}
            </button>
          </div>
        ) : null}
      </div>

      <PurchaseCheckNote purchase={purchase} />

      {adding ? (
        <NewSolutionForm implementationId={implementationId} onDone={() => setAdding(false)} />
      ) : null}

      {deal ? (
        <SolutionsCard deal={deal} editable={editableDeal} detailFor={detailFor} />
      ) : (
        <p className="text-[12px] text-muted-foreground">
          This implementation has no purchase record, so its purchased solutions are not listed
          here.
        </p>
      )}

      {other.length > 0 ? (
        <section className="space-y-3" aria-label="Requested and other solutions">
          <h2 className="text-[13px] font-semibold">Requested and other solutions</h2>
          {other.map((s) => (
            <SolutionCard
              key={s.id}
              solution={s}
              implementationId={implementationId}
              editable={canEdit}
              all={all}
              lifecycle={
                s.purchasedServiceId ? (lifecycle.get(s.purchasedServiceId) ?? null) : null
              }
            />
          ))}
        </section>
      ) : null}

      {active.length === 0 && services.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-[12px] text-muted-foreground">
          No solutions yet. Set them up from the signed SOW, or add one by hand.
        </p>
      ) : null}

      {archived.length > 0 ? (
        <div>
          <button type="button" className={BUTTON} onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide" : "Show"} archived ({archived.length})
          </button>
          {showArchived ? (
            <div className="mt-3 space-y-3 opacity-75">
              {archived.map((s) => (
                <SolutionCard
                  key={s.id}
                  solution={s}
                  implementationId={implementationId}
                  editable={canEdit}
                  all={all}
                  lifecycle={null}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function purchasedServices(deal: DealData): ServiceSpec[] {
  const intake = readIntake(deal.account.intake);
  return normalizeServices(intake.timeline.services as ServiceSpec[], intake.timeline);
}

function completedOf(deal: DealData): Record<string, string> {
  return readIntake(deal.account.intake).timeline.completed;
}
