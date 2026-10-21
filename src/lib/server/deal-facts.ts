import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { claimedOwnersByDeal, latestImplementations } from "../claimed-owner";
import { readIntake } from "../intake-answers";
import { isPartnerDeal, isPartnerJourney } from "../partner-implementation";
import type { DealFacts } from "../needs-action";
import { closeDateFor, timelineFor } from "../onboarding-plan";
import { businessDaysBetween, localIso } from "../onboarding-timeline";
import {
  isOnboardingStage,
  isStage,
  isUnbookedBeforeKickoff,
  kickoffEntryDate,
  plannedBeforeKickoff,
} from "../presale-stages";
import { isKickoffBooked, nextChecklistTask, stageFlow } from "../stage-flow";
import { watchOutsFor } from "../watch-outs";
import { paperworkOnFile } from "../won-gate";
import { rowsOrLog, rowsOrThrow } from "./db-read";

const db = () => supabaseAdmin as any;

/**
 * The deal's facts with THIS implementation's pending transcript proposals
 * on them. A deal may run several implementations; the proposals belong to
 * one each, and Home's row (and its link) is per implementation, so the
 * count is laid on here, not summed onto the deal in `dealFactsFor`.
 */
export async function withPendingProposals<T extends { id: string; deal_id: string | null }>(
  implementations: ReadonlyArray<T>,
  facts: Map<string, DealFacts>,
): Promise<Map<string, DealFacts | null>> {
  const { pendingProposalCounts } = await import("../transcript-proposals.server");
  const pending = await pendingProposalCounts(implementations.map((i) => i.id));
  const out = new Map<string, DealFacts | null>();
  for (const i of implementations) {
    const deal = i.deal_id ? (facts.get(i.deal_id) ?? null) : null;
    out.set(i.id, deal ? { ...deal, pending_proposals: pending.get(i.id) ?? 0 } : null);
  }
  return out;
}

/**
 * The facts Home's triage reads about each deal, gathered once for a set of
 * deals: the checklist's state, the plan's overdue calls and the watch-outs
 * the plan contradicts. The same readers the deal page uses (stageFlow,
 * timelineFor, watchOutsFor), so a card and the page agree.
 */
