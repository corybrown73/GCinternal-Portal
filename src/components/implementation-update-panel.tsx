import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";

import type { TeamOption } from "@/components/owner-picker";
import {
  addIssue,
  addJournalEntry,
  addRisk,
  getTeamOptions,
  setRecordField,
} from "@/lib/hub.functions";
import { ISSUE_SEVERITIES, RISK_SEVERITIES } from "@/lib/delivery-input";
import { cn } from "@/lib/utils";

const SEVERITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

/**
 * Add implementation update — V1.
 *
 * The manual counterpart to Update from customer meeting: the TIS tells the
 * Hub what happened, directly, with no transcript and no AI reading. The
 * note always becomes a journal entry (so it shows up in Implementation
 * History exactly like every other source there); Owner/Risk/Issue are
 * optional, explicitly chosen, and go through the exact same existing
 * writes the transcript flow's apply step already uses — no proposal layer,
 * no second history system.
 *
 * Deliberately excludes Waiting on, Next action and Target date: none of
 * them is a field Current Implementation can safely write from here (see
 * the discovery that scoped this panel) — Waiting on/Next action are
 * derived with no backing column, and this tab's implementations always
 * mirror their target date from the onboarding plan, so writing it here
 * would look applied and change nothing on screen.
 */
export function ImplementationUpdatePanel({ implementationId }: { implementationId: string }) {
  const qc = useQueryClient();
  const team = useQuery<TeamOption[]>({
    queryKey: ["team-options"],
    queryFn: () => getTeamOptions(),
  });

  const addNote = useServerFn(addJournalEntry);
  const setField = useServerFn(setRecordField);
  const createRiskFn = useServerFn(addRisk);
  const createIssueFn = useServerFn(addIssue);

  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  const [showOwner, setShowOwner] = useState(false);
  const [showRisk, setShowRisk] = useState(false);
  const [showIssue, setShowIssue] = useState(false);

  const [ownerId, setOwnerId] = useState("");
  const [riskTitle, setRiskTitle] = useState("");
  const [riskSeverity, setRiskSeverity] = useState<string>("medium");
  const [issueTitle, setIssueTitle] = useState("");
  const [issueSeverity, setIssueSeverity] = useState<string>("medium");

  const [savedAt, setSavedAt] = useState<number | null>(null);
  useEffect(() => {
    if (!savedAt) return;
    const timer = setTimeout(() => setSavedAt(null), 4000);
    return () => clearTimeout(timer);
  }, [savedAt]);

  const reset = () => {
    setNote("");
    setShowOwner(false);
    setShowRisk(false);
    setShowIssue(false);
    setOwnerId("");
    setRiskTitle("");
    setRiskSeverity("medium");
    setIssueTitle("");
    setIssueSeverity("medium");
  };

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = note.trim();
      if (!trimmed) throw new Error("Add a note first.");

      // Always: the note itself, as a durable journal entry. The server
      // resolves the author through the team_members bridge (PR #18) —
      // this never sends a portal_profiles id.
      await addNote({
        data: {
          implementationId,
          note: trimmed,
          authorId: null,
          links: null,
          attachmentUrl: null,
          attachmentName: null,
          kind: "note",
        },
      });

      if (showOwner && ownerId) {
        await setField({ data: { implementationId, field: "owner_id", value: ownerId } });
      }
      if (showRisk && riskTitle.trim()) {
        await createRiskFn({
          data: {
            implementationId,
            title: riskTitle.trim(),
            description: null,
            severity: riskSeverity as (typeof RISK_SEVERITIES)[number],
            likelihood: "medium",
            status: "open",
            ownerId: null,
            impact: null,
            mitigation: null,
            identifiedAt: null,
            resolvedAt: null,
          },
        });
      }
      if (showIssue && issueTitle.trim()) {
        await createIssueFn({
          data: {
            implementationId,
            title: issueTitle.trim(),
            description: null,
            severity: issueSeverity as (typeof ISSUE_SEVERITIES)[number],
            status: "open",
            ownerId: null,
            resolution: null,
            raisedAt: null,
            resolvedAt: null,
          },
        });
      }
    },
    onSuccess: () => {
      reset();
      setSavedAt(Date.now());
      // Owner (part of the same customer360 record as everything else on
      // this tab) and Implementation History (journal/risks/issues) all
      // live outside this component's own state — the same plain
      // invalidation Update from customer meeting's apply step already
      // relies on to refresh them without a reload.
      void qc.invalidateQueries();
    },
  });

  const unresolved =
    note.trim() === "" ||
    (showOwner && !ownerId) ||
    (showRisk && !riskTitle.trim()) ||
    (showIssue && !issueTitle.trim());

  return (
    <section
      className="rounded-md border border-border bg-card"
      aria-label="Add implementation update"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Pencil className="h-3.5 w-3.5 text-primary" />
          Add implementation update
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open ? (
        <div className="space-y-3 border-t border-border px-4 py-3">
          <div className="space-y-1.5">
            <label className="block text-[12px] font-medium text-foreground">
              What should the Hub know?
            </label>
            <textarea
              value={note}
              disabled={save.isPending}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add context, updates, or information that happened outside a customer meeting…"
              rows={4}
              className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
            />
          </div>

          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Does anything else need updating?
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={showOwner}
                  disabled={save.isPending}
                  onChange={(e) => setShowOwner(e.target.checked)}
                />
                Owner
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={showRisk}
                  disabled={save.isPending}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setShowRisk(checked);
                    if (checked && !riskTitle.trim()) setRiskTitle(note.trim());
                  }}
                />
                Risk
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={showIssue}
                  disabled={save.isPending}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setShowIssue(checked);
                    if (checked && !issueTitle.trim()) setIssueTitle(note.trim());
                  }}
                />
                Issue
              </label>
            </div>
          </div>

          {showOwner ? (
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 p-2.5">
              <span className="text-[11px] text-muted-foreground">New owner</span>
              <select
                value={ownerId}
                disabled={save.isPending}
                onChange={(e) => setOwnerId(e.target.value)}
                className="h-6 rounded-sm border border-border bg-background px-1.5 text-[12px] outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Pick who…</option>
                {(team.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {showRisk ? (
            <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground shrink-0">Risk title</span>
                <input
                  type="text"
                  value={riskTitle}
                  disabled={save.isPending}
                  onChange={(e) => setRiskTitle(e.target.value)}
                  className="h-6 flex-1 rounded-sm border border-border bg-background px-1.5 text-[12px] outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground shrink-0">Severity</span>
                <select
                  value={riskSeverity}
                  disabled={save.isPending}
                  onChange={(e) => setRiskSeverity(e.target.value)}
                  className="h-6 rounded-sm border border-border bg-background px-1.5 text-[12px] outline-none focus:ring-1 focus:ring-ring"
                >
                  {RISK_SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {SEVERITY_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          {showIssue ? (
            <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground shrink-0">Issue title</span>
                <input
                  type="text"
                  value={issueTitle}
                  disabled={save.isPending}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  className="h-6 flex-1 rounded-sm border border-border bg-background px-1.5 text-[12px] outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground shrink-0">Severity</span>
                <select
                  value={issueSeverity}
                  disabled={save.isPending}
                  onChange={(e) => setIssueSeverity(e.target.value)}
                  className="h-6 rounded-sm border border-border bg-background px-1.5 text-[12px] outline-none focus:ring-1 focus:ring-ring"
                >
                  {ISSUE_SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {SEVERITY_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={unresolved || save.isPending}
              onClick={() => save.mutate()}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border border-foreground/30 bg-foreground/90 px-2.5 py-1 text-[12px] font-medium text-background hover:bg-foreground disabled:opacity-50",
              )}
            >
              {save.isPending ? "Saving…" : "Save update"}
            </button>
            {savedAt ? (
              <span className="text-[12px] text-status-ontrack-foreground">Saved.</span>
            ) : null}
            {save.isError ? (
              <span className="text-[12px] text-destructive">{(save.error as Error).message}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
