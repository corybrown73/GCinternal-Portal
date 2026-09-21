import { useQuery } from "@tanstack/react-query";

import { TimelinePanel } from "@/components/timeline-panel";
import { WatchOutsPanel } from "@/components/watch-outs-panel";
import { canEditDeal, useProfile } from "@/lib/auth";
import { dealQuery, type DealData } from "@/lib/deal-query";
import { readIntake } from "@/lib/intake-answers";
import { closeDateFor, timelineFor } from "@/lib/onboarding-plan";
import { localIso } from "@/lib/onboarding-timeline";
import { wonStage } from "@/lib/pipeline-stages";
import { watchOutsFor } from "@/lib/watch-outs";

/**
 * The plan and its watch-outs, from the deal's record. One component, so the
 * customer's Overview and the deck's own tab draw the same thing and cannot
 * drift apart.
 */
export function PlanSection({
  deal,
  editable,
  highlight = false,
}: {
  deal: DealData;
  editable: boolean;
  highlight?: boolean;
}) {
  const intake = readIntake(deal.account.intake);
  const timeline = timelineFor(
    intake,
    closeDateFor({
      intake,
      stageHistory: deal.stage_history,
      wonStageKey: wonStage(deal.stages).key,
      today: localIso(),
    }).date,
  );
  const latestBrief =
    deal.briefs.find((b) => b.status === "complete" && b.generator === "llm") ?? null;
  const watchOuts = watchOutsFor({
    brief: latestBrief?.structured_json ?? null,
    notes: deal.gong_reports.map((r) => r.content_md),
    intake,
    timeline,
  });
  return (
    <>
      <WatchOutsPanel
        rows={watchOuts}
        hasBrief={Boolean(latestBrief) || deal.gong_reports.length > 0}
      />
      <TimelinePanel
        dealId={deal.account.id}
        raw={deal.account.intake}
        stageHistory={deal.stage_history}
        wonStageKey={wonStage(deal.stages).key}
        editable={editable}
        hasSow={Boolean(deal.sow_url)}
        highlight={highlight}
      />
    </>
  );
}

/** The same, fetched by deal id: for a page that has the customer but not the deal in hand. */
export function PlanFromDeal({ dealId }: { dealId: string }) {
  const { profile } = useProfile();
  const q = useQuery(dealQuery(dealId));
  if (q.isPending) return <p className="text-[13px] text-muted-foreground">Loading the plan…</p>;
  if (!q.data) return null;
  return <PlanSection deal={q.data} editable={canEditDeal(profile?.role)} />;
}
