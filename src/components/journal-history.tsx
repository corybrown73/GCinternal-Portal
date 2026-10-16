import { useMemo, useState } from "react";

import { When } from "@/components/when";
import { fmtDate, stageLabel } from "@/lib/hub-format";
import { isExceptionKind } from "@/lib/journal-input";
import { isSelectableForPresenter } from "@/lib/presenter-notes";
import { journalBody, type JournalRow } from "@/lib/journal-view";
import { cn } from "@/lib/utils";

type HistoryFilter = "all" | "notes" | "meetings" | "exceptions";

function matchesFilter(j: JournalRow, filter: HistoryFilter): boolean {
  if (filter === "all") return true;
  if (filter === "notes") return j.kind === "note";
  if (filter === "meetings") return j.kind === "customer_meeting";
  return isExceptionKind(j.kind);
}

function matchesSearch(j: JournalRow, query: string): boolean {
  if (!query) return true;
  const { label, body } = journalBody(j);
  const haystack = [
    body,
    label,
    j.author_name ?? "",
    j.participants ?? "",
    stageLabel(j.stage),
    j.meeting_date ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

/** The control that selects a note for this person's presenter view. */
export type PresenterToggle = {
  pickedIds: ReadonlySet<string>;
  pendingId: string | null;
  onToggle: (journalEntryId: string, picked: boolean) => void;
};

const FILTERS: Array<{ key: HistoryFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "notes", label: "Notes" },
  { key: "meetings", label: "Customer meetings" },
  { key: "exceptions", label: "Exceptions" },
];

/**
 * The full journal for one implementation, searchable and filterable. It reads
 * the rows the record already carries; it writes nothing. Presenter selection is
 * offered only when a toggle is passed, which the card does only for the deal's
 * own implementation.
 */
export function JournalHistory({
  journal,
  presenter,
  meetingsAvailable = true,
}: {
  journal: JournalRow[];
  presenter: PresenterToggle | null;
  /** False when this database has not received the customer meeting migration. */
  meetingsAvailable?: boolean;
}) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  const counts = useMemo(
    () => ({
      all: journal.length,
      notes: journal.filter((j) => matchesFilter(j, "notes")).length,
      meetings: journal.filter((j) => matchesFilter(j, "meetings")).length,
      exceptions: journal.filter((j) => matchesFilter(j, "exceptions")).length,
    }),
    [journal],
  );

  const rows = journal.filter((j) => matchesFilter(j, filter) && matchesSearch(j, query));

  return (
    <div className="mt-3">
      <label className="block">
        <span className="sr-only">Search updates</span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes, meetings and people"
          className="w-full rounded-sm border border-border bg-background px-2.5 py-1.5 text-[13px]"
        />
      </label>

      <div role="group" aria-label="Filter updates" className="mt-2 flex flex-wrap gap-1.5">
        {FILTERS.filter((f) => meetingsAvailable || f.key !== "meetings").map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[12px]",
              filter === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label} ({counts[f.key]})
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-[12px] text-muted-foreground">
          {journal.length === 0
            ? "No updates recorded on this implementation yet."
            : "Nothing matches. Try another filter or word."}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {rows.map((j) => {
            const { label, body, handoff } = journalBody(j);
            const selectable = isSelectableForPresenter(j.kind);
            const picked = presenter?.pickedIds.has(j.id) ?? false;
            const pending = presenter?.pendingId === j.id;
            return (
              <li key={j.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {j.kind === "customer_meeting" && j.meeting_date ? (
                      <>Meeting {fmtDate(j.meeting_date)}</>
                    ) : (
                      <When value={j.created_at} />
                    )}
                  </span>
                  {j.kind !== "note" || handoff ? (
                    <span
                      className={cn(
                        "rounded-sm px-1 font-medium",
                        isExceptionKind(j.kind)
                          ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {label}
                    </span>
                  ) : null}
                  <span>
                    · {stageLabel(j.stage)} · {j.author_name ?? "Author not recorded"}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[13px]">{body}</p>
                {j.participants ? (
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    With: {j.participants}
                  </p>
                ) : null}
                {presenter ? (
                  <div className="mt-1.5">
                    {selectable ? (
                      <button
                        type="button"
                        disabled={pending}
                        aria-pressed={picked}
                        onClick={() => presenter.onToggle(j.id, !picked)}
                        className={cn(
                          "rounded-sm border px-2 py-0.5 text-[11.5px] disabled:opacity-50",
                          picked
                            ? "border-emerald-600/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                            : "border-border hover:bg-muted",
                        )}
                      >
                        {pending
                          ? "Saving…"
                          : picked
                            ? "✓ In my presenter view"
                            : "Add to my presenter view"}
                      </button>
                    ) : (
                      <span className="text-[11.5px] text-muted-foreground">
                        {isExceptionKind(j.kind)
                          ? "Exception records are not selectable for the presenter view"
                          : "Not selectable"}
                      </span>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
