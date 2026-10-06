import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { openAttachment } from "@/lib/attachments.functions";
import type { DealData } from "@/lib/deal-query";
import { HANDOFF_JOURNAL_MARKER } from "@/lib/field-fusion";
import type { Customer360 } from "@/lib/hub-types";
import { JOURNAL_KIND_LABEL } from "@/lib/journal-input";
import { FLOW_STAGES, stampDay } from "@/lib/stage-flow";
import { attachmentIdFromDescription } from "@/lib/transcript-analysis";

/**
 * Implementation History — V1.
 *
 * A compact, human-readable, newest-first feed assembled entirely from data
 * already persisted unconditionally: the deal's own canonical-journey stage
 * moves, journal entries (including the Partner Handoff note snapshot and
 * every transcript-applied note), and risks/issues/decisions/evidence as
 * they were recorded. No new table, no new query — everything here is
 * already fetched by the Customer 360 page and the deal query Current
 * Implementation already reads.
 *
 * Deliberately excludes `implementation_stage_history` (the internal
 * Build/Pilot/Launch lifecycle) and `audit_log` (gated behind
 * `audit_activity_feed`, off by default) — see the verification brief. Stage
 * labels here come from `FLOW_STAGES`, the same canonical journey Current
 * Implementation shows, never the legacy lifecycle's.
 */

type Risk = { id: string; title: string; severity: string; identified_at: string };
type Issue = { id: string; title: string; severity: string; raised_at: string };
type Decision = {
  id: string;
  title: string;
  created_at: string;
  decided_by: string | null;
};
type Evidence = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  created_at: string;
  uploaded_by_name: string | null;
};

type Entry = {
  key: string;
  at: string;
  title: string;
  body: string | null;
  meta: string | null;
  /** The `account_files` row to open, when this entry has a source file. */
  attachmentId: string | null;
};

const DEFAULT_SHOWN = 6;

function stageLabelFor(stage: string): string {
  return FLOW_STAGES.find((s) => s.stage === stage)?.label ?? stage;
}

export function ImplementationHistorySection({
  dealStageHistory,
  journal,
  risks,
  issues,
  decisions,
  evidence,
}: {
  dealStageHistory: DealData["stage_history"];
  journal: Customer360["journal"];
  risks: Customer360["risks"];
  issues: Customer360["issues"];
  decisions: Customer360["decisions"];
  evidence: Customer360["evidence"];
}) {
  const [expanded, setExpanded] = useState(false);

  // Opened through the server so the private bucket stays private: it mints
  // a short-lived signed URL per click, the same mechanism Resources' own
  // attachments list uses — this just offers it from wherever an entry
  // carries a source file, transcripts included, nothing Partner-specific.
  const open = useServerFn(openAttachment);
  const openFile = useMutation({
    mutationFn: (id: string) => open({ data: { id } }),
    onSuccess: (r) => {
      if (r?.url) window.open(r.url, "_blank", "noopener,noreferrer");
    },
  });

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];

    for (const t of dealStageHistory) {
      // The one transition the Field Fusion handoff makes — named for what
      // it is, not logged as a generic field move.
      const isHandoff =
        t.from_stage === "field_fusion_setup" && t.to_stage === "onboarding_kickoff";
      out.push({
        key: `stage-${t.id}`,
        at: t.occurred_at,
        title: isHandoff ? "Partner handoff" : "Stage transition",
        body: isHandoff
          ? `${t.actor_name ?? "Someone"} handed the implementation to the GoCanvas implementation team.`
          : `Moved to ${stageLabelFor(t.to_stage)}`,
        meta: isHandoff ? null : (t.actor_name ?? t.note ?? null),
        attachmentId: null,
      });
    }

    for (const j of journal) {
      const isHandoffNote = j.note.startsWith(HANDOFF_JOURNAL_MARKER);
      out.push({
        key: `journal-${j.id}`,
        at: j.created_at,
        title: isHandoffNote
          ? "Handoff notes"
          : j.kind === "note"
            ? "Implementation note"
            : (JOURNAL_KIND_LABEL[j.kind] ?? "Implementation note"),
        body: isHandoffNote ? j.note.slice(HANDOFF_JOURNAL_MARKER.length).trim() : j.note,
        meta: j.author_name,
        attachmentId: null,
      });
    }

    for (const r of risks as Risk[]) {
      out.push({
        key: `risk-${r.id}`,
        at: r.identified_at,
        title: "Risk raised",
        body: r.title,
        meta: r.severity,
        attachmentId: null,
      });
    }

    for (const i of issues as Issue[]) {
      out.push({
        key: `issue-${i.id}`,
        at: i.raised_at,
        title: "Issue raised",
        body: i.title,
        meta: i.severity,
        attachmentId: null,
      });
    }

    for (const d of decisions as Decision[]) {
      out.push({
        key: `decision-${d.id}`,
        at: d.created_at,
        title: "Decision recorded",
        body: d.title,
        meta: d.decided_by,
        attachmentId: null,
      });
    }

    for (const e of evidence as Evidence[]) {
      out.push({
        key: `evidence-${e.id}`,
        at: e.created_at,
        title: e.type === "communication" ? "Meeting transcript uploaded" : "Evidence added",
        body: e.title,
        meta: e.uploaded_by_name,
        attachmentId: attachmentIdFromDescription(e.description),
      });
    }

    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [dealStageHistory, journal, risks, issues, decisions, evidence]);

  const shown = expanded ? entries : entries.slice(0, DEFAULT_SHOWN);

  return (
    <section
      className="overflow-hidden rounded-md border border-border bg-card"
      aria-label="Implementation history"
    >
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">Implementation history</h2>
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {shown.map((e) => (
              <li key={e.key} className="px-4 py-2.5 text-[12.5px]">
                <p className="font-medium text-foreground">
                  {stampDay(e.at)} · {e.title}
                </p>
                {e.body ? <p className="mt-0.5 text-foreground">{e.body}</p> : null}
                {e.meta ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{e.meta}</p>
                ) : null}
                {e.attachmentId ? (
                  <button
                    type="button"
                    onClick={() => openFile.mutate(e.attachmentId!)}
                    disabled={openFile.isPending}
                    className="mt-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-60"
                  >
                    Open source file
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {entries.length > DEFAULT_SHOWN ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full border-t border-border px-4 py-2 text-[12px] font-medium text-primary hover:bg-muted/40"
            >
              {expanded ? "Show fewer" : `Show all ${entries.length}`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
