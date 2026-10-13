import { businessDaysBetween } from "./onboarding-timeline";
import { type Nudge, overdueNudges } from "./stage-flow";

/**
 * A partner implementation's own overdue signals. They come from its recorded
 * milestones and work items, never the standard plan: the standard stage-age,
 * unclaimed and checklist nudges describe the standard journey, so they do not
 * apply to a partner, and nothing here reads them.
 */

export type PartnerOverdue = { key: string; label: string; date: string; businessDaysLate: number };

const DONE_MILESTONE = new Set(["completed", "complete", "done"]);
const DONE_WORK = new Set(["done", "skipped"]);

/** Overdue milestones and work items, per implementation, from dates the record holds. */
export function partnerOverdueByImplementation(args: {
  today: string;
  milestones: Array<{
    id: string;
    implementation_id: string;
    name: string;
    target_date: string | null;
    completed_date: string | null;
    status: string | null;
  }>;
  workItems: Array<{
    id: string;
    implementation_id: string;
    title: string;
    due_at: string | null;
    status: string | null;
  }>;
}): Map<string, PartnerOverdue[]> {
  const out = new Map<string, PartnerOverdue[]>();
  const add = (implId: string, item: PartnerOverdue) => {
    const list = out.get(implId) ?? [];
    list.push(item);
    out.set(implId, list);
  };
  for (const m of args.milestones) {
    if (!m.target_date || m.target_date >= args.today) continue;
    if (m.completed_date || DONE_MILESTONE.has((m.status ?? "").toLowerCase())) continue;
    add(m.implementation_id, {
      key: `m:${m.id}`,
      label: m.name,
      date: m.target_date,
      businessDaysLate: businessDaysBetween(m.target_date, args.today),
    });
  }
  for (const w of args.workItems) {
    if (!w.due_at) continue;
    const date = w.due_at.slice(0, 10);
    if (date >= args.today || DONE_WORK.has((w.status ?? "").toLowerCase())) continue;
    add(w.implementation_id, {
      key: `w:${w.id}`,
      label: w.title,
      date,
      businessDaysLate: businessDaysBetween(date, args.today),
    });
  }
  return out;
}

/** The nudges for a partner deal: its own overdue items, nothing standard. */
export function partnerNudges(args: {
  name: string;
  stage: string;
  enteredAt: string;
  overdue: PartnerOverdue[];
}): Nudge[] {
  return overdueNudges({
    name: args.name,
    visit: `partner:${args.stage}@${args.enteredAt.slice(0, 10)}`,
    overdueCalls: args.overdue,
  });
}
