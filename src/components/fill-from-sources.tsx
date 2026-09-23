import { useEffect, useRef } from "react";
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
 * Start the reading and do not wait for it: the progress is on the record.
 * Used by the Gong and SOW uploads (automatically) and by "Read again".
 */
export function useStartReading(dealId: string) {
  const qc = useQueryClient();
  const prepare = useServerFn(prepareDealFn);
  return useMutation({
    mutationFn: async () => {
      const run = prepare({ data: { dealId } });
      // The record says "running" within a second; show it.
      setTimeout(() => void qc.invalidateQueries({ queryKey: ["deal", dealId] }), 1500);
      return run;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["deal", dealId] });
      void qc.invalidateQueries({ queryKey: ["welcome", dealId] });
    },
  });
}

/**
 * Where the reading stands, from the record: reading now, what it filled,
 * or what went wrong. Also queues the extra run a mid-flight upload asked
 * for, once the first finishes.
 */
export function ReadingStatus({ deal, editable }: { deal: DealData; editable: boolean }) {
  const intake = readIntake(deal.account.intake);
  const r = intake.ai_reading;
  const start = useStartReading(deal.account.id);
  const running = readingInFlight(r);
  const queued = useRef<string | null>(null);
  useEffect(() => {
    if (!editable || !r || running || !r.again || queued.current === r.started_at) return;
    queued.current = r.started_at;
    start.mutate();
  }, [editable, r, running, start]);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
      {running ? (
        <span className="inline-flex items-center gap-1.5 text-primary">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          AI is reading the Gong brief{deal.sow_url ? " and the SOW" : ""} — about two minutes. You
          can leave this page.
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
          {r.error ? (
            <span className="text-amber-700 dark:text-amber-400"> · {r.error}</span>
          ) : null}
        </span>
      ) : (
        <span className="text-muted-foreground">Not read yet.</span>
      )}
      {editable && !running ? (
        <button
          type="button"
          onClick={() => start.mutate()}
          disabled={start.isPending || deal.gong_reports.length === 0}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-sm px-2.5 text-[12px] font-medium disabled:opacity-50",
            r
              ? "border border-border hover:bg-muted"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          <RefreshCw className="h-3 w-3" />
          {r ? "Read again" : "Read the Gong brief and SOW"}
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
