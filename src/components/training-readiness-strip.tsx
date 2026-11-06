import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { CARD } from "@/components/current-implementation-context";
import { getTrainingPlan } from "@/lib/training.functions";
import { cn } from "@/lib/utils";

/**
 * A short line on Current Implementation: how training readiness stands, with a link to
 * the Training & Readiness tab where it is managed. Shows nothing while the feature is off.
 */
export function TrainingReadinessStrip({
  customerId,
  implementationId,
}: {
  customerId: string;
  implementationId: string;
}) {
  const load = useServerFn(getTrainingPlan);
  const q = useQuery({
    queryKey: ["training-plan", implementationId],
    queryFn: () => load({ data: { implementationId } }),
  });
  if (!q.data || !q.data.enabled) return null;
  const c = q.data.coverage;
  return (
    <section
      className={cn(
        CARD,
        "flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]",
      )}
      aria-label="Training and readiness"
    >
      <p>
        <span className="font-medium">Training &amp; Readiness:</span> {c.topics} topics ·{" "}
        {c.delivered} delivered · {c.demonstrated} shown · {c.needsConfirmation.length}{" "}
        responsibility to confirm
        {c.uncovered.length > 0
          ? ` · ${c.uncovered.length} purchased training not yet planned`
          : ""}
      </p>
      <Link
        to="/customers/$customerId"
        params={{ customerId }}
        search={{ tab: "training", impl: implementationId }}
        className="text-[12px] font-medium text-primary hover:underline"
      >
        Open Training &amp; Readiness →
      </Link>
    </section>
  );
}
