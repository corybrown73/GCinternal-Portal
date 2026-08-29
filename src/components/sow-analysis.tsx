import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  analyzeSowDocument,
  applySowProposalToImplementation,
  setSowDocumentForImplementation,
  uploadAttachment,
} from "@/lib/hub.functions";
import { fileToBase64, MAX_ATTACHMENT_BYTES } from "@/lib/attachment-client";
import {
  CONFIDENCE_LABEL,
  deliveryWindowLabel,
  EXTRACTION_SECTIONS,
  proposalAsNote,
  proposedTimings,
  TIMING_SOURCE_LABEL,
  type ProposedTiming,
  type SowAnalysis,
  type SowFinding,
  type SowProposedStage,
  type TimingOverride,
} from "@/lib/sow-analysis";

import { LIFECYCLE_STAGES, STAGE_ALIASES } from "@/lib/lifecycle";
import { fmtDate } from "@/lib/hub-format";
import { downloadSowAnalysisPdf } from "@/lib/sow-pdf";
import type { TeamOption } from "@/components/owner-picker";
import { OwnerPicker } from "@/components/owner-picker";

const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
const primaryButtonClass =
  "inline-flex items-center gap-1 rounded-sm border border-foreground/30 bg-foreground/90 px-2 py-1 text-[11px] font-medium text-background hover:bg-foreground disabled:opacity-50";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

/** What an applied proposal actually wrote. */
type Applied = {
  goals: boolean;
  requirements: number;
  successMeasures: number;
  note: boolean;
};

function ConfidenceTag({ confidence }: { confidence: SowFinding["confidence"] }) {
  if (confidence === "stated") return null;
  return (
    <span
      className="ml-1.5 rounded-sm border border-border px-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground"
      title={CONFIDENCE_LABEL[confidence]}
    >
      {confidence}
    </span>
  );
}

