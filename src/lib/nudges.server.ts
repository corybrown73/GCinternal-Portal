import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { appUrl } from "./app-url";
import { readIntake } from "./intake-answers";
import { closeDateFor, timelineFor } from "./onboarding-plan";
import { businessDaysBetween, localIso } from "./onboarding-timeline";
import { nudgesFor, stageFlow, type Nudge } from "./stage-flow";

const db = () => supabaseAdmin as any;

const WATCHED = ["closed_won", "field_fusion_setup", "onboarding_kickoff", "in_onboarding"];

/**
 * Nudges start with the checklist. A deal that entered its stage before
 * this is not nudged for that visit — otherwise the first hourly run would
 * mail every owner about months of history at once.
 */
const NUDGES_FROM = "2026-09-23";

/**
 * The hourly nudge (called from the SLA sweep). For every deal in a stage a
 * person is working, read its checklist and its time in the stage, ask
 * `nudgesFor` what to say, and send what has not been sent — the audit log
 * holds one "deal.nudged" row per nudge key, so a re-run never repeats one.
 */
export async function runDealNudges(): Promise<{ sent: number; skipped: number }> {
  const today = localIso();
  const { data: deals } = await db()
    .from("portal_accounts")
    .select("id,name,stage,stage_entered_at,intake,sow_document_path,welcome_share_url,customer_id")
    .in("stage", WATCHED);
  type DealRow = {
    id: string;
    name: string;
    stage: string;
    stage_entered_at: string | null;
    intake: unknown;
    sow_document_path: string | null;
    welcome_share_url: string | null;
    customer_id: string | null;
  };
  const rows = (deals ?? []) as DealRow[];
  if (!rows.length) return { sent: 0, skipped: 0 };
  const ids = rows.map((d) => String(d.id));

  const [{ data: notes }, { data: briefs }, { data: impls }, { data: sent }, { data: history }] =
    await Promise.all([
      db().from("portal_gong_reports").select("account_id").in("account_id", ids),
      db()
        .from("portal_briefs")
        .select("account_id")
        .eq("status", "complete")
        .eq("generator", "llm")
        .in("account_id", ids),
      db()
        .from("implementations")
        .select("deal_id,owner_id,created_at")
        .in("deal_id", ids)
        .order("created_at", { ascending: false }),
      db()
        .from("portal_audit_log")
        .select("entity_id,payload")
        .eq("action", "deal.nudged")
        .in("entity_id", ids),
      db()
        .from("portal_stage_transitions")
        .select("account_id,to_stage,occurred_at")
        .in("account_id", ids),
    ]);
  const noteCount = new Map<string, number>();
  for (const n of (notes ?? []) as Array<{ account_id: string }>)
    noteCount.set(n.account_id, (noteCount.get(n.account_id) ?? 0) + 1);
  const briefed = new Set(
    ((briefs ?? []) as Array<{ account_id: string }>).map((b) => b.account_id),
  );
  const ownerByDeal = new Map<string, string | null>();
  for (const i of (impls ?? []) as Array<{ deal_id: string; owner_id: string | null }>)
    if (!ownerByDeal.has(i.deal_id)) ownerByDeal.set(i.deal_id, i.owner_id);
  const already = new Set(
    ((sent ?? []) as Array<{ entity_id: string; payload: { key?: string } | null }>).map(
      (r) => `${r.entity_id}|${r.payload?.key ?? ""}`,
    ),
  );
  const ownerIds = [...new Set([...ownerByDeal.values()].filter(Boolean))] as string[];
  const { data: members } = ownerIds.length
    ? await db().from("team_members").select("id,name,email").in("id", ownerIds)
    : { data: [] };
  const memberById = new Map(
    ((members ?? []) as Array<{ id: string; name: string; email: string | null }>).map((m) => [
      String(m.id),
      m,
    ]),
  );
  const { managerProfiles } = await import("./tickets.server");
  const managers = (await managerProfiles()).map((p) => p.email).filter(Boolean) as string[];
  const { sendEmail } = await import("./server/email");
  const { audit } = await import("./server/audit");

  let count = 0;
  let skipped = 0;
  for (const d of rows) {
    const id = String(d.id);
    const intake = readIntake(d.intake);
    const ownerId = ownerByDeal.get(id) ?? null;
    const owner = ownerId ? (memberById.get(ownerId) ?? null) : null;
    const hist = (
      (history ?? []) as Array<{ account_id: string; to_stage: string; occurred_at: string }>
    ).filter((h) => h.account_id === id);
    const timeline = timelineFor(
      intake,
      closeDateFor({ intake, stageHistory: hist, wonStageKey: "closed_won", today }).date,
    );
    const flow = stageFlow({
      stage: String(d.stage),
      intake,
      owner: owner?.name ?? (ownerId ? "owner" : null),
      gongReports: noteCount.get(id) ?? 0,
      hasSow: Boolean(d.sow_document_path),
      hasBrief: briefed.has(id),
      hasLink: Boolean(d.welcome_share_url),
      timeline,
    });
    const entered = String(d.stage_entered_at ?? new Date().toISOString());
    if (entered.slice(0, 10) < NUDGES_FROM) continue;
    const inStage = Math.max(0, businessDaysBetween(entered.slice(0, 10), today));
    const overdueCalls =
      d.stage === "in_onboarding"
        ? timeline.milestones
            .filter((m) => m.kind === "call" && !m.doneOn && m.date < today)
            .map((m) => ({
              key: m.key,
              label: m.label,
              date: m.date,
              businessDaysLate: businessDaysBetween(m.date, today),
            }))
        : [];
    const nudges = nudgesFor({
      name: String(d.name),
      stage: String(d.stage),
      businessDaysInStage: inStage,
      enteredAt: entered,
      flow,
      overdueCalls,
    });
    for (const n of nudges) {
      if (already.has(`${id}|${n.key}`)) {
        skipped += 1;
        continue;
      }
      const to = recipients(n, owner?.email ?? null, managers);
      if (!to.length) {
        skipped += 1;
        continue;
      }
      const link = d.customer_id
        ? `${appUrl()}/customers/${d.customer_id}`
        : `${appUrl()}/deals/${id}`;
      for (const r of to) {
        try {
          await sendEmail({
            to: r.email,
            kind: r.asOwner ? "assignment" : "notification",
            subject: n.subject,
            html: `<div style="font-family:sans-serif;max-width:560px;color:#0a1628"><p>${esc(n.line)}</p><p><a href="${link}" style="color:#039de7">Open the checklist</a></p><p style="font-size:12px;color:#888">GoCanvas Handoff Hub · one reminder per step</p></div>`,
          });
        } catch (e) {
          console.error("[nudge] could not send", e);
        }
      }
      await audit({
        actor_type: "system",
        actor_id: null,
        action: "deal.nudged",
        entity_type: "account",
        entity_id: id,
        payload: { key: n.key, level: n.level, to: to.map((r) => r.email) },
      });
      count += 1;
    }
  }
  return { sent: count, skipped };
}

function recipients(
  n: Nudge,
  ownerEmail: string | null,
  managers: string[],
): Array<{ email: string; asOwner: boolean }> {
  const out: Array<{ email: string; asOwner: boolean }> = [];
  if (n.to !== "managers" && ownerEmail) out.push({ email: ownerEmail, asOwner: true });
  if (n.to !== "owner" || !ownerEmail) {
    for (const m of managers)
      if (!out.some((o) => o.email.toLowerCase() === m.toLowerCase()))
        out.push({ email: m, asOwner: false });
  }
  return out;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
