import { useQuery } from "@tanstack/react-query";
import { Check, Clock3, Send } from "lucide-react";

import { dealQuery } from "@/lib/deal-query";
import { readIntake } from "@/lib/intake-answers";
import { shortDay } from "@/lib/onboarding-timeline";
import {
  HANDOFF_STATUS_LABEL,
  handoffChecks,
  type HandoffChecks,
  type HandoffStatus,
} from "@/lib/sales-handoff";
import { cn } from "@/lib/utils";

/**
 * The Sales → TIS handoff, as one word everywhere the deal is shown: the
 * board, the deal's header, the customer's header, the TIS's workspace.
 * Amber until the facts are in, blue while the customer has the questions,
 * green when both sides are done. The TIS never sees the form here — only
 * the state, and a way to the record.
 */
const TONE: Record<HandoffStatus, string> = {
  outstanding: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  sent: "border-primary/40 bg-primary/10 text-primary",
  complete:
    "border-status-ontrack-foreground/40 bg-status-ontrack/60 text-status-ontrack-foreground",
};

const ICON: Record<HandoffStatus, typeof Check> = {
  outstanding: Clock3,
  sent: Send,
  complete: Check,
};

export function HandoffChip({
  status,
  firstMeeting,
  detail,
  size = "md",
  className,
}: {
  status: HandoffStatus;
  /** YYYY-MM-DD of the booked first meeting, when Sales has booked it. */
  firstMeeting?: string | null;
  /** A short second clause: "3 of 7 answers". */
  detail?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const I = ICON[status];
  return (
    <span
      title={HANDOFF_STATUS_LABEL[status]}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        size === "sm" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[11px]",
        TONE[status],
        className,
      )}
    >
      <I className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} strokeWidth={2.5} />
      {size === "sm"
        ? status === "outstanding"
          ? "Handoff"
          : status === "sent"
            ? "Handoff · customer"
            : "Handoff ✓"
        : HANDOFF_STATUS_LABEL[status]}
      {detail ? <span className="opacity-80">· {detail}</span> : null}
      {firstMeeting ? (
        <span className="opacity-80">· first meeting {shortDay(firstMeeting)}</span>
      ) : null}
    </span>
  );
}

/** "3 of 7 answers in" — what the chip says after the status. */
export function handoffDetail(c: HandoffChecks): string | null {
  if (c.status === "complete") return null;
  const open = c.salesComplete.missing.length + c.customerReady.missing.length;
  return open ? `${open} to go` : null;
}

/** The chip for a deal the page has not loaded yet: reads the deal itself. */
export function HandoffChipForDeal({ dealId, size }: { dealId: string; size?: "sm" | "md" }) {
  const q = useQuery(dealQuery(dealId));
  if (!q.data) return null;
  const intake = readIntake(q.data.account.intake);
  if (intake.path === "field_fusion") return null;
  const c = handoffChecks(intake);
  return (
    <HandoffChip
      status={c.status}
      detail={handoffDetail(c)}
      firstMeeting={
        intake.timeline.times["kickoff"] ? (intake.timeline.overrides["kickoff"] ?? null) : null
      }
      {...(size ? { size } : {})}
    />
  );
}
