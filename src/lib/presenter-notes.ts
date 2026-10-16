import { isExceptionKind, type JournalKind } from "./journal-input";

/**
 * Presenter-only notes. Client-safe: the rules and the wording live here, and
 * the database work lives in presenter-notes.server.ts.
 *
 * A selection is a personal reference to an existing implementation note. It
 * never copies the note, and it never changes what any other person or any
 * customer-facing page can see.
 */

export const PRESENTER_PRIVACY_NOTE =
  "Private to your presenter view. These notes won't appear in the customer kickoff deck, dashboard or shared links. Other authorised internal users may still access the original implementation notes.";

/** Exception records are never selectable for the Presenter Workspace. */
export function isSelectableForPresenter(kind: JournalKind): boolean {
  return !isExceptionKind(kind);
}

export type PresenterNote = {
  id: string;
  kind: JournalKind;
  stage: string;
  note: string;
  meeting_date: string | null;
  participants: string | null;
  created_at: string;
  author_name: string | null;
  /** True when this signed-in person has selected the note. */
  picked: boolean;
};

export type PresenterNotesView = {
  /** Null when the deal has no implementation record yet. */
  implementationId: string | null;
  /** Every note on the implementation that can be selected, newest first. */
  notes: PresenterNote[];
};