export async function dealFactsFor(
  dealIds: ReadonlyArray<string>,
  today = localIso(),
): Promise<Map<string, DealFacts>> {
  const out = new Map<string, DealFacts>();
  const ids = Array.from(new Set(dealIds.filter(Boolean)));
  if (!ids.length) return out;

  const [dealsRes, notesRes, briefsRes, implsRes, historyRes, ledgerRes] = await Promise.all([
    db()
      .from("portal_accounts")
      .select(
        "id,name,stage,stage_entered_at,intake,sow_document_path,sow_document_url,sow_reference,welcome_share_url",
      )
      .in("id", ids),
    db()
      .from("portal_gong_reports")
      .select("account_id,content_md,call_date,created_at")
      .in("account_id", ids),
    db()
      .from("portal_briefs")
      .select("account_id,structured_json,created_at")
      .eq("status", "complete")
      .eq("generator", "llm")
      .in("account_id", ids)
      .order("created_at", { ascending: false }),
    db()
      .from("implementations")
      .select(
        "id,deal_id,owner_id,superseded_by_implementation_id,created_at,journey_type,partner_key,target_date,target_launch_date",
      )
      .in("deal_id", ids)
      .order("created_at", { ascending: false }),
    db()
      .from("portal_stage_transitions")
      .select("account_id,to_stage,occurred_at")
      .in("account_id", ids),
    db()
      .from("portal_assignments")
      .select("deal_id,team_member_id,created_at")
      .in("deal_id", ids)
      .order("created_at", { ascending: false }),
  ]);
  // The deals and their projects are what triage is about: a failed read
  // fails the page. The rest only add a watch-out or an owner's name, so a
  // failure there is logged and read as none.
  const deals = rowsOrThrow<any>(dealsRes, "deals");
  const impls = rowsOrThrow<any>(implsRes, "the deals' implementations");
  const notes = rowsOrLog<any>(notesRes, "deal facts: call notes");
  const briefs = rowsOrLog<any>(briefsRes, "deal facts: briefs");
  const history = rowsOrLog<any>(historyRes, "deal facts: stage history");
  const ledger = rowsOrLog<any>(ledgerRes, "deal facts: assignments");

  const notesByDeal = new Map<string, Array<{ text: string; date: string | null }>>();
  for (const n of (notes ?? []) as Array<{
    account_id: string;
    content_md: string | null;
    call_date: string | null;
    created_at: string | null;
  }>) {
    const list = notesByDeal.get(n.account_id) ?? [];
    if (n.content_md) list.push({ text: n.content_md, date: n.call_date ?? n.created_at ?? null });
    notesByDeal.set(n.account_id, list);
  }
  const briefByDeal = new Map<string, unknown>();
  for (const b of (briefs ?? []) as Array<{ account_id: string; structured_json: unknown }>)
    if (!briefByDeal.has(b.account_id)) briefByDeal.set(b.account_id, b.structured_json ?? null);
  // The one owner rule (src/lib/claimed-owner.ts): the project's owner, else
  // the claim ledger's, so "Nobody owns it" agrees with the board's "TIS:".
  const ownerIdByDeal = new Map<string, string | null>(
    [...claimedOwnersByDeal(impls ?? [], ledger ?? [])].map(([dealId, o]) => [dealId, o.id]),
  );
  // Partner: the intake's path, or the deal's live (newest, not superseded)
  // project — the board's and the stall sweep's rule.
  const partnerByDeal = new Map<string, boolean>();
  // The live project's plan end (target_date ?? target_launch_date), for
  // "plan end is after the agreed graduation date".
  const planEndByDeal = new Map<string, string | null>();
  const implRows = (impls ?? []) as Array<{
    id: string;
    deal_id: string;
    owner_id: string | null;
    superseded_by_implementation_id: string | null;
    journey_type: string | null;
    partner_key: string | null;
    target_date?: string | null;
    target_launch_date?: string | null;
  }>;
  for (const [dealId, i] of latestImplementations(implRows)) {
    partnerByDeal.set(dealId, isPartnerJourney(i));
    planEndByDeal.set(dealId, i.target_date ?? i.target_launch_date ?? null);
  }
  const ownerIds = [...new Set([...ownerIdByDeal.values()].filter(Boolean))] as string[];
  const { data: members } = ownerIds.length
    ? await db().from("team_members").select("id,name").in("id", ownerIds)
    : { data: [] };
  const nameById = new Map(
    ((members ?? []) as Array<{ id: string; name: string }>).map((m) => [String(m.id), m.name]),
  );
  const ownerByDeal = new Map<string, string | null>();
  for (const [dealId, ownerId] of ownerIdByDeal)
    ownerByDeal.set(dealId, ownerId ? (nameById.get(ownerId) ?? "owner") : null);
  const hist = (history ?? []) as Array<{
    account_id: string;
    to_stage: string;
    occurred_at: string;
  }>;

  for (const d of (deals ?? []) as Array<{
    id: string;
    name: string;
    stage: string;
    stage_entered_at: string | null;
    intake: unknown;
    sow_document_path: string | null;
    sow_document_url?: string | null;
    sow_reference: string | null;
    welcome_share_url: string | null;
  }>) {
    if (!isStage(d.stage)) continue;
    const intake = readIntake(d.intake);
    const stageHistory = hist.filter((h) => h.account_id === d.id);
    const timeline = timelineFor(
      intake,
      closeDateFor({ intake, stageHistory, wonStageKey: "closed_won", today }).date,
    );
    const noteTexts = notesByDeal.get(d.id) ?? [];
    // One rule for the paperwork: a SOW, a contract or a stated no-SOW reason.
    const paperwork = paperworkOnFile(d);
    const hasSow = paperwork !== null;
    const owner = ownerByDeal.get(d.id) ?? null;
    const input = {
      stage: d.stage,
      intake,
      owner,
      gongReports: noteTexts.length,
      paperwork,
      hasBrief: briefByDeal.has(d.id),
      hasLink: Boolean(d.welcome_share_url),
      timeline,
    };
    const flow = stageFlow(input);
    const booking = flow.stages
      .find((s) => s.key === "pre_kickoff")
      ?.tasks.find((t) => t.key === "book_core" || t.key === "kickoff");
    const entered = String(d.stage_entered_at ?? today).slice(0, 10);
    const kickoffOn = kickoffEntryDate(d.stage, d.stage_entered_at, stageHistory);
    const kickoffBooked = isKickoffBooked(intake);
    out.set(d.id, {
      id: d.id,
      name: d.name,
      stage: d.stage,
      business_days_in_stage: Math.max(0, businessDaysBetween(entered, today)),
      stage_entered_on: d.stage_entered_at ? entered : null,
      has_notes: noteTexts.length > 0,
      has_sow: hasSow,
      owner_name: owner,
      core_booked: booking?.done ?? false,
      partner: isPartnerDeal(intake) || (partnerByDeal.get(d.id) ?? false),
      next_step: nextChecklistTask(input),
      overdue_calls: isOnboardingStage(d.stage)
        ? timeline.milestones
            .filter(
              (m) =>
                m.kind === "call" &&
                !m.doneOn &&
                m.date < today &&
                !plannedBeforeKickoff(m, kickoffOn),
            )
            .map((m) => ({
              label: m.label,
              date: m.date,
              businessDaysLate: businessDaysBetween(m.date, today),
            }))
        : [],
      // Before Kickoff, with the kickoff unbooked, only booked sessions are
      // events; an unbooked one's date is the playbook's guess from the close.
      upcoming_calls:
        isOnboardingStage(d.stage) || d.stage === "onboarding_kickoff"
          ? timeline.milestones
              .filter(
                (m) =>
                  m.kind === "call" &&
                  !m.serviceId &&
                  !m.doneOn &&
                  m.date >= today &&
                  !isUnbookedBeforeKickoff(d.stage, m, kickoffBooked),
              )
              .map((m) => ({
                key: m.key,
                label: m.label,
                date: m.date,
                time: m.time,
                minutes: m.minutes ?? null,
              }))
          : [],
      close_date: timeline.closeDate,
      live_date: timeline.liveDate,
      live_done_on: timeline.liveDoneOn,
      plan_end: planEndByDeal.get(d.id) ?? null,
      agreed_graduation: intake.timeline.stage_targets.complete.current_date ?? null,
      // Transcript proposals are an implementation's, not the deal's: the
      // caller that knows which implementation it is rendering overlays the
      // count (`withPendingProposals`), so a deal with two implementations
      // does not show one's proposals on the other's row.
      pending_proposals: 0,
      watch_outs: watchOutsFor({
        brief: briefByDeal.get(d.id) ?? null,
        notes: noteTexts,
        intake,
        timeline,
      })
        .filter((w) => w.severity === "conflict")
        .map((w) => ({ title: w.title, detail: w.detail })),
    });
  }
  return out;
}
