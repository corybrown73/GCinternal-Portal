import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { readIntake } from "../intake-answers";
import type { DealFacts } from "../needs-action";
import { closeDateFor, timelineFor } from "../onboarding-plan";
import { businessDaysBetween, localIso } from "../onboarding-timeline";
import { isOnboardingStage, isStage } from "../presale-stages";
import { nextChecklistTask, stageFlow } from "../stage-flow";
import { watchOutsFor } from "../watch-outs";

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

  const [{ data: deals }, { data: notes }, { data: briefs }, { data: impls }, { data: history }] =
    await Promise.all([
      db()
        .from("portal_accounts")
        .select(
          "id,name,stage,stage_entered_at,intake,sow_document_path,sow_reference,welcome_share_url",
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
        .select("id,deal_id,owner_id,created_at")
        .in("deal_id", ids)
        .order("created_at", { ascending: false }),
      db()
        .from("portal_stage_transitions")
        .select("account_id,to_stage,occurred_at")
        .in("account_id", ids),
    ]);

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
  const ownerIdByDeal = new Map<string, string | null>();
  const implRows = (impls ?? []) as Array<{ id: string; deal_id: string; owner_id: string | null }>;
  for (const i of implRows)
    if (!ownerIdByDeal.has(i.deal_id)) ownerIdByDeal.set(i.deal_id, i.owner_id);
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
    const hasSow = Boolean(d.sow_document_path) || Boolean(d.sow_reference?.trim());
    const owner = ownerByDeal.get(d.id) ?? null;
    const input = {
      stage: d.stage,
      intake,
      owner,
      gongReports: noteTexts.length,
      hasSow,
      hasBrief: briefByDeal.has(d.id),
      hasLink: Boolean(d.welcome_share_url),
      timeline,
    };
    const flow = stageFlow(input);
    const booking = flow.stages
      .find((s) => s.key === "pre_kickoff")
      ?.tasks.find((t) => t.key === "book_core" || t.key === "kickoff");
    const entered = String(d.stage_entered_at ?? today).slice(0, 10);
    out.set(d.id, {
      id: d.id,
      name: d.name,
      stage: d.stage,
      business_days_in_stage: Math.max(0, businessDaysBetween(entered, today)),
      has_notes: noteTexts.length > 0,
      has_sow: hasSow,
      owner_name: owner,
      core_booked: booking?.done ?? false,
      next_step: nextChecklistTask(input),
      overdue_calls: isOnboardingStage(d.stage)
        ? timeline.milestones
            .filter((m) => m.kind === "call" && !m.doneOn && m.date < today)
            .map((m) => ({
              label: m.label,
              date: m.date,
              businessDaysLate: businessDaysBetween(m.date, today),
            }))
        : [],
      upcoming_calls:
        isOnboardingStage(d.stage) || d.stage === "onboarding_kickoff"
          ? timeline.milestones
              .filter((m) => m.kind === "call" && !m.serviceId && !m.doneOn && m.date >= today)
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
