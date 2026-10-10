import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { appUrl } from "./app-url";
import { readIntake } from "./intake-answers";
import { isOnboardingStage, kickoffEntryDate, plannedBeforeKickoff } from "./presale-stages";
import { closeDateFor, timelineFor } from "./onboarding-plan";
import { businessDaysBetween, localIso } from "./onboarding-timeline";
import { nudgesFor, stageFlow, type Nudge } from "./stage-flow";

const db = () => supabaseAdmin as any;

const WATCHED = [
  "negotiate",
  "closed_won",
  "field_fusion_setup",
  "onboarding_kickoff",
  "kickoff",
  "get_it_working",
  "make_it_yours",
  "make_it_run",
];

/**
 * Nudges start with the checklist. A deal that entered its stage before
 * this is not nudged for that visit — otherwise the first hourly run would
 * mail every owner about months of history at once.
 */
const NUDGES_FROM = "2026-09-23";

/** portal_app_config key: when the first sweep recorded the state it found. */
export const NUDGE_BASELINE_KEY = "nudges.baselined_at";

/** The pause between two sends, so a busy hour stays under the provider's rate limit. */
export const NUDGE_SEND_GAP_MS = 400;

export type NudgeRun = {
  sent: number;
  skipped: number;
  /** Nudges recorded without an email on the first sweep. */
  baselined: number;
  /** Sends that failed; their recipients are tried again next hour. */
  failed: number;
  /** Why the run stopped before sending anything (a read failed), or null. */
  halted: string | null;
};

type NudgedRow = {
  entity_id: string;
  payload: { key?: string; to?: unknown; failed?: unknown; baseline?: unknown } | null;
};

/** One read of the run; any error ends the run before it sends or stamps. */
type Read<T> = { data: T | null; error: { message?: string } | null };

class NudgeReadError extends Error {
  constructor(what: string, error: { message?: string }) {
    super(`could not read ${what}: ${error.message ?? String(error)}`);
  }
}

function must<T>(what: string, r: Read<T>): T {
  if (r.error) throw new NudgeReadError(what, r.error);
  return (r.data ?? []) as T;
}

/**
 * The hourly nudge (called from the SLA sweep). For every deal in a stage a
 * person is working, read its checklist and its time in the stage, ask
 * `nudgesFor` what to say, and send what has not been sent — the audit log
 * holds one "deal.nudged" row per nudge key, so a re-run never repeats one.
 *
 * The first sweep ever sends nothing: it records every nudge that would
 * fire now as already said (`baseline: true`) and stamps NUDGE_BASELINE_KEY,
 * so only what changes from then on emails. A row names the recipients
 * whose send went through; one that failed (a 429) is tried next hour.
 *
 * Every read must succeed: a deal list, an owner or a record that failed
 * to load would otherwise look like "nothing said yet" and mail everyone
 * (or be baselined wrong, and mail them next hour). Before sending, a run
 * claims the nudge for this hour (`deal.nudge_claim`, unique under 0081),
 * so two overlapping sweeps cannot both send it.
 */
export async function runDealNudges(
  opts: {
    sendGapMs?: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => Date;
  } = {},
): Promise<NudgeRun> {
  const run: NudgeRun = { sent: 0, skipped: 0, baselined: 0, failed: 0, halted: null };
  try {
    return await nudgeRun(run, opts);
  } catch (e) {
    if (!(e instanceof NudgeReadError)) throw e;
    console.error(`[nudge] ${e.message}; skipping this run`);
    return { ...run, halted: e.message };
  }
}

