import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Sparkles } from "lucide-react";

import { When } from "@/components/when";
import type { DealData } from "@/lib/deal-query";
import { readIntake, type IntakeAnswers } from "@/lib/intake-answers";
import { readingInFlight } from "@/lib/stage-flow";
import { prepareDealFn } from "@/lib/stage-flow.functions";
import { cn } from "@/lib/utils";

/**
 * Queue the reading and do not wait for it: the progress is on the record.
 * Used by the Gong and SOW uploads (automatically) and by "Read again",
 * which passes `force` so the job reads even when nothing changed.
 */
export function useStartReading(dealId: string) {
  const qc = useQueryClient();
  const prepare = useServerFn(prepareDealFn);
  return useMutation({
    mutationFn: async (vars?: { force?: boolean } | void) => {
      const run = prepare({ data: { dealId, force: Boolean(vars?.force) } });
      // The record says "queued" within a second; show it.
      setTimeout(() => void qc.invalidateQueries({ queryKey: ["deal", dealId] }), 1500);
      return run;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["deal", dealId] });
      void qc.invalidateQueries({ queryKey: ["welcome", dealId] });
    },
  });
}

/** The step a job is on, in words a person reads while they wait. */
export function readingStepLabel(
  step: string | null | undefined,
  status: string | undefined,
): string {
  if (status === "queued") return "Queued — the reading starts in a moment";
  switch (step) {
    case "sow":
      return "Reading the SOW…";
    case "brief":
    case "brief_core":
    case "brief_plan":
      return "Writing the brief…";
    case "verify":
      return "Checking the brief against the sources…";
    case "apply":
      return "Filling in the deal…";
    case "finalize":
      return "Finishing up…";
    default:
      return "Reading the deal's sources…";
  }
}

const BRANCH_LABEL: Record<string, string> = {
  sow: "The SOW",
  brief: "The brief",
  brief_core: "The brief",
  brief_plan: "The plan",
  verify: "The check",
  apply: "The fill",
};

/**
 * Where the reading stands, from the record: queued or reading now (and
 * which step), what it filled, or what went wrong — per part, so a SOW
 * that could not be opened is said beside a brief that worked. The button
 * is on whenever there is anything to read: a SOW, notes, or a summary.
 */
export function ReadingStatus({ deal, editable }: { deal: DealData; editable: boolean }) {
  const intake = readIntake(deal.account.intake);
  const r = intake.ai_reading;
  const start = useStartReading(deal.account.id);
  const running = readingInFlight(r);
  const failures = Object.entries(r?.branches ?? {}).filter(([, b]) => b.status === "failed");
  const hasSources =
    deal.gong_reports.length > 0 ||
    Boolean(deal.sow_url) ||
    Boolean(intake.contract?.path) ||
    deal.notes.some((n) => n.review_status === "reviewed") ||
    Boolean(deal.account.summary?.trim());

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
      {running ? (
        <span className="inline-flex items-center gap-1.5 text-primary">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {readingStepLabel(r?.step, r?.status)} You can leave this page.
        </span>
      ) : r?.status === "failed" ? (
        <span role="alert" className="text-destructive">
          The reading did not finish: {r.error ?? "unknown error"}
        </span>
      ) : r?.status === "done" ? (
        <span className="text-muted-foreground">
          <Sparkles className="mr-1 inline h-3 w-3 text-primary" />
          Read <When value={r.finished_at ?? r.started_at} />
          {r.filled.length ? ` · filled ${r.filled.join(", ")}` : " · nothing new to fill"}
          {failures.length ? (
            <span className="text-amber-700 dark:text-amber-400">
              {failures.map(([key, b]) => (
                <span key={key}>
                  {" "}
                  · {BRANCH_LABEL[key] ?? key}: {b.detail ?? "did not finish"}
                </span>
              ))}
            </span>
          ) : r.error ? (
            <span className="text-amber-700 dark:text-amber-400"> · {r.error}</span>
          ) : null}
        </span>
      ) : r?.status === "queued" || r?.status === "running" ? (
        <span className="text-muted-foreground">
          The last reading stalled{r.error ? `: ${r.error}` : ""}. Read again to retry.
        </span>
      ) : deal.briefs.some((b) => b.status === "complete" && b.generator === "llm") ? (
        <span className="text-muted-foreground">
          <Sparkles className="mr-1 inline h-3 w-3 text-primary" />
          Read from the Gong brief. Read again to include the SOW.
        </span>
      ) : (
        <span className="text-muted-foreground">Not read yet.</span>
      )}
      {editable && !running ? (
        <button
          type="button"
          onClick={() => start.mutate({ force: true })}
          disabled={start.isPending || !hasSources}
          title={hasSources ? undefined : "Add the SOW, call notes or a summary first"}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-sm px-2.5 text-[12px] font-medium disabled:opacity-50",
            r
              ? "border border-border hover:bg-muted"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          <RefreshCw className="h-3 w-3" />
          {r ? "Read again" : "Read the SOW and the notes"}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Where an AI answer came from, under the answer: the source and the words.
 * Gone the moment a person changes the answer — it is theirs then.
 */
export function AiSource({ answers, field }: { answers: IntakeAnswers; field: string }) {
  if (!answers.ai_filled.includes(field)) return null;
  const src = answers.ai_sources[field];
  return (
    <p className="mt-1 flex items-start gap-1 text-[11px] text-muted-foreground">
      <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
      <span>
        Filled from {src?.source ? <b className="font-medium">{src.source}</b> : "the notes"}
        {src?.quote ? <>: &ldquo;{src.quote}&rdquo;</> : null}. Change it and it is yours.
      </span>
    </p>
  );
}
