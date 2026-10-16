import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { CustomerMeetingForm } from "@/components/customer-meeting-form";
import { JournalHistory } from "@/components/journal-history";
import { When } from "@/components/when";
import { fmtDate, stageLabel } from "@/lib/hub-format";
import { isExceptionKind } from "@/lib/journal-input";
import { journalBody, type JournalRow } from "@/lib/journal-view";
import {
  useNotesFeatures,
  usePresenterNotes,
  usePresenterSelection,
} from "@/lib/presenter-notes-query";
import { cn } from "@/lib/utils";

const CARD = "rounded-lg border border-border bg-card";
const RECENT_COUNT = 3;

type Mode = "summary" | "meeting" | "history";

/**
 * Internal notes, directly below Act now. The three things a person does with
 * the journal (add an update, record a customer meeting, look back), the last
 * three entries, and a link to the full history. It reuses the implementation's
 * journal rows and writes nothing except through its own two forms.
 *
 * The transcript analysis flow is not inside this card. It stays where it was,
 * reached by the labelled link here.
 */
export function InternalNotesCard({
  dealId,
  implementationId,
  journal,
  onAddUpdate,
  onAnalyseTranscript,
}: {
  dealId: string;
  implementationId: string | null;
  journal: JournalRow[];
  onAddUpdate: () => void;
  onAnalyseTranscript: () => void;
}) {
  const [mode, setMode] = useState<Mode>("summary");
  const recent = journal.slice(0, RECENT_COUNT);
  const features = useNotesFeatures();

  return (
    <section className={cn(CARD, "px-4 py-3.5")} aria-label="Internal notes">
      <h2 className="text-[16px] font-semibold">Internal notes</h2>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        Internal only. Visible to authorised internal users.
      </p>

      {mode === "summary" ? (
        <>
          <div className="mt-2.5 grid gap-0.5">
            <ActionRow label="Add internal update" onClick={onAddUpdate} />
            {features.customerMeetings ? (
              <ActionRow
                label="Record customer meeting"
                disabled={!implementationId}
                onClick={() => setMode("meeting")}
              />
            ) : null}
            <ActionRow label="Review previous updates" onClick={() => setMode("history")} />
          </div>

          <p className="mt-2 px-2.5 text-[12px] text-muted-foreground">
            Have a transcript?{" "}
            <button
              type="button"
              onClick={onAnalyseTranscript}
              className="font-medium text-primary hover:underline"
            >
              Analyse meeting transcript →
            </button>{" "}
            <span>It proposes updates for you to review.</span>
          </p>

          <p className="mt-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recent
          </p>
          {recent.length === 0 ? (
            <p className="mt-1 px-0.5 text-[12px] text-muted-foreground">
              No updates recorded yet.
            </p>
          ) : (
            <ul className="mt-1 divide-y divide-border">
              {recent.map((j) => (
                <RecentRow key={j.id} entry={j} />
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => setMode("history")}
            className="mt-2 px-0.5 text-[12px] font-medium text-primary hover:underline"
          >
            View full history ({journal.length}) →
          </button>
        </>
      ) : null}

      {mode === "meeting" && implementationId ? (
        <CustomerMeetingForm
          implementationId={implementationId}
          onSaved={() => setMode("summary")}
          onCancel={() => setMode("summary")}
          onAnalyseTranscript={onAnalyseTranscript}
        />
      ) : null}

      {mode === "history" ? (
        <>
          <button
            type="button"
            onClick={() => setMode("summary")}
            className="mt-2.5 text-[12px] font-medium text-primary hover:underline"
          >
            ← Back to internal notes
          </button>
          {features.presenterSelections ? (
            <HistoryWithSelection
              dealId={dealId}
              implementationId={implementationId}
              journal={journal}
              meetingsAvailable={features.customerMeetings}
            />
          ) : (
            <JournalHistory
              journal={journal}
              presenter={null}
              meetingsAvailable={features.customerMeetings}
            />
          )}
        </>
      ) : null}
    </section>
  );
}

function ActionRow({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-muted disabled:opacity-50"
    >
      <span>{label}</span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

function RecentRow({ entry }: { entry: JournalRow }) {
  const { label, body } = journalBody(entry);
  const exception = isExceptionKind(entry.kind);
  return (
    <li className="grid grid-cols-[88px_1fr] gap-2 py-2 text-[12px]">
      <div className="text-[11.5px] text-muted-foreground">
        {entry.kind === "customer_meeting" && entry.meeting_date ? (
          fmtDate(entry.meeting_date)
        ) : (
          <When value={entry.created_at} />
        )}
      </div>
      <div className="min-w-0">
        <span
          className={cn(
            "inline-block rounded-sm px-1 text-[10.5px] font-semibold uppercase tracking-wide",
            exception
              ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
              : "bg-muted text-muted-foreground",
          )}
        >
          {label}
        </span>
        <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap">{body}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {entry.author_name ?? "Author not recorded"} · {stageLabel(entry.stage)}
        </p>
      </div>
    </li>
  );
}

/**
 * The full history, with this person's presenter selections when the deal's own
 * implementation is the one on screen. Selections belong to the signed-in person
 * and are never offered for another implementation.
 */
function HistoryWithSelection({
  dealId,
  implementationId,
  journal,
  meetingsAvailable,
}: {
  dealId: string;
  implementationId: string | null;
  journal: JournalRow[];
  meetingsAvailable: boolean;
}) {
  const presenter = usePresenterNotes(dealId);
  const { add, remove } = usePresenterSelection(dealId);
  const sameImplementation =
    presenter.data !== undefined &&
    implementationId !== null &&
    presenter.data.implementationId === implementationId;

  const pickedIds = new Set((presenter.data?.notes ?? []).filter((n) => n.picked).map((n) => n.id));
  const pendingId = add.isPending
    ? (add.variables ?? null)
    : remove.isPending
      ? (remove.variables ?? null)
      : null;

  return (
    <>
      <JournalHistory
        journal={journal}
        meetingsAvailable={meetingsAvailable}
        presenter={
          sameImplementation
            ? {
                pickedIds,
                pendingId,
                onToggle: (id, picked) => (picked ? add.mutate(id) : remove.mutate(id)),
              }
            : null
        }
      />
      {add.isError || remove.isError ? (
        <p role="alert" className="mt-2 text-[12px] text-destructive">
          {((add.error ?? remove.error) as Error).message}
        </p>
      ) : null}
    </>
  );
}
