import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readIntake, type IntakeAnswers } from "./intake-answers";
import { agreeImplementationFocus, proposeImplementationFocus } from "./implementation-focus";

const db = () => supabaseAdmin as any;

/**
 * A person presses "Generate proposed focus" or "Refresh proposal":
 * recompute the candidate list from current SOW/intake/handoff truth and
 * save it. A no-op once Focus is agreed (proposeImplementationFocus
 * returns null) — the caller gets the current, untouched record back.
 * Otherwise this REPLACES whatever unvalidated proposal is there now,
 * including any manual edits — which is why it is a deliberate, named
 * action a person presses, never something that runs on page load or
 * silently because a source changed underneath their edits.
 */
export async function generateImplementationFocus(
  userId: string,
  dealId: string,
): Promise<IntakeAnswers> {
  const { requireSalesEditor } = await import("./presale.server");
  await requireSalesEditor(userId);
  const { data: row } = await db()
    .from("portal_accounts")
    .select("intake")
    .eq("id", dealId)
    .maybeSingle();
  if (!row) throw new Error("Deal not found");
  const current = readIntake(row.intake);
  const proposed = proposeImplementationFocus(current);
  if (proposed === null) return current;
  const { saveDealIntake } = await import("./presale.server");
  return saveDealIntake(userId, dealId, {
    implementation_focus: { items: proposed, validated_at: null, validated_by: null },
  });
}

/**
 * "Confirm implementation focus": the TIS reviewed the (possibly
 * hand-edited) proposed list with the customer and is saying this is what
 * the implementation is focusing on. This is not contractual or SOW
 * approval, and it is never inferred from Kickoff being held, a
 * transcript, or a stage move — those stay separate facts.
 *
 * Promotes every item currently on the list to agreed and stamps
 * validation as its own explicit fact, then writes one journal note on
 * the implementation. A journal failure is logged and never undoes the
 * already-saved validation (the same non-blocking pattern Add Services
 * uses for its own journal note).
 */
export async function confirmImplementationFocus(
  userId: string,
  dealId: string,
): Promise<IntakeAnswers> {
  const { requireSalesEditor } = await import("./presale.server");
  await requireSalesEditor(userId);
  const { data: row } = await db()
    .from("portal_accounts")
    .select("intake,customer_id")
    .eq("id", dealId)
    .maybeSingle();
  if (!row) throw new Error("Deal not found");
  const current = readIntake(row.intake);
  const agreed = agreeImplementationFocus(
    current.implementation_focus.items,
    new Date().toISOString(),
    userId,
  );
  const items = agreed.items;

  const { saveDealIntake } = await import("./presale.server");
  const next = await saveDealIntake(userId, dealId, { implementation_focus: agreed });

  try {
    const { implementationForDeal } = await import("./assignment.server");
    const implementationId = await implementationForDeal(dealId, row.customer_id ?? null);
    if (implementationId && items.length) {
      const { teamMemberIdForProfile } = await import("./activity.server");
      const { createJournalEntry } = await import("./hub.server");
      const authorId = await teamMemberIdForProfile(userId);
      const summary = items.map((i) => i.text).join("; ");
      await createJournalEntry({
        implementationId,
        note: `Implementation focus agreed: ${summary}`,
        authorId,
        links: null,
        attachmentUrl: null,
        attachmentName: null,
        kind: "note",
      });
    }
  } catch (e) {
    console.error(
      "[implementation-focus] focus was confirmed, but the journal note failed to save",
      e,
    );
  }

  return next;
}