async function nudgeRun(
  run: NudgeRun,
  opts: { sendGapMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => Date },
): Promise<NudgeRun> {
  const gap = opts.sendGapMs ?? NUDGE_SEND_GAP_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const hour = (opts.now?.() ?? new Date()).toISOString().slice(0, 13);

  // Not knowing whether the baseline ran is not a reason to mail everyone.
  const stamp = await db()
    .from("portal_app_config")
    .select("value")
    .eq("key", NUDGE_BASELINE_KEY)
    .maybeSingle();
  if (stamp.error) throw new NudgeReadError("the baseline stamp", stamp.error);
  const baseline = !stamp.data;

  const today = localIso();
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
  const rows = must<DealRow[]>(
    "the deals",
    await db()
      .from("portal_accounts")
      .select(
        "id,name,stage,stage_entered_at,intake,sow_document_path,welcome_share_url,customer_id",
      )
      .in("stage", WATCHED),
  );
  const ids = rows.map((d) => String(d.id));

  const reads = ids.length
    ? await Promise.all([
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
      ])
    : [];
  const empty = { data: [], error: null };
  const notes = must<Array<{ account_id: string }>>("the call notes", reads[0] ?? empty);
  const briefs = must<Array<{ account_id: string }>>("the briefs", reads[1] ?? empty);
  const impls = must<Array<{ deal_id: string; owner_id: string | null }>>(
    "the owners",
    reads[2] ?? empty,
  );
  const sent = must<NudgedRow[]>("what was already sent", reads[3] ?? empty);
  const history = must<Array<{ account_id: string; to_stage: string; occurred_at: string }>>(
    "the stage history",
    reads[4] ?? empty,
  );

  const noteCount = new Map<string, number>();
  for (const n of notes) noteCount.set(n.account_id, (noteCount.get(n.account_id) ?? 0) + 1);
  const briefed = new Set(briefs.map((b) => b.account_id));
  const ownerByDeal = new Map<string, string | null>();
  for (const i of impls) if (!ownerByDeal.has(i.deal_id)) ownerByDeal.set(i.deal_id, i.owner_id);
  const record = nudgeRecord(sent);
  const ownerIds = [...new Set([...ownerByDeal.values()].filter(Boolean))] as string[];
  const members = must<Array<{ id: string; name: string; email: string | null }>>(
    "the owners' names",
    ownerIds.length
      ? await db().from("team_members").select("id,name,email").in("id", ownerIds)
      : empty,
  );
  const memberById = new Map(members.map((m) => [String(m.id), m]));
  const { MANAGER_ROLES } = await import("./tickets.server");
  const managers = must<Array<{ email: string | null }>>(
    "the managers",
    await db().from("portal_profiles").select("email").in("role", MANAGER_ROLES),
  )
    .map((p) => p.email)
    .filter(Boolean) as string[];
  const { sendEmail } = await import("./server/email");
  const { audit } = await import("./server/audit");

  /** The first sweep's rows, written together; the stamp waits on them. */
  const baselineRows: Array<Record<string, unknown>> = [];
  let sends = 0;
  for (const d of rows) {
    const id = String(d.id);
    const intake = readIntake(d.intake);
    const ownerId = ownerByDeal.get(id) ?? null;
    const owner = ownerId ? (memberById.get(ownerId) ?? null) : null;
    const hist = history.filter((h) => h.account_id === id);
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
    const kickoffOn = kickoffEntryDate(String(d.stage), d.stage_entered_at, hist);
    const overdueCalls = isOnboardingStage(String(d.stage))
      ? timeline.milestones
          .filter(
            (m) =>
              m.kind === "call" &&
              !m.doneOn &&
              m.date < today &&
              !plannedBeforeKickoff(m, kickoffOn),
          )
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
      const seen = record.get(`${id}|${n.key}`);
      if (seen?.done) {
        run.skipped += 1;
        continue;
      }
      if (baseline) {
        // Recorded whoever it would go to, even nobody (no managers yet).
        baselineRows.push({
          actor_type: "system",
          actor_id: null,
          action: "deal.nudged",
          entity_type: "account",
          entity_id: id,
          payload: { key: n.key, level: n.level, to: [], baseline: true },
        });
        continue;
      }
      const to = recipients(n, owner?.email ?? null, managers).filter(
        (r) => !seen?.to.has(r.email.toLowerCase()),
      );
      if (!to.length) {
        run.skipped += 1;
        continue;
      }
      // Claimed for this hour before anything is sent: an overlapping sweep
      // gets a unique violation and leaves it alone.
      const claim = await db()
        .from("portal_audit_log")
        .insert({
          actor_type: "system",
          actor_id: null,
          action: NUDGE_CLAIM_ACTION,
          entity_type: "account",
          entity_id: id,
          payload: { key: n.key, claim: `${n.key}@${hour}` },
        });
      if (claim.error) {
        if (claim.error.code !== "23505")
          console.error("[nudge] could not claim; not sending", n.key, claim.error);
        run.skipped += 1;
        continue;
      }
      const link = d.customer_id
        ? `${appUrl()}/customers/${d.customer_id}`
        : `${appUrl()}/deals/${id}`;
      const ok: string[] = [];
      const failed: string[] = [];
      for (const r of to) {
        if (sends > 0 && gap > 0) await sleep(gap);
        sends += 1;
        try {
          await sendEmail({
            to: r.email,
            kind: r.asOwner ? "assignment" : "notification",
            subject: n.subject,
            html: `<div style="font-family:sans-serif;max-width:560px;color:#0a1628"><p>${esc(n.line)}</p><p><a href="${link}" style="color:#039de7">Open the checklist</a></p><p style="font-size:12px;color:#888">GoCanvas Handoff Hub · one reminder per step</p></div>`,
          });
          ok.push(r.email);
        } catch (e) {
          console.error("[nudge] could not send", e);
          failed.push(r.email);
        }
      }
      run.failed += failed.length;
      // Nothing went through: no row, so the whole nudge is tried next hour.
      if (!ok.length) continue;
      await audit({
        actor_type: "system",
        actor_id: null,
        action: "deal.nudged",
        entity_type: "account",
        entity_id: id,
        payload: {
          key: n.key,
          level: n.level,
          to: ok,
          ...(failed.length ? { failed } : {}),
        },
      });
      run.sent += 1;
    }
  }

  if (baseline) {
    // The stamp only once every baseline row is saved: a stamp over missing
    // rows would mail all of it next hour.
    for (let i = 0; i < baselineRows.length; i += BASELINE_CHUNK) {
      const { error } = await db()
        .from("portal_audit_log")
        .insert(baselineRows.slice(i, i + BASELINE_CHUNK));
      if (error) {
        console.error("[nudge] could not record the baseline; not stamping it", error);
        return { ...run, halted: `could not record the baseline: ${error.message}` };
      }
      run.baselined += Math.min(BASELINE_CHUNK, baselineRows.length - i);
    }
    const { error } = await db().from("portal_app_config").upsert(
      {
        key: NUDGE_BASELINE_KEY,
        value: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) console.error("[nudge] could not stamp the baseline", error);
  }
  return run;
}

/** The claim a run writes before sending a nudge; one per deal, key and hour (0081). */
export const NUDGE_CLAIM_ACTION = "deal.nudge_claim";

const BASELINE_CHUNK = 500;

/**
 * What the audit log says was already said, per deal and nudge key: who
 * heard it, and whether it is finished — a baseline row, or a row with no
 * failed recipients left (an older row with no lists at all counts too).
 */
export function nudgeRecord(
  rows: ReadonlyArray<NudgedRow>,
): Map<string, { done: boolean; to: Set<string> }> {
  const out = new Map<string, { done: boolean; to: Set<string> }>();
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).toLowerCase()) : [];
  for (const r of rows) {
    const key = `${r.entity_id}|${r.payload?.key ?? ""}`;
    const entry = out.get(key) ?? { done: false, to: new Set<string>() };
    for (const e of list(r.payload?.to)) entry.to.add(e);
    if (r.payload?.baseline === true || list(r.payload?.failed).length === 0) entry.done = true;
    out.set(key, entry);
  }
  return out;
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