function FindingList({ findings }: { findings: SowFinding[] }) {
  if (findings.length === 0) {
    return <p className="text-[12px] text-muted-foreground">Nothing found in the SOW.</p>;
  }
  return (
    <ul className="space-y-1">
      {findings.map((f, i) => (
        <li key={i} className="text-[12px] leading-snug">
          <span className="text-foreground">{f.text}</span>
          <ConfidenceTag confidence={f.confidence} />
          {f.quote ? (
            <span className="mt-0.5 block border-l border-border pl-2 text-[11px] italic text-muted-foreground">
              “{f.quote}”
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

type StageEntry = { index: number; stage: SowProposedStage; timing: ProposedTiming | null };

/** Group the proposed stages under the team's own lifecycle stages, in order. */
function groupByStage(entries: StageEntry[]) {
  const buckets = new Map<string, StageEntry[]>();
  const unmapped: StageEntry[] = [];
  for (const entry of entries) {
    const raw = entry.stage.lifecycleStage ?? "";
    const id = STAGE_ALIASES[raw] ?? raw;
    if (LIFECYCLE_STAGES.some((s) => s.id === id)) {
      const list = buckets.get(id) ?? [];
      list.push(entry);
      buckets.set(id, list);
    } else {
      unmapped.push(entry);
    }
  }
  const groups = LIFECYCLE_STAGES.filter((s) => buckets.has(s.id)).map((s) => ({
    id: s.id as string,
    label: s.label,
    stages: buckets.get(s.id)!,
  }));
  if (unmapped.length > 0) {
    groups.push({ id: "unmapped", label: "Not matched to a stage", stages: unmapped });
  }
  return groups;
}


function Checkbox({
  checked,
  disabled,
  onChange,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-1.5 text-[12px] leading-snug text-foreground">
      <input
        type="checkbox"
        className="mt-0.5 h-3 w-3"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

/**
 * Reads the SOW attached to the implementation, proposes a journey grouped by
 * the existing lifecycle stages, and lets the TIS review before anything is
 * written. Applying is additive: existing information is never replaced.
 */
export function SowAnalysisPanel({
  customerId,
  customerName,
  implementationId,
  sowDocumentUrl,
  sowDocumentName,
  team,
  currentGoals,
  requirementCount,
  successMeasureCount,
  startDate,

}: {
  customerId: string;
  customerName: string;
  implementationId: string;
  sowDocumentUrl: string | null;
  sowDocumentName: string | null;
  team: TeamOption[];
  currentGoals?: string | null;
  requirementCount?: number;
  successMeasureCount?: number;
  /** Anchors proposed relative weeks to calendar dates when known. */
  startDate?: string | null;
}) {

  const queryClient = useQueryClient();
  const analyze = useServerFn(analyzeSowDocument);
  const applyProposal = useServerFn(applySowProposalToImplementation);
  const attachSow = useServerFn(setSowDocumentForImplementation);
  const upload = useServerFn(uploadAttachment);

  type Run = {
    id: number;
    analysis: SowAnalysis;
    sowName: string | null;
    at: Date;
    applied: Applied | null;
  };

  const [runs, setRuns] = useState<Run[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [group, setGroup] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  /** Elapsed seconds while a run is in flight, so a slow read looks busy, not stuck. */
  const [elapsed, setElapsed] = useState(0);


  const [applyGoals, setApplyGoals] = useState(true);
  const [applyNote, setApplyNote] = useState(true);
  const [pickedRequirements, setPickedRequirements] = useState<Record<number, boolean>>({});
  const [pickedMeasures, setPickedMeasures] = useState<Record<number, boolean>>({});
  /** TIS adjustments to proposed weeks, per run id then journey index. */
  const [adjustments, setAdjustments] = useState<
    Record<number, Record<number, TimingOverride>>
  >({});

  const resetSelections = (a: SowAnalysis) => {
    setApplyGoals(true);
    setApplyNote(true);
    setPickedRequirements(Object.fromEntries(a.extraction.requirements.map((_, i) => [i, true])));
    setPickedMeasures(Object.fromEntries(a.extraction.successMeasures.map((_, i) => [i, true])));
  };

  const run = useMutation({
    mutationFn: async () => {
      // A new file is attached to the implementation first, so the analysis
      // reads it and the SOW section shows the same document.
      if (newFile) {
        if (newFile.size > MAX_ATTACHMENT_BYTES) {
          throw new Error("That file is too large for this preview — keep it under 4 MB.");
        }
        const stored = await upload({
          data: {
            folder: "sow" as const,
            fileName: newFile.name,
            contentType: newFile.type || "application/octet-stream",
            dataBase64: await fileToBase64(newFile),
          },
        });
        await attachSow({
          data: {
            implementationId,
            documentUrl: stored.path,
            documentName: stored.name,
          },
        });
        await queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
      }
      return analyze({ data: { implementationId } });
    },
    onSuccess: (r: { analysis: SowAnalysis; sowName: string | null }) => {
      const entry: Run = {
        id: Date.now(),
        analysis: r.analysis,
        sowName: r.sowName,
        at: new Date(),
        applied: null,
      };
      // Earlier runs are kept so nothing already reviewed is lost.
      setRuns((prev) => [entry, ...prev]);
      setActiveId(entry.id);
      setNewFile(null);
      resetSelections(r.analysis);
    },
  });

  useEffect(() => {
    if (!run.isPending) {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [run.isPending]);



  const active = runs.find((r) => r.id === activeId) ?? null;
  const analysis = active?.analysis;
  const applied = active?.applied ?? null;
  const overrides = activeId == null ? {} : (adjustments[activeId] ?? {});
  const timings = useMemo(
    () => (analysis ? proposedTimings(analysis, startDate ?? null, overrides) : []),
    [analysis, startDate, overrides],
  );
  const groups = useMemo(
    () =>
      analysis
        ? groupByStage(
            analysis.proposedJourney.map((stage, i) => ({
              index: i,
              stage,
              timing: timings[i] ?? null,
            })),
          )
        : [],
    [analysis, timings],
  );

  const setOverride = (index: number, next: TimingOverride | null) => {
    if (activeId == null) return;
    setAdjustments((prev) => {
      const forRun = { ...(prev[activeId] ?? {}) };
      if (next) forRun[index] = next;
      else delete forRun[index];
      return { ...prev, [activeId]: forRun };
    });
  };



  const proposedGoals = useMemo(
    () =>
      analysis
        ? analysis.extraction.objectives.map((o) => `• ${o.text}`).join("\n")
        : "",
    [analysis],
  );

  const apply = useMutation({
    mutationFn: () => {
      if (!analysis) throw new Error("Run the analysis first.");
      return applyProposal({
        data: {
          implementationId,
          authorId: authorId === "" ? null : authorId,
          goals: applyGoals && proposedGoals !== "" ? proposedGoals : null,
          requirements: analysis.extraction.requirements
            .filter((_, i) => pickedRequirements[i])
            .map((r) => r.text),
          successMeasures: analysis.extraction.successMeasures
            .filter((_, i) => pickedMeasures[i])
            .map((m) => m.text),
          journeyNote: applyNote
            ? proposalAsNote(analysis, active?.sowName ?? null, startDate ?? null, overrides)
            : null,
        },
      });
    },
    onSuccess: async (r: Applied) => {
      await queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
      setRuns((prev) => prev.map((x) => (x.id === activeId ? { ...x, applied: r } : x)));
    },
  });


  if (!sowDocumentUrl) {
    return (
      <p className="text-[12px] text-muted-foreground">
        <span className="text-foreground">Attach the SOW first.</span> Use the SOW section in the
        Overview tab — the analysis reads that document only.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-muted-foreground">
            Reads <span className="text-foreground">{sowDocumentName ?? "the attached SOW"}</span>{" "}
            and proposes a journey. Nothing is written until you apply it.
          </span>
          <button
            type="button"
            className={`${primaryButtonClass} ml-auto`}
            disabled={run.isPending}
            onClick={() => run.mutate()}
          >
            {run.isPending
              ? `${newFile ? "Uploading and reading" : "Reading the SOW"}… ${elapsed}s`
              : runs.length > 0
                ? "Re-analyze SOW"
                : "Analyse SOW"}
          </button>

          {analysis && active ? (
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                downloadSowAnalysisPdf({
                  analysis,
                  customerName,
                  sowName: active.sowName,
                  analysedAt: active.at,
                  startDate,
                  overrides,
                })
              }
            >
              Export PDF
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className={labelClass}>Use a new file (optional)</span>
          <input
            type="file"
            className="text-[11px] text-muted-foreground file:mr-2 file:rounded-sm file:border file:border-border file:bg-background file:px-1.5 file:py-0.5 file:text-[11px] file:text-foreground"
            aria-label="New SOW document"
            disabled={run.isPending}
            onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
          />
          <span>
            {newFile
              ? `${newFile.name} will replace the attached SOW when you re-analyze.`
              : "Leave empty to re-run against the SOW already attached."}
          </span>
      </div>

      {run.isPending ? (
        <p className="rounded-sm border border-border bg-accent px-2 py-1.5 text-[12px] text-foreground">
          Reading the document and drafting a journey — a long SOW can take a minute or two. The
          button stays greyed out until it finishes.
        </p>
      ) : null}

      </div>

      {run.isError ? (
        <p className="rounded-sm border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-[12px] text-destructive">
          {run.error instanceof Error ? run.error.message : "The analysis failed."}
        </p>
      ) : null}

      {analysis ? (
        <div className="space-y-3">
          <p className="rounded-sm border border-border bg-accent px-2 py-1.5 text-[12px] text-foreground">
            <span className="font-semibold">Draft — nothing applied yet.</span> The first block is
            what the SOW says; the second is a proposed journey built from it. Review both, then
            choose what to apply.
          </p>

          <div>
            <p className="text-[13px] font-semibold tracking-tight text-foreground">
              What the SOW says
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Read from {active?.sowName ?? sowDocumentName ?? "the attached SOW"}. Items tagged
              implied or uncertain are not stated plainly in the document.
            </p>
            <p className="mt-1 text-[12px] leading-snug text-foreground">{analysis.summary}</p>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {EXTRACTION_SECTIONS.map((section) => (
                <div key={section.key}>
                  <p className={labelClass}>{section.label}</p>
                  <div className="mt-1">
                    <FindingList findings={analysis.extraction[section.key]} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-border bg-surface p-2.5">
            <p className="text-[13px] font-semibold tracking-tight text-foreground">
              Proposed journey
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Grouped by the lifecycle stages this team already uses. A suggested starting point —
              the implementation&apos;s own journey is unchanged.
            </p>
            <div className="mt-1.5 rounded-sm border border-border bg-background px-2 py-1.5">
              <p className={labelClass}>Timeline stated in the SOW</p>
              <p className="mt-0.5 text-[12px] text-foreground">
                {deliveryWindowLabel(analysis)
                  ? `Overall duration: ${deliveryWindowLabel(analysis)}.`
                  : "The SOW states no overall delivery duration."}
              </p>
              {analysis.deliveryWindow.startCondition ? (
                <p className="text-[11px] text-muted-foreground">
                  Starts on: {analysis.deliveryWindow.startCondition}
                </p>
              ) : null}
              {analysis.deliveryWindow.delayConditions.length > 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Delay conditions: {analysis.deliveryWindow.delayConditions.join("; ")}
                </p>
              ) : null}
              {analysis.deliveryWindow.quote ? (
                <p className="mt-0.5 border-l border-border pl-2 text-[11px] italic text-muted-foreground">
                  “{analysis.deliveryWindow.quote}”
                </p>
              ) : null}
              <p className="mt-1 text-[11px] text-muted-foreground">
                Timing below is an AI planning recommendation estimated from the described scope and
                dependencies — never a commitment, and never an even split of the total.{" "}
                {startDate
                  ? `Calendar dates are counted from the recorded start date (${fmtDate(startDate)}).`
                  : "No start date is recorded, so timing stays in relative weeks."}{" "}
                Adjust any stage&apos;s weeks below before saving the proposal.
              </p>
            </div>
            <div className="mt-2 space-y-2.5">
              {groups.map((g) => (
                <div key={g.id} className="border-t border-border/70 pt-2 first:border-t-0 first:pt-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {g.label}
                  </p>
                  {g.stages.map(({ index, stage, timing }) => (
                    <div key={index} className="mt-1">
                      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                        {timing ? (
                          <>
                            {timing.weeks}
                            {timing.dates ? ` · ${timing.dates}` : ""}
                            {` · ${TIMING_SOURCE_LABEL[timing.source]}`}
                            {timing.overlapsWith.length > 0 ? " · overlaps" : ""}
                          </>
                        ) : (
                          "Timing not proposed"
                        )}
                      </p>
                      <p className="text-[13px] font-medium text-foreground">
                        {stage.name}
                        <ConfidenceTag confidence={stage.confidence} />
                      </p>
                      <p className="text-[12px] text-muted-foreground">{stage.purpose}</p>
                      {!timing ? (
                        <p className="mt-0.5 text-[11px] text-foreground">
                          Insufficient information in the SOW to propose a credible window — set the
                          weeks yourself if you want this stage timed.
                        </p>
                      ) : null}
                      {timing?.statedText ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          SOW timing: {timing.statedText}
                        </p>
                      ) : null}
                      {timing?.rationale ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Why this duration: {timing.rationale}
                        </p>
                      ) : null}
                      {timing?.dependencyDriver ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Timing depends on: {timing.dependencyDriver}
                        </p>
                      ) : null}
                      {timing && timing.overlapsWith.length > 0 ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Runs alongside: {timing.overlapsWith.join("; ")}
                        </p>
                      ) : null}
                      {timing?.beyondSowWindow ? (
                        <p className="mt-0.5 text-[11px] text-destructive">
                          Extends past the delivery window the SOW states.
                        </p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className={labelClass}>Adjust weeks</span>
                        <input
                          type="number"
                          min={1}
                          max={520}
                          aria-label={`${stage.name} start week`}
                          className="w-14 rounded-sm border border-border bg-background px-1 py-0.5 text-[11px] text-foreground"
                          value={overrides[index]?.startWeek ?? timing?.startWeek ?? ""}
                          onChange={(e) => {
                            const start = Number(e.target.value);
                            const end = overrides[index]?.endWeek ?? timing?.endWeek ?? start;
                            if (!Number.isFinite(start) || start < 1) return;
                            setOverride(index, { startWeek: start, endWeek: Math.max(end, start) });
                          }}
                        />
                        <span>to</span>
                        <input
                          type="number"
                          min={1}
                          max={520}
                          aria-label={`${stage.name} end week`}
                          className="w-14 rounded-sm border border-border bg-background px-1 py-0.5 text-[11px] text-foreground"
                          value={overrides[index]?.endWeek ?? timing?.endWeek ?? ""}
                          onChange={(e) => {
                            const end = Number(e.target.value);
                            const start = overrides[index]?.startWeek ?? timing?.startWeek ?? 1;
                            if (!Number.isFinite(end) || end < 1) return;
                            setOverride(index, { startWeek: Math.min(start, end), endWeek: end });
                          }}
                        />
                        {overrides[index] ? (
                          <button
                            type="button"
                            className={buttonClass}
                            onClick={() => setOverride(index, null)}
                          >
                            Reset to the proposal
                          </button>
                        ) : null}
                      </div>

                      {stage.workstreams.length > 0 ? (
                        <ul className="mt-1 space-y-0.5">
                          {stage.workstreams.map((w, j) => (
                            <li key={j} className="text-[12px] text-foreground">
                              • {w}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {stage.dependencies.length > 0 ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Depends on: {stage.dependencies.join("; ")}
                        </p>
                      ) : null}
                      {stage.customerResponsibilities.length > 0 ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Customer has to: {stage.customerResponsibilities.join("; ")}
                        </p>
                      ) : null}
                      {stage.acceptanceCriteria.length > 0 ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Accepted when: {stage.acceptanceCriteria.join("; ")}
                        </p>
                      ) : null}
                    </div>
                  ))}

                </div>
              ))}
            </div>
          </div>

          {analysis.assumptions.length > 0 || analysis.gaps.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {analysis.assumptions.length > 0 ? (
                <div>
                  <p className={labelClass}>Assumptions the proposal makes</p>
                  <ul className="mt-1 space-y-0.5">
                    {analysis.assumptions.map((a, i) => (
                      <li key={i} className="text-[12px] text-muted-foreground">
                        • {a}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {analysis.gaps.length > 0 ? (
                <div>
                  <p className={labelClass}>Still unclear from the SOW</p>
                  <ul className="mt-1 space-y-0.5">
                    {analysis.gaps.map((g, i) => (
                      <li key={i} className="text-[12px] text-muted-foreground">
                        • {g}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Review before applying */}
          <div className="rounded-md border border-border bg-surface p-2.5">
            <p className="text-[13px] font-semibold tracking-tight text-foreground">
              Review and apply
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Only ticked items are added. Nothing already recorded is changed or removed.
            </p>

            {applied ? (
              <p className="mt-2 text-[12px] text-foreground">
                Applied: {applied.goals ? "goals added" : "goals unchanged"} ·{" "}
                {applied.requirements} requirement{applied.requirements === 1 ? "" : "s"} ·{" "}
                {applied.successMeasures} success measure
                {applied.successMeasures === 1 ? "" : "s"} ·{" "}
                {applied.note ? "journey saved to the journal" : "no note saved"}. The stage,
                history and everything else are untouched.
              </p>
            ) : (
              <div className="mt-2 space-y-2.5">
                <div>
                  <p className={labelClass}>
                    Customer goals · {currentGoals?.trim() ? "already recorded" : "nothing recorded yet"}
                  </p>
                  {currentGoals?.trim() ? (
                    <p className="mt-0.5 whitespace-pre-wrap border-l border-border pl-2 text-[11px] text-muted-foreground">
                      {currentGoals}
                    </p>
                  ) : null}
                  {proposedGoals === "" ? (
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      The SOW gave nothing to add here.
                    </p>
                  ) : (
                    <div className="mt-1">
                      <Checkbox
                        checked={applyGoals}
                        disabled={apply.isPending}
                        onChange={setApplyGoals}
                      >
                        Add these goals from the SOW
                        {currentGoals?.trim() ? " (appended below what is already there)" : ""}
                        <span className="mt-0.5 block whitespace-pre-wrap text-[11px] text-muted-foreground">
                          {proposedGoals}
                        </span>
                      </Checkbox>
                    </div>
                  )}
                </div>

                <div>
                  <p className={labelClass}>
                    Requirements · {requirementCount ?? 0} already recorded
                  </p>
                  {analysis.extraction.requirements.length === 0 ? (
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      The SOW gave nothing to add here.
                    </p>
                  ) : (
                    <div className="mt-1 space-y-1">
                      {analysis.extraction.requirements.map((r, i) => (
                        <Checkbox
                          key={i}
                          checked={Boolean(pickedRequirements[i])}
                          disabled={apply.isPending}
                          onChange={(v) => setPickedRequirements((p) => ({ ...p, [i]: v }))}
                        >
                          {r.text}
                        </Checkbox>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className={labelClass}>
                    Success measures · {successMeasureCount ?? 0} already recorded
                  </p>
                  {analysis.extraction.successMeasures.length === 0 ? (
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      The SOW gave nothing to add here.
                    </p>
                  ) : (
                    <div className="mt-1 space-y-1">
                      {analysis.extraction.successMeasures.map((m, i) => (
                        <Checkbox
                          key={i}
                          checked={Boolean(pickedMeasures[i])}
                          disabled={apply.isPending}
                          onChange={(v) => setPickedMeasures((p) => ({ ...p, [i]: v }))}
                        >
                          {m.text}
                        </Checkbox>
                      ))}
                    </div>
                  )}
                </div>

                <Checkbox checked={applyNote} disabled={apply.isPending} onChange={setApplyNote}>
                  Save the proposed journey as a working note in the journal
                </Checkbox>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-64">
                    <OwnerPicker
                      team={team}
                      group={group}
                      ownerId={authorId}
                      disabled={apply.isPending}
                      personLabel="Applied by"
                      onChange={(next) => {
                        setGroup(next.group);
                        setAuthorId(next.ownerId);
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className={primaryButtonClass}
                    disabled={apply.isPending}
                    onClick={() => apply.mutate()}
                  >
                    {apply.isPending ? "Applying…" : "Apply to implementation"}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={apply.isPending}
                    onClick={() => {
                      // Only this run is dropped; earlier runs stay available.
                      setRuns((prev) => prev.filter((x) => x.id !== activeId));
                      setActiveId(null);
                      apply.reset();
                    }}
                  >
                    Discard this proposal
                  </button>
                  {apply.isError ? (
                    <span className="text-[11px] text-destructive">
                      {apply.error instanceof Error ? apply.error.message : "Could not apply"}
                    </span>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {runs.length > 1 || (runs.length === 1 && !active) ? (
        <div className="border-t border-border/70 pt-2">
          <p className={labelClass}>Earlier analyses</p>
          <ul className="mt-1 space-y-1">
            {runs
              .filter((r) => r.id !== activeId)
              .map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className="text-foreground">{r.sowName ?? "SOW"}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                    {r.at.toISOString().slice(0, 16).replace("T", " ")} UTC
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {r.applied ? "applied" : "not applied"} · {r.analysis.proposedJourney.length}{" "}
                    proposed stages
                  </span>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => {
                      setActiveId(r.id);
                      resetSelections(r.analysis);
                      apply.reset();
                    }}
                  >
                    View this one
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() =>
                      downloadSowAnalysisPdf({
                        analysis: r.analysis,
                        customerName,
                        sowName: r.sowName,
                        analysedAt: r.at,
                        startDate,
                        overrides: adjustments[r.id] ?? {},
                      })
                    }
                  >
                    Download PDF
                  </button>

                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
