import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";

import { applySowRead } from "@/components/build-it";
import { Working } from "@/components/working";
import { dealQuery, type DealData } from "@/lib/deal-query";
import { readIntake, type IntakeAnswers } from "@/lib/intake-answers";
import { generateBriefForDeal, saveIntake } from "@/lib/presale.functions";
import { proposePlanFromSowFn } from "@/lib/sow-plan.functions";
import { cn } from "@/lib/utils";

/**
 * "Fill in the rest": press it after a new Gong brief or a new SOW.
 *
 * One reading of the calls and the SOW together, checked by a second
 * reading and by the code rules, fills the flow, the forms, the process and
 * the facts — then the SOW's services go on the plan. Anything the AI filled
 * before is refreshed; anything a person answered stays exactly as they left
 * it. Safe to press as often as the sources change.
 */
export function FillFromSources({
  deal,
  className,
  compact = false,
}: {
  deal: DealData;
  className?: string;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const synthesize = useServerFn(generateBriefForDeal);
  const readSow = useServerFn(proposePlanFromSowFn);
  const save = useServerFn(saveIntake);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const hasNotes = deal.gong_reports.length > 0;
  const hasSow = Boolean(deal.sow_url);

  async function run() {
    const dealId = deal.account.id;
    setBusy(true);
    setResult(null);
    try {
      const r = await synthesize({ data: { dealId } });
      if (r.generator !== "llm") {
        throw new Error(
          r.error ??
            "The AI reading did not run, so nothing was filled. Check the API key in Vercel.",
        );
      }
      let services = 0;
      if (hasSow) {
        const fresh = await qc.fetchQuery(dealQuery(dealId));
        services = await applySowRead(
          dealId,
          readIntake(fresh?.account.intake),
          readSow as never,
          save as never,
        );
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["deal", dealId] }),
        qc.invalidateQueries({ queryKey: ["welcome", dealId] }),
      ]);
      const parts = [...r.filled];
      if (services)
        parts.push(`${services} service${services === 1 ? "" : "s"} from the SOW on the plan`);
      setResult({
        ok: true,
        text: parts.length
          ? `Filled: ${parts.join(", ")}. Anything you typed yourself was left alone.`
          : "Up to date — nothing new in the notes or the SOW, and your own answers stand.",
      });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "Something did not finish." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("space-y-1", className)}>
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy || !hasNotes}
        title={
          hasNotes
            ? "Read the Gong brief and the SOW together and fill the flow, the forms, the process and the plan"
            : "Add the Gong brief first"
        }
        className={cn(
          "inline-flex items-center gap-1.5 rounded-sm font-medium disabled:opacity-50",
          compact
            ? "h-7 border border-primary/40 bg-card px-2.5 text-[12px] text-primary hover:bg-primary/5"
            : "h-8 bg-primary px-3 text-[12px] text-primary-foreground hover:bg-primary/90",
        )}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {busy ? (
          <Working label="Reading the Gong brief and the SOW…" estimateSeconds={120} />
        ) : (
          `Fill in the rest from the Gong brief${hasSow ? " and SOW" : ""}`
        )}
      </button>
      {result ? (
        <p
          role={result.ok ? undefined : "alert"}
          className={cn(
            "text-[12px]",
            result.ok ? "text-status-ontrack-foreground" : "text-destructive",
          )}
        >
          {result.text}
        </p>
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
