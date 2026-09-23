import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, Sparkles } from "lucide-react";

import { Working } from "@/components/working";
import { dealQuery, type DealData } from "@/lib/deal-query";
import { flowAnswered, readIntake } from "@/lib/intake-answers";
import { generateBriefForDeal, saveIntake } from "@/lib/presale.functions";
import { proposePlanFromSowFn } from "@/lib/sow-plan.functions";
import { mergeProposal, type SowPlanRow } from "@/lib/sow-plan";
import { normalizeServices, type ServiceSpec } from "@/lib/onboarding-services";
import { getWelcome, issueWelcomeLinkFn } from "@/lib/welcome.functions";
import { cn } from "@/lib/utils";

/**
 * Click two of three: everything between "notes in" and "deck ready", as one
 * button.
 *
 * It runs what used to be five separate steps on five panels: read the calls
 * and write the brief; fill the intake from it; read the SOW into the plan
 * and take every row it is sure of; build the plan; mint the customer's
 * link. Each step reports as it goes. What the AI could not fill comes back
 * as a short list of blanks — the same readiness list the welcome page
 * keeps — each a one-line answer on the record.
 */
type Step = { key: string; label: string; state: "todo" | "busy" | "done" | "skip" };

export function BuildIt({ deal, className }: { deal: DealData; className?: string }) {
  const qc = useQueryClient();
  const synthesize = useServerFn(generateBriefForDeal);
  const readSow = useServerFn(proposePlanFromSowFn);
  const save = useServerFn(saveIntake);
  const issue = useServerFn(issueWelcomeLinkFn);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blanks, setBlanks] = useState<Array<{ key: string; label: string; hint: string }> | null>(
    null,
  );

  const intake = readIntake(deal.account.intake);
  const hasNotes = deal.gong_reports.length > 0;
  // The flow is the one answer the build cannot guess. The facts are filled
  // by the brief this very button writes, so waiting on them was backwards;
  // whatever the calls did not say comes back as the blanks list below.
  const questionsAnswered = flowAnswered(intake);
  const built =
    deal.briefs.some((b) => b.status === "complete" && b.generator === "llm") &&
    Boolean((deal.account as { welcome_share_url?: string | null }).welcome_share_url);
  const running = steps?.some((s) => s.state === "busy") ?? false;

  const mark = (key: string, state: Step["state"]) =>
    setSteps((prev) => (prev ? prev.map((s) => (s.key === key ? { ...s, state } : s)) : prev));

  async function run() {
    setError(null);
    setBlanks(null);
    const plan: Step[] = [
      { key: "brief", label: "Reading the calls, writing the brief", state: "todo" },
      { key: "sow", label: "Reading the SOW into the plan", state: "todo" },
      { key: "link", label: "Building the plan and the customer's link", state: "todo" },
    ];
    setSteps(plan);
    const dealId = deal.account.id;
    try {
      // The first build reuses a brief written after the newest notes — Fill
      // in the rest has usually just written it. Build it again re-reads.
      const newestBrief = deal.briefs
        .filter((x) => x.status === "complete" && x.generator === "llm")
        .map((x) => x.created_at)
        .sort()
        .at(-1);
      const newestNotes = deal.gong_reports
        .map((x) => x.created_at)
        .sort()
        .at(-1);
      if (!built && newestBrief && newestNotes && newestBrief >= newestNotes) {
        mark("brief", "done");
      } else {
        mark("brief", "busy");
        const r = await synthesize({ data: { dealId } });
        if (r.generator !== "llm") {
          throw new Error(
            "The AI step did not run, so nothing was read from the calls. Check the API key in Vercel, then press Build it again.",
          );
        }
        mark("brief", "done");
      }

      // The brief filled the intake; read the record again before touching it.
      const fresh = await qc.fetchQuery(dealQuery(dealId));
      const freshIntake = readIntake(fresh?.account.intake);
      if (fresh?.sow_url && !freshIntake.timeline.sow_applied_at) {
        mark("sow", "busy");
        await applySowRead(dealId, freshIntake, readSow, save);
        mark("sow", "done");
      } else {
        mark("sow", "skip");
      }

      mark("link", "busy");
      const shareUrl = (fresh?.account as { welcome_share_url?: string | null } | undefined)
        ?.welcome_share_url;
      if (!shareUrl) await issue({ data: { dealId } });
      mark("link", "done");

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["deal", dealId] }),
        qc.invalidateQueries({ queryKey: ["welcome", dealId] }),
      ]);
      const view = await getWelcome({ data: { dealId } });
      setBlanks(view?.readiness ?? []);
    } catch (e) {
      setSteps((prev) =>
        prev ? prev.map((s) => (s.state === "busy" ? { ...s, state: "todo" } : s)) : prev,
      );
      setError(e instanceof Error ? e.message : "Something did not finish");
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void run()}
          disabled={!hasNotes || !questionsAnswered || running}
          title={
            !hasNotes
              ? "Paste the call notes first"
              : !questionsAnswered
                ? "Confirm the onboarding flow first"
                : "Read the calls, write the brief, read the SOW, build the plan, make the customer's link"
          }
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[12px] font-medium",
            built
              ? "border border-border bg-card text-foreground hover:bg-muted"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50",
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {running ? (
            <Working label="Building…" estimateSeconds={90} />
          ) : built ? (
            "Build it again"
          ) : (
            "Build it"
          )}
        </button>
        {built && !running ? (
          <Link
            to="/onboarding-plan/$dealId"
            params={{ dealId: deal.account.id }}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            Open the deck <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
      {steps ? (
        <ol className="space-y-0.5 text-[12px]">
          {steps.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px]",
                  s.state === "done" &&
                    "border-status-ontrack-foreground text-status-ontrack-foreground",
                  s.state === "busy" && "border-primary text-primary",
                  s.state === "skip" && "border-border text-muted-foreground",
                  s.state === "todo" && "border-border text-transparent",
                )}
              >
                {s.state === "done" ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                {s.state === "busy" ? (
                  <span className="h-2 w-2 animate-spin rounded-full border border-current border-t-transparent" />
                ) : null}
                {s.state === "skip" ? "–" : null}
              </span>
              <span className={cn(s.state === "skip" && "text-muted-foreground line-through")}>
                {s.label}
                {s.key === "sow" && s.state === "skip" ? " (no SOW uploaded, or already read)" : ""}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {error ? (
        <p role="alert" className="text-[12px] text-destructive">
          {error}
        </p>
      ) : null}
      {blanks ? (
        blanks.length === 0 ? (
          <p className="text-[12px] text-status-ontrack-foreground">
            Nothing left blank. The deck is ready to open and send.
          </p>
        ) : (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[12px]">
            <p className="font-medium">
              Built. {blanks.length} thing{blanks.length === 1 ? "" : "s"} the calls did not say —
              each is one line on this page:
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
              {blanks.map((b) => (
                <li key={b.key}>
                  <span className="text-foreground">{b.label}</span> — {b.hint}
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}
      {!hasNotes && !steps ? (
        <p className="text-[12px] text-muted-foreground">
          Paste the call notes below, then press Build it. Everything else follows from them.
        </p>
      ) : hasNotes && !questionsAnswered && !steps ? (
        <p className="text-[12px] text-muted-foreground">
          Confirm the onboarding flow, then press Build it.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Read the signed SOW and put every row it is sure of on the plan. The
 * uncertain rows wait for a person on the plan panel; a paid form the
 * intake already names is not added twice. Shared by Build it and Fill in
 * the rest.
 */
export async function applySowRead(
  dealId: string,
  intake: ReturnType<typeof readIntake>,
  readSow: (a: { data: { dealId: string } }) => Promise<{
    proposal: { services: SowPlanRow[]; notes: string[] };
  }>,
  save: (a: { data: never }) => Promise<unknown>,
): Promise<number> {
  const read = await readSow({ data: { dealId } });
  const wanted = new Set(intake.wanted_forms.map((f) => f.name.trim().toLowerCase()));
  const accepted = read.proposal.services.filter(
    (row: SowPlanRow) =>
      row.confidence !== "uncertain" &&
      !(row.kind === "paid_form" && wanted.has(row.name.trim().toLowerCase())),
  );
  const makeId = (row: SowPlanRow) =>
    `${row.kind.slice(0, 4)}-${Math.random().toString(36).slice(2, 8)}`;
  await save({
    data: {
      dealId,
      patch: {
        timeline: {
          ...intake.timeline,
          services: mergeProposal(
            normalizeServices((intake.timeline.services ?? []) as ServiceSpec[], intake.timeline),
            accepted,
            makeId,
          ),
          integration_tier: 0,
          integration_target: null,
          sow_applied_at: new Date().toISOString(),
          sow_notes: read.proposal.notes.map((n: string) => n.slice(0, 300)).slice(0, 20),
        },
      },
    } as never,
  });
  return accepted.length;
}
