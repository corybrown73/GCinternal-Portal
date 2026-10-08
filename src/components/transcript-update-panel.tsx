import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, Sparkles, Upload } from "lucide-react";

import { fileToBase64, MAX_ATTACHMENT_BYTES, textToBase64 } from "@/lib/attachment-client";
import { uploadAttachment } from "@/lib/attachments.functions";
import { documentUploadType } from "@/lib/document-upload";
import type { TeamOption } from "@/components/owner-picker";
import {
  addEvidence,
  addDecision,
  addIssue,
  addJournalEntry,
  addRisk,
  analyzeTranscriptDocument,
  getTeamOptions,
  setRecordField,
} from "@/lib/hub.functions";
import type { IntakeAnswers } from "@/lib/intake-answers";
import { localIso } from "@/lib/onboarding-timeline";
import { saveIntake } from "@/lib/presale.functions";
import { completedAfterTick } from "@/lib/stage-flow";
import {
  attachmentReferenceFor,
  CONFIDENCE_LABEL,
  isValidIsoDate,
  PROPOSAL_TYPE_LABEL,
  type ProposalType,
  type TranscriptAnalysis,
  type TranscriptProposal,
} from "@/lib/transcript-analysis";
import { cn } from "@/lib/utils";

/**
 * Supplied only when the implementation's actual current canonical stage is
 * Kickoff and the Kickoff task is not done yet (computed by the caller from
 * the same stageFlow() the checklist itself reads — never derived here from
 * a viewed/historical stage, and never from transcript content).
 */
export type KickoffOutcomePrompt = {
  dealId: string;
  intake: IntakeAnswers;
};

type ApplySummary = {
  risks: number;
  issues: number;
  decisions: number;
  targetDate: boolean;
  owner: boolean;
  notes: number;
};

type Run = {
  id: number;
  fileName: string;
  analysis: TranscriptAnalysis;
  applied: ApplySummary | null;
};

/** Case-insensitive best-effort match of a said name to a team member. Never applied without this control being explicitly confirmed. */
function guessOwner(team: TeamOption[], name: string): string {
  const n = name.trim().toLowerCase();
  if (!n) return "";
  const exact = team.find((t) => t.name.toLowerCase() === n);
  if (exact) return exact.id;
  const partial = team.find(
    (t) => t.name.toLowerCase().includes(n) || n.includes(t.name.toLowerCase()),
  );
  return partial?.id ?? "";
}

function attributionFor(quote: string | null): string {
  return quote
    ? `\n\nFrom the meeting transcript: "${quote}"`
    : "\n\n(From the meeting transcript.)";
}

/**
 * Update from customer meeting — V1.
 *
 * Transcript = evidence. Human-confirmed updates = implementation truth. A
 * transcript — pasted directly, or uploaded as a file — is read once by the
 * model, which proposes risks, issues, decisions, a target-date change, an
 * owner change, or a follow-up note — each with a confidence and a
 * supporting quote. Nothing here writes anything until the reviewer ticks
 * the items they want and clicks Apply; applying runs through the Hub's
 * existing risk/issue/decision/record-field/journal write paths, exactly as
 * if entered by hand. The one deliberate exception is Meeting outcome
 * (below): while Kickoff is the actual current stage and not done yet, the
 * TIS can explicitly confirm "Kickoff held" — never inferred from the
 * transcript, never automatic — which sets intake.timeline.completed.kickoff
 * through the exact same saveIntake call the Kickoff checklist tick already
 * uses, so the existing saveIntake → syncDealStage → transitionStage
 * machinery (not this component) performs the actual stage move.
 *
 * Paste and upload are two ways of getting to the same input, not two
 * features: pasted text is base64-encoded into a synthetic .txt file and
 * sent through the exact same upload → evidence → analyse pipeline a real
 * uploaded file uses, so there is exactly one transcript-analysis path.
 */
