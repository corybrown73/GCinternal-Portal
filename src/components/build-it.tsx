import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, Sparkles } from "lucide-react";

import { Working } from "@/components/working";
import { dealQuery, type DealData } from "@/lib/deal-query";
import { flowAnswered, intakeStatus, readIntake } from "@/lib/intake-answers";
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
  const questionsAnswered = intakeStatus(intake).done && flowAnswered(intake);
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
      mark("brief", "busy");
      const r = await synthesize({ data: { dealId } });
      if (r.generator !== "llm") {
        throw new Error(
          "The AI step did not run, so nothing was read from the calls. Check the API key in Vercel, then press Build it again.",
        );
      }
      mark("brief", "done");

      // The brief filled the intake; read the record again before touching it.
      const fresh = await qc.fetchQuery(dealQuery(dealId));
      const freshIntake = readIntake(fresh?.account.intake);
      if (fresh?.sow_url && !freshIntake.timeline.sow_applied_at) {
        mark("sow", "busy");
        const read = await readSow({ data: { dealId } });
        const wanted = new Set(freshIntake.wanted_forms.map((f) => f.name.trim().toLowerCase()));
        // Every row the reader is sure of; the uncertain ones wait for a person.
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
                ...freshIntake.timeline,
                services: mergeProposal(
                  normalizeServices(
                    (freshIntake.timeline.services ?? []) as ServiceSpec[],
                    freshIntake.timeline,
                  ),
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
                ? "Answer the questions above first: which kind of account, and their forms"
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
          Answer the questions above, then press Build it.
        </p>
      ) : null}
    </div>
  );
}

/** The three clicks, as a strip: where this account is on the way to a deck. */
export function ThreeClicks({ deal }: { deal: DealData }) {
  const hasNotes = deal.gong_reports.length > 0;
  const hasBrief = deal.briefs.some((b) => b.status === "complete" && b.generator === "llm");
  const hasLink = Boolean(
    (deal.account as { welcome_share_url?: string | null }).welcome_share_url,
  );
  const intake = readIntake(deal.account.intake);
  // The same three rules the panel uses, so the strip and the panel cannot
  // disagree about which step is next.
  const paperDone = Boolean(deal.sow_url) || (intake.has_sow === false && Boolean(intake.contract));
  const facts = intakeStatus(intake).done;
  const flow = intake.path !== null && flowAnswered(intake);
  const items = [
    { n: 1, label: "Notes in", done: hasNotes && paperDone },
    { n: 2, label: "Confirm the facts", done: facts },
    { n: 3, label: "Pick the flow", done: flow },
    { n: 4, label: "Open the deck", done: hasLink },
  ];
  return (
    <ol className="flex flex-wrap items-center gap-1 text-[12px]">
      {items.map((it, i) => (
        <li key={it.n} className="flex items-center gap-1">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
              it.done
                ? "border-status-ontrack-foreground/40 bg-status-ontrack/60 text-status-ontrack-foreground"
                : "border-border text-muted-foreground",
            )}
          >
            <span className="font-mono text-[10px]">{it.n}</span>
            {it.label}
            {it.done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
          </span>
          {i < items.length - 1 ? <ArrowRight className="h-3 w-3 text-muted-foreground" /> : null}
        </li>
      ))}
    </ol>
  );
}
