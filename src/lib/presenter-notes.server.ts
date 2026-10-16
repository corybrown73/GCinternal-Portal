import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { JOURNAL_KINDS, type JournalKind, isExceptionKind } from "./journal-input";
import { callerOrgId } from "./org-scope.server";
import { isSelectableForPresenter, type PresenterNotesView } from "./presenter-notes";

const db = () => supabaseAdmin as any;

const SELECTABLE_KINDS = JOURNAL_KINDS.filter((k) => !isExceptionKind(k));

/**
 * The deal, its current implementation, and the caller's organisation, all read
 * from the database. The deal must sit in the caller's organisation; the
 * implementation is the same one the Presenter Workspace shows for the deal.
 */
async function scopeFor(dealId: string, profileId: string) {
  const orgId = await callerOrgId(profileId);

  const { data: deal, error: dealError } = await db()
    .from("portal_accounts")
    .select("id,org_id")
    .eq("id", dealId)
    .maybeSingle();
  if (dealError) throw new Error(dealError.message);
  if (!deal || String(deal.org_id) !== orgId) {
    throw new Error("Not found: that deal is not in your organisation");
  }

  const { data: impl, error: implError } = await db()
    .from("implementations")
    .select("id,org_id")
    .eq("deal_id", dealId)
    .is("superseded_by_implementation_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (implError) throw new Error(implError.message);

  const implementationId = impl && String(impl.org_id) === orgId ? String(impl.id) : null;
  return { orgId, implementationId };
}

/** The caller's selections on this deal, with every selectable note on its implementation. */
export async function listPresenterNotesFor(
  dealId: string,
  profileId: string,
): Promise<PresenterNotesView> {
  const { orgId, implementationId } = await scopeFor(dealId, profileId);
  if (!implementationId) return { implementationId: null, notes: [] };

  const { data: rows, error } = await db()
    .from("journal_entries")
    .select("id,kind,stage,note,meeting_date,participants,created_at,author_id")
    .eq("implementation_id", implementationId)
    .eq("org_id", orgId)
    .in("kind", SELECTABLE_KINDS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const authorIds = [...new Set((rows ?? []).map((r: any) => r.author_id).filter(Boolean))];
  const names = new Map<string, string>();
  if (authorIds.length) {
    const { data: members } = await db().from("team_members").select("id,name").in("id", authorIds);
    for (const m of members ?? []) names.set(String(m.id), String(m.name));
  }

  const { data: picks, error: pickError } = await db()
    .from("presenter_note_picks")
    .select("journal_entry_id")
    .eq("deal_id", dealId)
    .eq("profile_id", profileId);
  if (pickError) throw new Error(pickError.message);
  const picked = new Set((picks ?? []).map((p: any) => String(p.journal_entry_id)));

  return {
    implementationId,
    notes: (rows ?? []).map((r: any) => ({
      id: String(r.id),
      kind: r.kind as JournalKind,
      stage: String(r.stage),
      note: String(r.note),
      meeting_date: r.meeting_date ?? null,
      participants: r.participants ?? null,
      created_at: String(r.created_at),
      author_name: r.author_id ? (names.get(String(r.author_id)) ?? null) : null,
      picked: picked.has(String(r.id)),
    })),
  };
}

/**
 * Selects a note for the caller's own presenter view. Refuses a note that is not
 * on the deal's implementation, is in another organisation, or is an exception.
 * Selecting a note twice is harmless.
 */
export async function addPresenterNoteFor(
  dealId: string,
  journalEntryId: string,
  profileId: string,
): Promise<{ ok: true }> {
  const { orgId, implementationId } = await scopeFor(dealId, profileId);
  if (!implementationId) {
    throw new Error("This deal has no implementation record yet, so there are no notes to select.");
  }

  const { data: entry, error: entryError } = await db()
    .from("journal_entries")
    .select("id,kind,implementation_id,org_id")
    .eq("id", journalEntryId)
    .maybeSingle();
  if (entryError) throw new Error(entryError.message);
  // One message for "missing" and "elsewhere", so the reply reveals nothing about other notes.
  if (
    !entry ||
    String(entry.implementation_id) !== implementationId ||
    String(entry.org_id) !== orgId
  ) {
    throw new Error("Not found: that note is not on this deal's implementation.");
  }
  if (!isSelectableForPresenter(entry.kind as JournalKind)) {
    throw new Error("Exception records cannot be selected for the presenter view.");
  }

  const { error } = await db().from("presenter_note_picks").insert({
    org_id: orgId,
    profile_id: profileId,
    deal_id: dealId,
    journal_entry_id: journalEntryId,
  });
  // 23505 is "already selected": the same answer as selecting it now.
  if (error && error.code !== "23505") throw new Error(error.message);
  return { ok: true };
}

/**
 * Removes the caller's selection. Deletes only the selection row: the note it
 * pointed at is never touched.
 */
export async function removePresenterNoteFor(
  dealId: string,
  journalEntryId: string,
  profileId: string,
): Promise<{ ok: true }> {
  await scopeFor(dealId, profileId);
  const { error } = await db()
    .from("presenter_note_picks")
    .delete()
    .eq("deal_id", dealId)
    .eq("profile_id", profileId)
    .eq("journal_entry_id", journalEntryId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