export function TranscriptUpdatePanel({
  customerId: _customerId,
  implementationId,
  planOwnsTarget = false,
  kickoffOutcome = null,
}: {
  customerId: string;
  implementationId: string;
  /**
   * True for an implementation that came from a deal: its target date is the
   * onboarding plan's Go-Live and the implementation column is only a mirror
   * the next plan sync overwrites. Writing it here would look applied and
   * change nothing, so the proposal is shown but not applied.
   */
  planOwnsTarget?: boolean;
  /** See KickoffOutcomePrompt. Null hides the Meeting outcome control entirely. */
  kickoffOutcome?: KickoffOutcomePrompt | null;
}) {
  const qc = useQueryClient();
  const team = useQuery({ queryKey: ["team-options"], queryFn: () => getTeamOptions() });

  const [kickoffChecked, setKickoffChecked] = useState(false);
  const [kickoffPending, setKickoffPending] = useState(false);
  const [kickoffError, setKickoffError] = useState<string | null>(null);
  const saveIntakeFn = useServerFn(saveIntake);

  /**
   * The exact write the existing Kickoff checklist checkbox makes
   * (OnboardingList's tick, in stage-flow.tsx) — same patch shape, same
   * server fn. This component never calls transitionStage; saveIntake's own
   * server-side syncDealStage does, if the gate is now satisfied. On
   * success the control simply disappears once the refetched stage is no
   * longer Kickoff — there is no local "it moved" state to reset.
   */
  const confirmKickoffHeld = async () => {
    if (!kickoffOutcome || kickoffPending) return;
    const { dealId, intake } = kickoffOutcome;
    const t = intake.timeline;
    const completed = completedAfterTick(intake, t.completed, "kickoff", true, localIso());
    setKickoffChecked(true);
    setKickoffError(null);
    setKickoffPending(true);
    try {
      await saveIntakeFn({
        data: {
          dealId,
          patch: { timeline: { ...t, completed, form_proven_on: t.form_proven_on } },
        },
      });
      // The real transition already happened server-side inside that save
      // (or it didn't, and the rail stays where it is) — refetch the same
      // query Current Implementation reads rather than assuming the result.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["deal", dealId] }),
        qc.invalidateQueries({ queryKey: ["welcome", dealId] }),
      ]);
    } catch (e) {
      setKickoffChecked(false);
      setKickoffError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setKickoffPending(false);
    }
  };

  const upload = useServerFn(uploadAttachment);
  const recordEvidence = useServerFn(addEvidence);
  const analyze = useServerFn(analyzeTranscriptDocument);
  const createRiskFn = useServerFn(addRisk);
  const createIssueFn = useServerFn(addIssue);
  const createDecisionFn = useServerFn(addDecision);
  const setField = useServerFn(setRecordField);
  const addNote = useServerFn(addJournalEntry);

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [resolvedDate, setResolvedDate] = useState<Record<number, string>>({});
  const [resolvedOwner, setResolvedOwner] = useState<Record<number, string>>({});

  const active = runs.find((r) => r.id === activeId) ?? null;

  type RunInput = { kind: "paste"; text: string } | { kind: "file"; file: File };

  const run = useMutation({
    mutationFn: async (input: RunInput) => {
      let fileName: string;
      let contentType: string;
      let dataBase64: string;

      if (input.kind === "paste") {
        const text = input.text.trim();
        if (!text) throw new Error("Paste the transcript text first.");
        fileName = `pasted-transcript-${Date.now()}.txt`;
        contentType = "text/plain";
        dataBase64 = textToBase64(text);
      } else {
        const picked = input.file;
        if (picked.size > MAX_ATTACHMENT_BYTES) {
          throw new Error("That file is too large for this preview — keep it under 4.5 MB.");
        }
        fileName = picked.name;
        contentType = documentUploadType(picked) ?? (picked.type || "application/octet-stream");
        dataBase64 = await fileToBase64(picked);
      }

      const title = `Meeting transcript — ${fileName}`;
      const stored = await upload({
        data: {
          implementationId,
          title,
          kind: "other",
          fileName,
          contentType,
          dataBase64,
        },
      });
      // The transcript is evidence the moment it exists, whether or not
      // anything proposed from it is ever applied. The description carries a
      // durable reference back to the uploaded file (see
      // attachmentReferenceFor) — there is no column for it.
      await recordEvidence({
        data: {
          implementationId,
          type: "communication",
          title,
          description: attachmentReferenceFor(stored.id),
          url: null,
          // The server resolves the actor through the team_members bridge
          // (evidence.uploaded_by does not accept a portal_profiles id).
          uploadedBy: null,
          relatedEntityType: null,
          relatedEntityId: null,
        },
      });
      const result = await analyze({ data: { implementationId, attachmentId: stored.id } });
      return { fileName, analysis: result.analysis };
    },
    onSuccess: ({ fileName, analysis }) => {
      const id = Date.now();
      const sel: Record<number, boolean> = {};
      const dates: Record<number, string> = {};
      const owners: Record<number, string> = {};
      analysis.proposals.forEach((p, i) => {
        if (p.type === "target_date") {
          const ok = isValidIsoDate(p.text);
          dates[i] = ok ? p.text.trim() : "";
          sel[i] = ok && !planOwnsTarget;
        } else if (p.type === "owner") {
          const match = guessOwner(team.data ?? [], p.text);
          owners[i] = match;
          sel[i] = match !== "";
        } else {
          sel[i] = true;
        }
      });
      setSelected(sel);
      setResolvedDate(dates);
      setResolvedOwner(owners);
      setRuns((rs) => [...rs, { id, fileName, analysis, applied: null }]);
      setActiveId(id);
      setFile(null);
      setPastedText("");
    },
  });

  const apply = useMutation({
    mutationFn: async (): Promise<ApplySummary | null> => {
      if (!active) return null;
      const applied: ApplySummary = {
        risks: 0,
        issues: 0,
        decisions: 0,
        targetDate: false,
        owner: false,
        notes: 0,
      };
      for (let i = 0; i < active.analysis.proposals.length; i++) {
        if (!selected[i]) continue;
        const p = active.analysis.proposals[i]!;
        const attribution = attributionFor(p.quote);
        switch (p.type) {
          case "risk":
            await createRiskFn({
              data: {
                implementationId,
                title: p.title,
                description: `${p.text}${attribution}`,
                severity: "medium",
                likelihood: "medium",
                status: "open",
                ownerId: null,
                impact: null,
                mitigation: null,
                identifiedAt: null,
                resolvedAt: null,
              },
            });
            applied.risks += 1;
            break;
          case "issue":
            await createIssueFn({
              data: {
                implementationId,
                title: p.title,
                description: `${p.text}${attribution}`,
                severity: "medium",
                status: "open",
                ownerId: null,
                resolution: null,
                raisedAt: null,
                resolvedAt: null,
              },
            });
            applied.issues += 1;
            break;
          case "decision":
            await createDecisionFn({
              data: {
                implementationId,
                title: p.title,
                description: null,
                rationale: `${p.text}${attribution}`,
                decidedBy: null,
                decisionDate: null,
                status: "active",
              },
            });
            applied.decisions += 1;
            break;
          case "target_date": {
            const date = resolvedDate[i];
            if (planOwnsTarget || !date || !isValidIsoDate(date)) break;
            await setField({
              data: { implementationId, field: "target_launch_date", value: date },
            });
            applied.targetDate = true;
            break;
          }
          case "owner": {
            const ownerId = resolvedOwner[i];
            if (!ownerId) break;
            await setField({ data: { implementationId, field: "owner_id", value: ownerId } });
            applied.owner = true;
            break;
          }
          case "note":
          default:
            await addNote({
              data: {
                implementationId,
                note: `${p.title}\n\n${p.text}${attribution}`,
                // The server resolves the signed-in actor through the
                // team_members bridge (journal_entries.author_id does not
                // accept a portal_profiles id).
                authorId: null,
                links: null,
                attachmentUrl: null,
                attachmentName: null,
                kind: "note",
              },
            });
            applied.notes += 1;
            break;
        }
      }
      return applied;
    },
    onSuccess: (applied) => {
      if (!applied || !active) return;
      setRuns((rs) => rs.map((r) => (r.id === active.id ? { ...r, applied } : r)));
      // Risks, issues, decisions, owner and target date all live outside this
      // component's own state (Details, the header, Overview); a plain
      // invalidation is how every other cross-cutting write on this page
      // already refreshes them (see useStageSync).
      void qc.invalidateQueries();
    },
  });

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <section
      className="rounded-md border border-border bg-card"
      aria-label="Update from customer meeting"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Update from customer meeting
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open ? (
        <div className="space-y-3 border-t border-border px-4 py-3">
          <p className="text-[12px] text-muted-foreground">
            Add the meeting transcript. Nothing is added to the implementation until you review and
            apply it.
          </p>

          {kickoffOutcome ? (
            <div className="space-y-1 rounded-md border border-border bg-muted/30 p-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Meeting outcome
              </div>
              <label className="flex items-start gap-2 text-[12px]">
                <input
                  type="checkbox"
                  className="mt-0.5 h-3 w-3"
                  checked={kickoffChecked}
                  disabled={kickoffPending}
                  onChange={() => void confirmKickoffHeld()}
                />
                <span>
                  <span className="font-medium text-foreground">Kickoff held</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    Completing this will move the implementation to Get It Working.
                  </span>
                </span>
              </label>
              {kickoffPending ? <p className="text-[11px] text-muted-foreground">Saving…</p> : null}
              {kickoffError ? <p className="text-[11px] text-destructive">{kickoffError}</p> : null}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Paste transcript
            </div>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste the customer meeting transcript here…"
              rows={8}
              disabled={run.isPending}
              className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
            />
            <button
              type="button"
              disabled={!pastedText.trim() || run.isPending}
              onClick={() => run.mutate({ kind: "paste", text: pastedText })}
              className="inline-flex items-center gap-1.5 rounded-sm border border-primary/40 bg-primary/10 px-2.5 py-1 text-[12px] font-medium text-primary hover:bg-primary/15 disabled:opacity-50"
            >
              <Sparkles className="h-3 w-3" />
              {run.isPending && run.variables?.kind === "paste"
                ? "Analysing…"
                : "Analyse transcript"}
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" aria-hidden />
            or
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Or upload a transcript file
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept=".txt,.md,.vtt,.srt,.pdf,.docx"
                disabled={run.isPending}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className={cn(
                  "block text-[12px] text-muted-foreground",
                  "file:mr-2 file:rounded-md file:border file:border-input file:bg-background",
                  "file:px-2 file:py-1 file:text-[12px] file:text-foreground",
                  "disabled:opacity-60",
                )}
              />
              <button
                type="button"
                disabled={!file || run.isPending}
                onClick={() => run.mutate({ kind: "file", file: file! })}
                className="inline-flex items-center gap-1.5 rounded-sm border border-primary/40 bg-primary/10 px-2.5 py-1 text-[12px] font-medium text-primary hover:bg-primary/15 disabled:opacity-50"
              >
                <Upload className="h-3 w-3" />
                {run.isPending && run.variables?.kind === "file"
                  ? "Reading…"
                  : "Upload and analyse"}
              </button>
            </div>
          </div>

          {run.isError ? (
            <p className="text-[12px] text-destructive">{(run.error as Error).message}</p>
          ) : null}

          {runs.length > 0 ? (
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex flex-wrap gap-1.5">
                {runs.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setActiveId(r.id)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                      r.id === activeId
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {r.fileName}
                  </button>
                ))}
              </div>
              {active ? (
                <RunReview
                  run={active}
                  planOwnsTarget={planOwnsTarget}
                  team={team.data ?? []}
                  selected={selected}
                  setSelected={setSelected}
                  resolvedDate={resolvedDate}
                  setResolvedDate={setResolvedDate}
                  resolvedOwner={resolvedOwner}
                  setResolvedOwner={setResolvedOwner}
                />
              ) : null}
              {active && !active.applied ? (
                <>
                  <button
                    type="button"
                    disabled={selectedCount === 0 || apply.isPending}
                    onClick={() => apply.mutate()}
                    className="inline-flex items-center gap-1.5 rounded-sm border border-foreground/30 bg-foreground/90 px-2.5 py-1 text-[12px] font-medium text-background hover:bg-foreground disabled:opacity-50"
                  >
                    {apply.isPending
                      ? "Applying…"
                      : `Apply ${selectedCount} selected update${selectedCount === 1 ? "" : "s"}`}
                  </button>
                  {apply.isError ? (
                    <p className="text-[12px] text-destructive">{(apply.error as Error).message}</p>
                  ) : null}
                </>
              ) : active?.applied ? (
                <p className="text-[12px] text-status-ontrack-foreground">
                  Applied: {active.applied.risks} risk{active.applied.risks === 1 ? "" : "s"} ·{" "}
                  {active.applied.issues} issue{active.applied.issues === 1 ? "" : "s"} ·{" "}
                  {active.applied.decisions} decision{active.applied.decisions === 1 ? "" : "s"}
                  {active.applied.targetDate ? " · target date updated" : ""}
                  {active.applied.owner ? " · owner updated" : ""} · {active.applied.notes} note
                  {active.applied.notes === 1 ? "" : "s"}.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function RunReview({
  run,
  planOwnsTarget,
  team,
  selected,
  setSelected,
  resolvedDate,
  setResolvedDate,
  resolvedOwner,
  setResolvedOwner,
}: {
  run: Run;
  planOwnsTarget: boolean;
  team: TeamOption[];
  selected: Record<number, boolean>;
  setSelected: (fn: (prev: Record<number, boolean>) => Record<number, boolean>) => void;
  resolvedDate: Record<number, string>;
  setResolvedDate: (fn: (prev: Record<number, string>) => Record<number, string>) => void;
  resolvedOwner: Record<number, string>;
  setResolvedOwner: (fn: (prev: Record<number, string>) => Record<number, string>) => void;
}) {
  const disabled = Boolean(run.applied);
  return (
    <div className="space-y-3">
      {run.analysis.summary ? (
        <p className="rounded-sm bg-muted/40 px-2.5 py-1.5 text-[12px] text-muted-foreground">
          {run.analysis.summary}
        </p>
      ) : null}
      {run.analysis.proposals.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          Nothing in this transcript proposed an update.
        </p>
      ) : (
        <ul className="space-y-2">
          {run.analysis.proposals.map((p, i) => (
            <ProposalRow
              key={i}
              proposal={p}
              checked={Boolean(selected[i])}
              disabled={disabled}
              planOwnsTarget={planOwnsTarget}
              onToggle={(v) => setSelected((prev) => ({ ...prev, [i]: v }))}
              team={team}
              date={resolvedDate[i] ?? ""}
              onDate={(v) => setResolvedDate((prev) => ({ ...prev, [i]: v }))}
              ownerId={resolvedOwner[i] ?? ""}
              onOwner={(v) => setResolvedOwner((prev) => ({ ...prev, [i]: v }))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TypeTag({ type }: { type: ProposalType }) {
  return (
    <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
      {PROPOSAL_TYPE_LABEL[type]}
    </span>
  );
}

function ProposalRow({
  proposal,
  checked,
  disabled,
  planOwnsTarget,
  onToggle,
  team,
  date,
  onDate,
  ownerId,
  onOwner,
}: {
  proposal: TranscriptProposal;
  checked: boolean;
  disabled: boolean;
  planOwnsTarget: boolean;
  onToggle: (v: boolean) => void;
  team: TeamOption[];
  date: string;
  onDate: (v: string) => void;
  ownerId: string;
  onOwner: (v: string) => void;
}) {
  const needsDate = proposal.type === "target_date";
  const needsOwner = proposal.type === "owner";
  const planOwned = needsDate && planOwnsTarget;
  const unresolved = planOwned || (needsDate && !isValidIsoDate(date)) || (needsOwner && !ownerId);
  return (
    <li className="rounded-md border border-border p-2.5">
      <label className="flex items-start gap-2 text-[12px]">
        <input
          type="checkbox"
          className="mt-0.5 h-3 w-3"
          checked={checked}
          disabled={disabled || unresolved}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <TypeTag type={proposal.type} />
            <span className="font-medium text-foreground">{proposal.title}</span>
            {proposal.confidence !== "stated" ? (
              <span
                className="rounded-sm border border-border px-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground"
                title={CONFIDENCE_LABEL[proposal.confidence]}
              >
                {proposal.confidence}
              </span>
            ) : null}
          </span>
          {!needsDate && !needsOwner ? (
            <span className="mt-1 block text-foreground">{proposal.text}</span>
          ) : null}
          {proposal.quote ? (
            <span className="mt-1 block border-l border-border pl-2 text-[11px] italic text-muted-foreground">
              “{proposal.quote}”
            </span>
          ) : null}
          {planOwned ? (
            <span className="mt-1.5 block text-[11px] text-muted-foreground">
              Heard: {proposal.text}. The target date for this account comes from its onboarding
              plan — move it there, and this page follows.
            </span>
          ) : needsDate ? (
            <span className="mt-1.5 flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">New target date</span>
              <input
                type="date"
                value={date}
                disabled={disabled}
                onChange={(e) => onDate(e.target.value)}
                className="h-6 rounded-sm border border-border bg-background px-1.5 text-[12px] outline-none focus:ring-1 focus:ring-ring"
              />
              {!date ? (
                <span className="text-[11px] text-amber-800 dark:text-amber-300">
                  Could not read a calendar date — enter one to apply this.
                </span>
              ) : null}
            </span>
          ) : null}
          {needsOwner ? (
            <span className="mt-1.5 flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">
                Said: “{proposal.text}” — new owner
              </span>
              <select
                value={ownerId}
                disabled={disabled}
                onChange={(e) => onOwner(e.target.value)}
                className="h-6 rounded-sm border border-border bg-background px-1.5 text-[12px] outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Pick who…</option>
                {team.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </span>
          ) : null}
        </span>
      </label>
    </li>
  );
}
