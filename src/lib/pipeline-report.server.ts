import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { readIntake } from "./intake-answers";
import { localIso } from "./onboarding-timeline";
import { buildPipelineReport, type PipelineReport, type ReportDeal } from "./pipeline-report";
import type { AccountStage } from "./presale-stages";

const db = () => supabaseAdmin as any;

/**
 * Today's report, from the same board the team looks at (loadPipeline: the
 * checklist's next task, the stuck limits, the owners) plus the stage
 * history for the timings and the last thing that happened on each deal.
 */
export async function loadPipelineReport(
  opts: { untouchedAfter?: number; sinceDays?: number } = {},
): Promise<PipelineReport> {
  const { loadPipeline } = await import("./presale.server");
  const { deals } = await loadPipeline(null);
  const ids = deals.map((d) => d.id);
  const [{ data: history }, { data: notes }, { data: briefs }] = await Promise.all([
    db()
      .from("portal_stage_transitions")
      .select("account_id,to_stage,occurred_at")
      .in("account_id", ids)
      .order("occurred_at", { ascending: true }),
    db().from("portal_gong_reports").select("account_id,created_at").in("account_id", ids),
    db()
      .from("portal_briefs")
      .select("account_id")
      .eq("status", "complete")
      .eq("generator", "llm")
      .in("account_id", ids),
  ]);
  const hist = (history ?? []) as Array<{
    account_id: string;
    to_stage: string;
    occurred_at: string;
  }>;
  const firstTo = (id: string, stage: string) =>
    hist.find((h) => h.account_id === id && h.to_stage === stage)?.occurred_at ?? null;
  const lastMove = new Map<string, string>();
  for (const h of hist) lastMove.set(h.account_id, h.occurred_at);
  const lastNote = new Map<string, string>();
  for (const n of (notes ?? []) as Array<{ account_id: string; created_at: string }>)
    if ((lastNote.get(n.account_id) ?? "") < n.created_at) lastNote.set(n.account_id, n.created_at);
  const briefed = new Set(
    ((briefs ?? []) as Array<{ account_id: string }>).map((b) => b.account_id),
  );

  const rows: ReportDeal[] = deals.map((d) => {
    const intake = readIntake(d.intake);
    const activity = [
      String((d as { updated_at?: string }).updated_at ?? d.stage_entered_at),
      lastMove.get(d.id) ?? "",
      lastNote.get(d.id) ?? "",
    ].sort();
    return {
      id: d.id,
      name: d.name,
      stage: d.stage as AccountStage,
      owner: d.owner_name,
      nextStep: d.next_step,
      stuck: d.stuck,
      businessDaysInStage: d.business_days_in_stage,
      hasGongBrief: d.has_notes,
      hasSow: d.has_sow,
      hasAiBrief: briefed.has(d.id),
      closedAt: firstTo(d.id, "closed_won"),
      onboardingAt: firstTo(d.id, "in_onboarding"),
      liveOn: intake.timeline.completed["live"] ?? null,
      lastActivityAt: activity[activity.length - 1]!,
    };
  });
  const today = localIso();
  const since = opts.sinceDays
    ? new Date(Date.now() - opts.sinceDays * 86_400_000).toISOString()
    : null;
  return buildPipelineReport(rows, today, {
    ...(opts.untouchedAfter ? { untouchedAfter: opts.untouchedAfter } : {}),
    since,
  });
}

/**
 * The morning email: today's report to every manager, once a day (the audit
 * log holds the day's stamp, so a re-run never sends twice). Skips weekends.
 */
export async function runDailyReport(): Promise<{ sent: number; skipped: string | null }> {
  const today = localIso();
  const day = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (day === 0 || day === 6) return { sent: 0, skipped: "weekend" };
  const { data: already } = await db()
    .from("portal_audit_log")
    .select("id")
    .eq("action", "report.daily_sent")
    .eq("entity_id", today)
    .limit(1);
  if (already?.length) return { sent: 0, skipped: "already sent today" };

  const report = await loadPipelineReport();
  const { reportHtml } = await import("./pipeline-report");
  const { managerProfiles } = await import("./tickets.server");
  const { sendEmail } = await import("./server/email");
  const { appUrl } = await import("./app-url");
  const managers = (await managerProfiles()).map((p) => p.email).filter(Boolean) as string[];
  const stuck = report.stuck.length + report.unclaimed.length;
  let sent = 0;
  for (const to of managers) {
    try {
      await sendEmail({
        to,
        kind: "requested",
        subject: `Onboarding pipeline ${today}${stuck ? ` — ${stuck} need${stuck === 1 ? "s" : ""} attention` : ""}`,
        html: reportHtml(report, `${appUrl()}/pipeline`),
      });
      sent += 1;
    } catch (e) {
      console.error("[daily report] could not send", e);
    }
  }
  const { audit } = await import("./server/audit");
  await audit({
    actor_type: "system",
    actor_id: null,
    action: "report.daily_sent",
    entity_type: "app",
    entity_id: today,
    payload: { sent, stuck: report.stuck.length, untouched: report.untouched.length },
  });
  return { sent, skipped: null };
}
