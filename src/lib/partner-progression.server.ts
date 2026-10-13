import { type AssigneeChoice, chooseAssignee } from "./assignment.server";
import { claimNotice, handoffNotice } from "./partner-notifications";
import type { PartnerStartClient } from "./partner-start.server";

/**
 * Partner progression: one database transaction per move. The stage, its
 * history, the Implementation Ready or Roll Out milestone, the deal transition,
 * the assignment, the audit row and the events all commit together, or not at
 * all (migration 0084). This module chooses the assignee and renders the
 * notices, then makes that one call.
 */

export type AdvanceResult = { stage: string; advancedWithGaps: boolean };

/** Advance to the next stage. Blocking gates refuse; advisory gates advance and record the gap. */
export async function advancePartnerStage(
  client: PartnerStartClient,
  input: {
    implementationId: string;
    toStage: string;
    enteredBy: string | null;
    actorProfile: string | null;
    notes: string | null;
    at: string;
  },
): Promise<AdvanceResult> {
  const { data, error } = await client.rpc("advance_partner_stage", {
    p_implementation_id: input.implementationId,
    p_to_stage: input.toStage,
    p_entered_by: input.enteredBy,
    p_actor_profile: input.actorProfile,
    p_notes: input.notes,
    p_at: input.at,
  });
  if (error) throw new Error(error.message);
  const row = data as { stage?: unknown; advanced_with_gaps?: unknown } | null;
  if (!row || typeof row.stage !== "string") {
    throw new Error("The stage was not advanced: no result was returned.");
  }
  return { stage: row.stage, advancedWithGaps: row.advanced_with_gaps === true };
}

export type Notice = { dedupe_key: string; to: string; subject: string; html: string };

/**
 * The Implementation Ready handoff. The assignee and the notices are decided
 * here; the database makes the handoff and the notices commit together.
 */
export async function handOffPartnerImplementation(
  client: PartnerStartClient,
  input: {
    implementationId: string;
    teamMemberId: string | null;
    assignment: { weight: number; breakdown: unknown; source: string; note: string } | null;
    notices: Notice[];
    actorTeamMember: string | null;
    actorProfile: string | null;
    at: string;
  },
): Promise<{ stage: string; assigned: boolean }> {
  const { data, error } = await client.rpc("partner_implementation_handoff", {
    p_implementation_id: input.implementationId,
    p_team_member_id: input.teamMemberId,
    p_actor_team_member: input.actorTeamMember,
    p_actor_profile: input.actorProfile,
    p_assignment: input.assignment ?? {},
    p_outbox: input.notices,
    p_at: input.at,
  });
  if (error) throw new Error(error.message);
  const row = data as { stage?: unknown; assigned?: unknown } | null;
  if (!row || typeof row.stage !== "string") {
    throw new Error("The handoff did not complete: no result was returned.");
  }
  return { stage: row.stage, assigned: row.assigned === true };
}

/** Partner graduation: Roll Out & Graduation's four criteria, then the deal moves to onboarding_complete. */
export async function graduatePartnerImplementation(
  client: PartnerStartClient,
  input: {
    implementationId: string;
    actorTeamMember: string | null;
    actorProfile: string | null;
    at: string;
  },
): Promise<void> {
  const { error } = await client.rpc("partner_implementation_graduate", {
    p_implementation_id: input.implementationId,
    p_actor_team_member: input.actorTeamMember,
    p_actor_profile: input.actorProfile,
    p_at: input.at,
  });
  if (error) throw new Error(error.message);
}

/** The notices and assignment a choice implies, for a handoff. */
export function handoffPlan(args: {
  choice: AssigneeChoice;
  implementationId: string;
  dealId: string;
  appUrl: string;
}): {
  teamMemberId: string | null;
  assignment: { weight: number; breakdown: unknown; source: string; note: string } | null;
  notices: Notice[];
} {
  if (args.choice.kind === "chosen") {
    const { chosen, source, weight, breakdown, rules, deal } = args.choice;
    const dealName = String(deal.name);
    // With no address on file the notice is still queued, with no recipient, so
    // the sender records it as a failed attempt. It is never dropped.
    const recipients = [
      handoffNotice({
        implementationId: args.implementationId,
        memberId: chosen.teamMemberId,
        recipient: chosen.email ?? "",
        recipientName: chosen.name,
        dealName,
        appUrl: args.appUrl,
        dealId: args.dealId,
      }),
    ];
    return {
      teamMemberId: chosen.teamMemberId,
      assignment: {
        weight,
        breakdown,
        source,
        note:
          source === "auto"
            ? `Rule: lowest load in the last ${rules.window_days} days (${chosen.load} carried)`
            : "Chosen by hand",
      },
      notices: recipients,
    };
  }
  if (args.choice.kind === "claim") {
    const dealName = args.choice.dealName;
    return {
      teamMemberId: null,
      assignment: null,
      notices: args.choice.pool.map((p) =>
        claimNotice({
          implementationId: args.implementationId,
          memberId: p.teamMemberId,
          recipient: p.email ?? "",
          dealName,
          appUrl: args.appUrl,
          dealId: args.dealId,
        }),
      ),
    };
  }
  return { teamMemberId: null, assignment: null, notices: [] };
}

/**
 * The stage move for an implementation on the partner journey, from the
 * advance entry point. Partner Setup to Form Finalisation is the handoff; every
 * other move is an advance.
 */
export async function advancePartnerFor(
  client: PartnerStartClient,
  args: {
    implementationId: string;
    dealId: string | null;
    currentStage: string | null;
    toStage: string;
    enteredBy: string | null;
    actorProfile: string | null;
    notes: string | null;
    appUrl: string;
    /** The team member taking the handoff, when one is picked. Null lets the rule choose. */
    teamMemberId?: string | null;
  },
): Promise<{
  ok: true;
  stage: string;
  enteredAt: string;
  overridden: false;
  /** Set on the handoff only: whether a team member was named, or the team was asked to claim it. */
  assigned?: boolean;
}> {
  const at = new Date().toISOString();
  if (args.currentStage === "partner_setup" && args.toStage === "form_finalisation") {
    if (!args.dealId)
      throw new Error("This implementation has no deal, so the handoff cannot run.");
    const choice = await chooseAssignee({
      dealId: args.dealId,
      teamMemberId: args.teamMemberId ?? null,
    });
    const plan = handoffPlan({
      choice,
      implementationId: args.implementationId,
      dealId: args.dealId,
      appUrl: args.appUrl,
    });
    const handed = await handOffPartnerImplementation(client, {
      implementationId: args.implementationId,
      teamMemberId: plan.teamMemberId,
      assignment: plan.assignment,
      notices: plan.notices,
      actorTeamMember: args.enteredBy,
      actorProfile: args.actorProfile,
      at,
    });
    return {
      ok: true,
      stage: handed.stage,
      enteredAt: at,
      overridden: false,
      assigned: handed.assigned,
    };
  }
  const moved = await advancePartnerStage(client, {
    implementationId: args.implementationId,
    toStage: args.toStage,
    enteredBy: args.enteredBy,
    actorProfile: args.actorProfile,
    notes: args.notes,
    at,
  });
  return { ok: true, stage: moved.stage, enteredAt: at, overridden: false };
}
