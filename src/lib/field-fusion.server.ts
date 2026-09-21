import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  FIELD_FUSION_OWNER_EMAIL_DEFAULT,
  FIELD_FUSION_STAGE,
  fieldFusionChecklist,
  fieldFusionReady,
  type HandoffNote,
} from "./field-fusion";
import { intakeAnswersSchema, readIntake } from "./intake-answers";
import { audit } from "./server/audit";

const db = () => supabaseAdmin as any;
const OWNER_KEY = "field_fusion_owner_email";

export type FieldFusionOwner = {
  teamMemberId: string;
  name: string;
  email: string;
};

/**
 * Who runs the Field Fusion setup: the configured email, or the default,
 * looked up on the team roster. Null when nobody by that email is on the
 * roster — the deal then waits in the setup stage with no owner, and the
 * deal page says so.
 */
export async function fieldFusionOwner(): Promise<FieldFusionOwner | null> {
  const { data: cfg } = await db()
    .from("portal_app_config")
    .select("value")
    .eq("key", OWNER_KEY)
    .maybeSingle();
  const email = String(
    typeof cfg?.value === "string" && cfg.value.trim()
      ? cfg.value
      : FIELD_FUSION_OWNER_EMAIL_DEFAULT,
  )
    .trim()
    .toLowerCase();
  const { data: tm } = await db()
    .from("team_members")
    .select("id,name,email")
    .ilike("email", email)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (!tm) return null;
  return { teamMemberId: String(tm.id), name: String(tm.name), email: String(tm.email) };
}

/**
 * A Field Fusion deal just closed. It moves to the setup stage and the
 * setup owner gets it: the project is hers, the ledger says so, and her
 * email says what to confirm and where the handoff button is. Never
 * throws — the close already happened; what could not follow is audited.
 */
export async function startFieldFusionSetup(
  dealId: string,
  actorProfileId: string | null,
): Promise<{ owner: FieldFusionOwner | null; staged: boolean }> {
  let staged = false;
  try {
    const { transitionStage } = await import("./server/accounts");
    const r = await transitionStage(
      dealId,
      FIELD_FUSION_STAGE,
      { source: actorProfileId ? "ui" : "system", actorProfileId },
      "Field Fusion: the setup is confirmed before the handoff to implementation",
    );
    staged = r.changed;
  } catch (e) {
    console.error("[field fusion] could not move the deal to setup", e);
  }
  const owner = await fieldFusionOwner();
  if (!owner) {
    await audit({
      actor_type: actorProfileId ? "user" : "system",
      actor_id: actorProfileId,
      action: "field_fusion.owner_missing",
      entity_type: "account",
      entity_id: dealId,
      payload: { reason: `nobody on the roster with the configured email (${OWNER_KEY})` },
    });
    return { owner: null, staged };
  }
  try {
    const { assignDeal } = await import("./assignment.server");
    await assignDeal({
      dealId,
      teamMemberId: owner.teamMemberId,
      actorProfileId,
      note: "Field Fusion setup — before the handoff to implementation",
      message: "field_fusion_setup",
    });
  } catch (e) {
    console.error("[field fusion] could not assign the setup owner", e);
  }
  return { owner, staged };
}

/**
 * The handoff. Both checks ticked, the deal moves to Onboarding Kickoff
 * and implementation gets it — a named person, or the pool to claim —
 * with the use case and goals the brief read from the calls and the
 * setup notes, in the same email that says what to do first.
 */
export async function handToImplementation(
  actorProfileId: string,
  dealId: string,
  teamMemberId: string | null,
): Promise<{ assigneeName: string | null; claimOffered: boolean }> {
  const { requireInternal } = await import("./presale.server");
  const actor = await requireInternal(actorProfileId);

  const { data: deal } = await db()
    .from("portal_accounts")
    .select("id,name,intake,stage")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) throw new Error("Deal not found");
  const intake = readIntake(deal.intake);
  if (intake.path !== "field_fusion") throw new Error("This is not a Field Fusion account.");
  if (!fieldFusionReady(intake)) {
    const missing = fieldFusionChecklist(intake)
      .filter((c) => !c.done)
      .map((c) => c.label.toLowerCase());
    throw new Error(`Not yet: ${missing.join(", and ")}.`);
  }

  // The use case and goals: the brief's reading of the calls, when there is one.
  const { data: brief } = await db()
    .from("portal_briefs")
    .select("structured_json")
    .eq("account_id", dealId)
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const json = (brief?.structured_json ?? null) as {
    one_liner?: unknown;
    goals?: unknown;
  } | null;
  const handoff: HandoffNote = {
    from: actor.full_name?.trim() || actor.email,
    useCase: typeof json?.one_liner === "string" && json.one_liner.trim() ? json.one_liner : null,
    goals: Array.isArray(json?.goals)
      ? json.goals.filter((g): g is string => typeof g === "string" && g.trim().length > 0)
      : [],
    notes: intake.field_fusion.notes.trim() || null,
  };

  // The stamp first: a handoff that is recorded is a handoff.
  const next = intakeAnswersSchema.parse({
    ...intake,
    field_fusion: { ...intake.field_fusion, handed_off_at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  });
  const { error } = await db()
    .from("portal_accounts")
    .update({ intake: next, updated_at: new Date().toISOString() })
    .eq("id", dealId);
  if (error) throw new Error(`Could not record the handoff: ${error.message}`);

  const { transitionStage } = await import("./server/accounts");
  await transitionStage(
    dealId,
    "onboarding_kickoff",
    { source: "ui", actorProfileId },
    `Handed to implementation by ${handoff.from} after Field Fusion setup`,
  );

  const { assignDeal } = await import("./assignment.server");
  const result = await assignDeal({
    dealId,
    teamMemberId,
    actorProfileId,
    note: `Handed over by ${handoff.from} after Field Fusion setup`,
    message: "handoff",
    handoff,
  });

  await audit({
    actor_type: "user",
    actor_id: actorProfileId,
    action: "field_fusion.handed_off",
    entity_type: "account",
    entity_id: dealId,
    payload: {
      team_member_id: result?.teamMemberId ?? null,
      claim_offered: result === null,
      goals: handoff.goals.length,
      notes: Boolean(handoff.notes),
    },
  });

  return { assigneeName: result?.assigneeName ?? null, claimOffered: result === null };
}
