import { useState, type ReactNode } from "react";

import { When } from "@/components/when";
import { fmtDate, stageLabel } from "@/lib/hub-format";
import { isExceptionKind, JOURNAL_KIND_LABEL } from "@/lib/journal-input";
import { PRESENTER_PRIVACY_NOTE, type PresenterNote } from "@/lib/presenter-notes";
import { usePresenterNotes, usePresenterSelection } from "@/lib/presenter-notes-query";
import { cn } from "@/lib/utils";

/**
 * Private notes for this presentation. Only the signed-in person sees their own
 * selections, and nothing here is offered to a customer. Selecting a note adds a
 * reference to this view; removing one deletes only that reference.
 */
export function PresenterNotesPanel({ dealId }: { dealId: string }) {
  const query = usePresenterNotes(dealId);
  const { add, remove } = usePresenterSelection(dealId);
  const [picking, setPicking] = useState(false);

  const pendingId = add.isPending
    ? (add.variables ?? null)
    : remove.isPending
      ? (remove.variables ?? null)
      : null;
  const failure = add.error ?? remove.error;

  return (
    <section
      aria-label="Private notes for this presentation"
      className="mx-auto mb-4 max-w-5xl rounded-lg border border-border border-l-4 border-l-primary bg-card p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[14px] font-semibold">Private notes for this presentation</h2>
        <span className="rounded-full bg-muted px-2 py-px text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          Only you see these
        </span>
      </div>
      <p className="mt-1 text-[12px] text-muted-foreground">{PRESENTER_PRIVACY_NOTE}</p>

      {query.isPending ? (
        <p className="mt-3 text-[12px] text-muted-foreground">Loading your private notes…</p>
      ) : query.isError ? (
        <p role="alert" className="mt-3 text-[12px] text-destructive">
          {(query.error as Error).message}
        </p>
      ) : query.data.implementationId === null ? (
        <p className="mt-3 text-[12px] text-muted-foreground">
          This deal has no implementation record yet, so there are no notes to select.
        </p>
      ) : (
        <Selections
          notes={query.data.notes}
          picking={picking}
          onTogglePicking={() => setPicking((p) => !p)}
          pendingId={pendingId}
          onAdd={(id) => add.mutate(id)}
          onRemove={(id) => remove.mutate(id)}
        />
      )}

      {failure ? (
        <p role="alert" className="mt-2 text-[12px] text-destructive">
          {(failure as Error).message}
        </p>
      ) : null}
    </section>
  );
}

function Selections({
  notes,
  picking,
  onTogglePicking,
  pendingId,
  onAdd,
  onRemove,
}: {
  notes: PresenterNote[];
  picking: boolean;
  onTogglePicking: () => void;
  pendingId: string | null;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const selected = notes.filter((n) => n.picked);
  const available = notes.filter((n) => !n.picked);

  return (
    <>
      {selected.length === 0 ? (
        <p className="mt-3 text-[12px] text-muted-foreground">
          No notes selected. Nothing from implementation history appears here until you select it.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {selected.map((n) => (
            <NoteRow key={n.id} note={n}>
              <button
                type="button"
                disabled={pendingId === n.id}
                onClick={() => onRemove(n.id)}
                className="shrink-0 rounded-sm border border-border px-2 py-0.5 text-[11.5px] hover:bg-muted disabled:opacity-50"
              >
                {pendingId === n.id ? "Removing…" : "Remove from my view"}
              </button>
            </NoteRow>
          ))}
        </ul>
      )}

      <button
        type="button"
        aria-expanded={picking}
        onClick={onTogglePicking}
        className="mt-3 rounded-sm border border-border px-2.5 py-1 text-[12px] hover:bg-muted"
      >
        {picking
          ? "Close"
          : selected.length
            ? "Select more internal notes…"
            : "Select internal notes…"}
      </button>

      {picking ? (
        available.length === 0 ? (
          <p className="mt-2 text-[12px] text-muted-foreground">
            {notes.length === 0
              ? "No notes on this implementation yet."
              : "Every note on this implementation is already selected."}
          </p>
        ) : (
          <ul className="mt-2 max-h-96 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {available.map((n) => (
              <NoteRow key={n.id} note={n}>
                <button
                  type="button"
                  disabled={pendingId === n.id}
                  onClick={() => onAdd(n.id)}
                  className="shrink-0 rounded-sm border border-border px-2 py-0.5 text-[11.5px] hover:bg-muted disabled:opacity-50"
                >
                  {pendingId === n.id ? "Adding…" : "Add to my view"}
                </button>
              </NoteRow>
            ))}
          </ul>
        )
      ) : null}
    </>
  );
}

/** One note as the presenter sees it: when, what kind, the words, and who wrote it. */
function NoteRow({ note, children }: { note: PresenterNote; children: ReactNode }) {
  const exception = isExceptionKind(note.kind);
  const isMeeting = note.kind === "customer_meeting";
  return (
    <li className="grid grid-cols-[88px_1fr_auto] items-start gap-3 px-3 py-2.5 text-[12.5px]">
      <div className="text-[11.5px] text-muted-foreground">
        {isMeeting && note.meeting_date ? (
          fmtDate(note.meeting_date)
        ) : (
          <When value={note.created_at} />
        )}
      </div>
      <div className="min-w-0">
        {note.kind !== "note" ? (
          <span
            className={cn(
              "mb-0.5 inline-block rounded-sm px-1 text-[10.5px] font-semibold uppercase tracking-wide",
              exception
                ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                : "bg-muted text-muted-foreground",
            )}
          >
            {JOURNAL_KIND_LABEL[note.kind]}
          </span>
        ) : null}
        <p className="line-clamp-3 whitespace-pre-wrap">{note.note}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {note.participants ? `With ${note.participants} · ` : ""}
          {note.author_name ?? "Author not recorded"} · {stageLabel(note.stage)}
          {" · from implementation history"}
        </p>
      </div>
      {children}
    </li>
  );
}
