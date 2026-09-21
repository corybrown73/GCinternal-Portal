import type { ServicePlan, Timeline } from "./onboarding-timeline";
import { shortDay } from "./onboarding-timeline";

/* ---------- deck arithmetic and wording ---------- */

/**
 * The customer's time in phase 1: every call on the phase, the form's two
 * and each service's, plus the homework. The old line counted the form's
 * two calls only and read "90 minutes" to a customer whose Monday held
 * three and a half hours of sessions.
 */
export function phaseOneTime(t: Timeline, kickoffMinutes: number, workingMinutes: number): string {
  const serviceCalls = t.alongside.flatMap((svc) =>
    svc.milestones.filter((m) => m.kind === "call" && m.minutes),
  );
  const minutes =
    kickoffMinutes + workingMinutes + serviceCalls.reduce((sum, m) => sum + (m.minutes ?? 0), 0);
  const calls = 2 + serviceCalls.length;
  const homework = 15 + 5 * t.alongside.length;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const time = h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
  return `${time} on ${calls} call${calls === 1 ? "" : "s"} · ${homework} min homework`;
}

/** When a service's ask is needed, next to the shared homework due date. */
export function needTiming(svc: ServicePlan, homeworkDue: string | null): string {
  // The SOW wrote its own deadline into the ask ("within 10 business days
  // of kickoff"): repeating a different one beside it is the contradiction.
  if (/within \d+|by [A-Z][a-z]{2}|no later than|business days/i.test(svc.needs)) return "";
  const first = svc.milestones.find((m) => m.kind === "call") ?? svc.milestones[0];
  if (!first) return "";
  if (homeworkDue && first.date > homeworkDue) return ` Needed by ${shortDay(first.date)}.`;
  return ` Bring it to the ${first.label.toLowerCase()} on ${shortDay(first.date)}.`;
}

const EXEC = /vp|vice president|president|ceo|coo|cfo|owner|sponsor|director|buyer|principal/i;
const OPS = /operations|\bops\b|manager|superintendent|foreman|supervisor|lead|coordinator/i;
const OFFICE = /admin|office|dispatch|controller|accounting|billing|bookkeep|hr\b/i;
const SYSTEMS = /\bit\b|systems|technology|erp|data|analyst|engineer|integration/i;
const FIELD = /field|technician|tech\b|crew|inspector|assessor|driver/i;

/**
 * One line on what a customer-side person does, from their title. Two people
 * on one slide never get the same line: the second unnamed role gets the
 * second wording.
 */
export function roleBlurb(role: string | null, slot: "champion" | "other" | "other2"): string {
  const r = role ?? "";
  if (EXEC.test(r))
    return slot === "champion"
      ? "Sponsors the project on your side. Decides what good looks like, and what comes next."
      : "Sponsors the project. Hears the results at the end and decides what comes next.";
  if (SYSTEMS.test(r))
    return "Owns the systems end: logins, the data we load, and the integration when there is one.";
  if (OFFICE.test(r))
    return "Runs the office side: what happens after a submission — the export, the PDF, the follow-up.";
  if (FIELD.test(r)) return "In the field. Runs the form on real jobs and says what to fix.";
  if (OPS.test(r) || slot === "champion")
    return slot === "champion"
      ? "Owns the plan on your side. Makes the last changes to the form in the working session."
      : "Owns the day-to-day. Decides what the form asks and who runs it first.";
  return slot === "other2"
    ? "Named on the calls. Reviews the form before the crew gets it."
    : "Named on the calls. Signs off on the parts that touch their work.";
}
