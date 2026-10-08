import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, Loader2, Sparkles, Upload } from "lucide-react";

import { fileToBase64, MAX_ATTACHMENT_BYTES, textToBase64 } from "@/lib/attachment-client";
import { uploadAttachment } from "@/lib/attachments.functions";
import { documentUploadType } from "@/lib/document-upload";
import type { TeamOption } from "@/components/owner-picker";
import {
  addEvidence,
  analyzeTranscriptDocument,
  applyEvidenceProposal,
  dismissEvidenceProposal,
  getTeamOptions,
  pendingTranscriptWork,
} from "@/lib/hub.functions";
import type { IntakeAnswers } from "@/lib/intake-answers";
import { localIso, shortDay } from "@/lib/onboarding-timeline";
import { saveIntake } from "@/lib/presale.functions";
import { handoffQuestion } from "@/lib/sales-handoff";
import { completedAfterTick } from "@/lib/stage-flow";
import {
  attachmentReferenceFor,
  CONFIDENCE_LABEL,
  isValidIsoDate,
  PROPOSAL_TYPE_LABEL,
  proposalDefaultSelected,
  type EvidenceProposalRow,
  type ProposalType,
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

/**
 * The roster id a row starts on: the reading's pick (already checked against
 * the roster when it was kept), else — for an owner change only — the name
 * it heard. A risk or issue is never matched on its description: an owner
 * the reviewer did not see is never written.
 */
function initialOwner(team: TeamOption[], p: EvidenceProposalRow): string {
  if (p.owner_team_member_id) return p.owner_team_member_id;
  if (p.type !== "owner") return "";
  return guessOwner(team, p.owner_name ?? p.text);
}

/** Whether the row shows the owner picker — and so whether Apply sends an owner at all. */
function showsOwner(p: EvidenceProposalRow): boolean {
  if (p.type === "owner") return true;
  return (p.type === "risk" || p.type === "issue") && Boolean(p.owner_team_member_id);
}

/** What one Apply click did, row by row; a failed row stays ticked with its reason. */
type ApplyResult = { applied: number; failed: Array<{ id: string; message: string }> };

/** Rows from one upload sit together, newest upload first. */
function groupBySource(rows: EvidenceProposalRow[]): Array<{
  key: string;
  title: string;
  at: string | null;
  rows: EvidenceProposalRow[];
}> {
  const groups = new Map<
    string,
    { title: string; at: string | null; rows: EvidenceProposalRow[] }
  >();
  for (const r of rows) {
    const key = r.evidence_id ?? r.attachment_id ?? "unknown";
    const g = groups.get(key) ?? {
      title: r.source_title ?? "Meeting transcript",
      at: r.source_at ?? r.created_at ?? null,
      rows: [],
    };
    g.rows.push(r);
    groups.set(key, g);
  }
  return [...groups.entries()].map(([key, g]) => ({ key, ...g }));
}

function dayOf(iso: string | null): string | null {
  if (!iso) return null;
  const day = iso.slice(0, 10);
  return isValidIsoDate(day) ? shortDay(day) : null;
}

/**
 * Update from customer meeting — V2.
 *
 * Transcript = evidence. Human-confirmed updates = implementation truth. A
 * transcript — pasted directly, or uploaded as a file — is read once by the
 * model against what the Hub knows about the implementation, and every
 * proposal it makes is kept in `evidence_proposals` until a person applies
 * or dismisses it: a reload keeps them, a colleague can review them, Home
 * counts them. The transcript is read in the background — pasted or
 * uploaded, it is stored as a file first — and this panel polls until the
 * reading lands; only when nothing could be queued (the flag off, no key)
 * is it read while you wait.
 * Applying runs through the Hub's existing risk/issue/decision/record-field/
 * journal/plan/handoff write paths on the server, exactly as if entered by
 * hand. The one deliberate exception is Meeting outcome (below): while
 * Kickoff is the actual current stage and not done yet, the TIS can
 * explicitly confirm "Kickoff held" — never inferred from the transcript,
 * never automatic — which sets intake.timeline.completed.kickoff through the
 * exact same saveIntake call the Kickoff checklist tick already uses, so the
 * existing saveIntake → syncDealStage → transitionStage machinery (not this
 * component) performs the actual stage move.
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
   * onboarding plan's Go-Live. A proposed date then moves the plan's live
   * date (the server routes it by the deal link); otherwise it sets the
   * record's target column.
   */
  planOwnsTarget?: boolean;
  /** See KickoffOutcomePrompt. Null hides the Meeting outcome control entirely. */
  kickoffOutcome?: KickoffOutcomePrompt | null;
}) {
  const qc = useQueryClient();
  const team = useQuery({ queryKey: ["team-options"], queryFn: () => getTeamOptions() });
  const workFn = useServerFn(pendingTranscriptWork);
  const work = useQuery({
    queryKey: ["transcript-work", implementationId],
    queryFn: () => workFn({ data: { implementationId } }),
    // While a reading runs in the background, ask again every five seconds.
    refetchInterval: (q) =>
      (q.state.data?.jobs ?? []).some((j) => j.status === "queued" || j.status === "running")
        ? 5000
        : false,
  });

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
  const applyFn = useServerFn(applyEvidenceProposal);
  const dismissFn = useServerFn(dismissEvidenceProposal);

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [lastSummary, setLastSummary] = useState<string | null>(null);
  const [showDecided, setShowDecided] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [resolvedDate, setResolvedDate] = useState<Record<string, string>>({});
  const [resolvedOwner, setResolvedOwner] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const proposals = useMemo(() => work.data?.proposals ?? [], [work.data]);
  const pending = useMemo(() => proposals.filter((p) => p.status === "pending"), [proposals]);
  const decided = useMemo(() => proposals.filter((p) => p.status !== "pending"), [proposals]);
  const jobs = work.data?.jobs ?? [];
  const running = jobs.filter((j) => j.status === "queued" || j.status === "running");
  const finished = jobs.filter((j) => j.status === "done" || j.status === "failed");
  const roster = useMemo(() => team.data ?? [], [team.data]);
  // Rows are seeded once the roster is known (or known missing): an owner
  // row seeded against an empty roster would lose its name for good.
  const rosterKnown = team.isFetched;

  // A row that just arrived starts ticked or unticked by its own shape; a
  // row the reviewer already touched keeps their choice. Untouched state is
  // handed back as is, so a poll that brought nothing new renders nothing.
  useEffect(() => {
    if (!rosterKnown) return;
    const fresh = (prev: Record<string, unknown>) => pending.filter((p) => !(p.id in prev));
    setResolvedOwner((prev) => {
      const add = fresh(prev);
      if (!add.length) return prev;
      const next = { ...prev };
      for (const p of add) next[p.id] = initialOwner(roster, p);
      return next;
    });
    setResolvedDate((prev) => {
      const add = fresh(prev);
      if (!add.length) return prev;
      const next = { ...prev };
      for (const p of add) next[p.id] = p.proposed_date ?? "";
      return next;
    });
    setSelected((prev) => {
      const add = fresh(prev);
      if (!add.length) return prev;
      const next = { ...prev };
      for (const p of add) next[p.id] = proposalDefaultSelected(p, initialOwner(roster, p));
      return next;
    });
  }, [pending, roster, rosterKnown]);

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
      // attachmentReferenceFor) — there is no column for it. Recording it
      // queues the background reading; the poll above picks it up.
      const recorded = await recordEvidence({
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
      if (recorded.analysis_queued) return { summary: null as string | null };
      // Nothing could be queued (the flag is off, or no key): read it now,
      // the way the panel always did, and say so if the file is not a
      // transcript.
      const result = await analyze({ data: { implementationId, attachmentId: stored.id } });
      if (!result.analysis.readable) {
        throw new Error(
          result.analysis.problem ?? "That file could not be read as a meeting transcript.",
        );
      }
      return { summary: result.analysis.summary || null };
    },
    onSuccess: ({ summary }) => {
      setLastSummary(summary);
      setFile(null);
      setPastedText("");
      void qc.invalidateQueries({ queryKey: ["transcript-work", implementationId] });
    },
  });

  const apply = useMutation({
    mutationFn: async (): Promise<ApplyResult> => {
      const out: ApplyResult = { applied: 0, failed: [] };
      // Every ticked row gets its turn: a row refused on purpose (a question
      // a person answered meanwhile, a row a colleague just decided) stops
      // nothing but itself.
      for (const p of pending) {
        if (!selected[p.id]) continue;
        try {
          await applyFn({
            data: {
              id: p.id,
              // Only an owner the reviewer could see is sent; a row with no
              // picker writes none, whatever the reading carried.
              ownerTeamMemberId: showsOwner(p) ? resolvedOwner[p.id] || null : null,
              proposedDate: resolvedDate[p.id] || null,
            },
          });
          out.applied += 1;
        } catch (e) {
          out.failed.push({
            id: p.id,
            message: e instanceof Error ? e.message : "Could not apply this update.",
          });
        }
      }
      return out;
    },
    onSuccess: (out) => {
      setRowErrors(Object.fromEntries(out.failed.map((f) => [f.id, f.message])));
    },
    onSettled: () => {
      // Risks, issues, decisions, owner and target date all live outside this
      // component's own state (Details, the header, Overview); a plain
      // invalidation is how every other cross-cutting write on this page
      // already refreshes them (see useStageSync).
      void qc.invalidateQueries();
    },
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => dismissFn({ data: { id } }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["transcript-work", implementationId] });
    },
  });

  const selectedCount = pending.filter((p) => selected[p.id]).length;
  const busy = run.isPending || apply.isPending;

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
          {pending.length ? (
            <span className="ml-1 rounded-full border border-primary/40 bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
              {pending.length} to review
            </span>
          ) : null}
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
                  ? "Uploading…"
                  : "Upload and analyse"}
              </button>
            </div>
          </div>

          {run.isError ? (
            <p className="text-[12px] text-destructive">{(run.error as Error).message}</p>
          ) : null}

          {running.length ? (
            <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Reading the transcript… proposals appear here when it is done.
            </p>
          ) : null}

          {finished.map((j) => (
            <p
              key={j.attachment_id}
              className={cn(
                "text-[12px]",
                j.problem ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {j.problem
                ? `Could not read ${j.title ?? "the transcript"}: ${j.problem} Upload a different file, or paste the text.`
                : `Nothing in ${j.title ?? "the transcript"} proposed an update.`}
            </p>
          ))}

          {lastSummary ? (
            <p className="rounded-sm bg-muted/40 px-2.5 py-1.5 text-[12px] text-muted-foreground">
              {lastSummary}
            </p>
          ) : null}

          {work.isError ? (
            <p className="text-[12px] text-destructive">{(work.error as Error).message}</p>
          ) : null}

          {pending.length > 0 ? (
            <div className="space-y-3 border-t border-border pt-3">
              {groupBySource(pending).map((g) => (
                <div key={g.key} className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {g.title}
                    {dayOf(g.at) ? ` · ${dayOf(g.at)}` : ""}
                  </div>
                  <ul className="space-y-2">
                    {g.rows.map((p) => (
                      <ProposalRow
                        key={p.id}
                        proposal={p}
                        checked={Boolean(selected[p.id])}
                        disabled={busy}
                        planOwnsTarget={planOwnsTarget}
                        onToggle={(v) => setSelected((prev) => ({ ...prev, [p.id]: v }))}
                        team={roster}
                        date={resolvedDate[p.id] ?? ""}
                        onDate={(v) => setResolvedDate((prev) => ({ ...prev, [p.id]: v }))}
                        ownerId={resolvedOwner[p.id] ?? ""}
                        onOwner={(v) => setResolvedOwner((prev) => ({ ...prev, [p.id]: v }))}
                        error={rowErrors[p.id] ?? null}
                        onDismiss={() => dismiss.mutate(p.id)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
              <button
                type="button"
                disabled={selectedCount === 0 || busy}
                onClick={() => apply.mutate()}
                className="inline-flex items-center gap-1.5 rounded-sm border border-foreground/30 bg-foreground/90 px-2.5 py-1 text-[12px] font-medium text-background hover:bg-foreground disabled:opacity-50"
              >
                {apply.isPending
                  ? "Applying…"
                  : `Apply ${selectedCount} selected update${selectedCount === 1 ? "" : "s"}`}
              </button>
              {apply.data && apply.data.failed.length ? (
                <p className="text-[12px] text-destructive">
                  {apply.data.applied} applied; {apply.data.failed.length} could not be — each says
                  why above and stays ticked.
                </p>
              ) : null}
              {apply.isError ? (
                <p className="text-[12px] text-destructive">{(apply.error as Error).message}</p>
              ) : null}
              {dismiss.isError ? (
                <p className="text-[12px] text-destructive">{(dismiss.error as Error).message}</p>
              ) : null}
            </div>
          ) : work.data && !jobs.length && decided.length === 0 && lastSummary ? (
            <p className="text-[12px] text-muted-foreground">
              Nothing in this transcript proposed an update.
            </p>
          ) : null}

          {decided.length > 0 ? (
            <div className="border-t border-border pt-2">
              <button
                type="button"
                onClick={() => setShowDecided((v) => !v)}
                className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
              >
                {showDecided ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Decided ({decided.length})
              </button>
              {showDecided ? (
                <div className="mt-2 space-y-3">
                  {groupBySource(decided).map((g) => (
                    <div key={g.key} className="space-y-1.5">
                      <div className="text-[11px] text-muted-foreground">
                        {g.title}
                        {dayOf(g.at) ? ` · ${dayOf(g.at)}` : ""}
                      </div>
                      <ul className="space-y-1.5">
                        {g.rows.map((p) => (
                          <DecidedRow key={p.id} proposal={p} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function TypeTag({ type }: { type: ProposalType }) {
  return (
    <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
      {PROPOSAL_TYPE_LABEL[type]}
    </span>
  );
}

function LevelPill({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <span
      className={cn(
        "rounded-sm border px-1 font-mono text-[10px] uppercase tracking-[0.06em]",
        value === "high"
          ? "border-destructive/40 text-destructive"
          : value === "low"
            ? "border-border text-muted-foreground"
            : "border-amber-500/40 text-amber-800 dark:text-amber-300",
      )}
      title={`${label}: ${value}`}
    >
      {label} {value}
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
  error,
  onDismiss,
}: {
  proposal: EvidenceProposalRow;
  checked: boolean;
  disabled: boolean;
  planOwnsTarget: boolean;
  onToggle: (v: boolean) => void;
  team: TeamOption[];
  date: string;
  onDate: (v: string) => void;
  ownerId: string;
  onOwner: (v: string) => void;
  error: string | null;
  onDismiss: () => void;
}) {
  const needsDate = proposal.type === "target_date";
  const needsOwner = proposal.type === "owner";
  // A risk or issue the reading assigned to someone shows who, so the
  // reviewer can clear it; one it did not assign writes no owner.
  const picksOwner = showsOwner(proposal);
  const isSuggestion = proposal.type === "intake_suggestion";
  const question =
    isSuggestion && proposal.intake_key ? handoffQuestion(proposal.intake_key) : null;
  const unresolved =
    (needsDate && !isValidIsoDate(date)) || (needsOwner && !ownerId) || (isSuggestion && !question);
  return (
    <li className="rounded-md border border-border p-2.5">
      <div className="flex items-start gap-2 text-[12px]">
        <input
          type="checkbox"
          className="mt-0.5 h-3 w-3"
          checked={checked}
          disabled={disabled || unresolved}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={`Apply: ${proposal.title}`}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <TypeTag type={proposal.type} />
            <span className="font-medium text-foreground">
              {isSuggestion
                ? `Suggested answer for ${question?.label ?? proposal.intake_key ?? "a handoff question"}`
                : proposal.title}
            </span>
            {proposal.confidence !== "stated" ? (
              <span
                className="rounded-sm border border-border px-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground"
                title={CONFIDENCE_LABEL[proposal.confidence]}
              >
                {proposal.confidence}
              </span>
            ) : null}
            <LevelPill label="severity" value={proposal.severity} />
            <LevelPill label="likelihood" value={proposal.likelihood} />
          </span>
          {!needsOwner ? <span className="mt-1 block text-foreground">{proposal.text}</span> : null}
          {proposal.quote ? (
            <span className="mt-1 block border-l border-border pl-2 text-[11px] italic text-muted-foreground">
              “{proposal.quote}”
            </span>
          ) : null}
          {proposal.duplicate_of_id ? (
            <span className="mt-1 block text-[11px] text-amber-800 dark:text-amber-300">
              Looks like {proposal.duplicate_title ?? "a record already on the implementation"} —
              unticked so it is not added twice.
            </span>
          ) : null}
          {needsDate ? (
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">
                {planOwnsTarget ? "Moves the plan's live date to" : "New target date"}
              </span>
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
          {picksOwner ? (
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">
                {needsOwner
                  ? `Said: “${proposal.owner_name ?? proposal.text}” — new owner`
                  : "Owner"}
              </span>
              <select
                value={ownerId}
                disabled={disabled}
                onChange={(e) => onOwner(e.target.value)}
                className="h-6 rounded-sm border border-border bg-background px-1.5 text-[12px] outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">{needsOwner ? "Pick who…" : "Nobody"}</option>
                {team.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </span>
          ) : null}
          {proposal.type === "decision" && proposal.proposed_date ? (
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Decided {shortDay(proposal.proposed_date)}
            </span>
          ) : null}
          {isSuggestion ? (
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Lands on the handoff as the implementation team's answer, only if the question is
              blank or AI-filled.
            </span>
          ) : null}
          {error ? <span className="mt-1 block text-[11px] text-destructive">{error}</span> : null}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={onDismiss}
          className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </li>
  );
}

function DecidedRow({ proposal }: { proposal: EvidenceProposalRow }) {
  const applied = proposal.status === "applied";
  return (
    <li className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
      <span
        className={cn(
          "rounded-sm border px-1 font-mono text-[10px] uppercase tracking-[0.06em]",
          applied ? "border-status-ontrack-foreground/40 text-status-ontrack-foreground" : "",
        )}
      >
        {applied ? "Applied" : "Dismissed"}
      </span>
      <TypeTag type={proposal.type} />
      <span className="text-foreground">{proposal.title}</span>
      {dayOf(proposal.decided_at) ? <span>· {dayOf(proposal.decided_at)}</span> : null}
    </li>
  );
}
