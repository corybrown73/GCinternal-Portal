import { HANDOFF_JOURNAL_MARKER } from "@/lib/field-fusion";
import type { Customer360 } from "@/lib/hub-types";
import { JOURNAL_KIND_LABEL } from "@/lib/journal-input";

export type JournalRow = Customer360["journal"][number];

/** The text a row shows: handoff notes lose their marker; everything else is as written. */
export function journalBody(j: JournalRow): { label: string; body: string; handoff: boolean } {
  const handoff = j.note.startsWith(HANDOFF_JOURNAL_MARKER);
  return {
    label: handoff ? "Handoff notes" : JOURNAL_KIND_LABEL[j.kind],
    body: handoff ? j.note.slice(HANDOFF_JOURNAL_MARKER.length).trim() : j.note,
    handoff,
  };
}
