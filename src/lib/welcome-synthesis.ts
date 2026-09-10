import type { BriefJson } from "./server/schemas";

/**
 * What the welcome page takes from an AI-synthesised brief.
 *
 * THE BRIEF IS READ, NOT COPIED. The synthesis is written from the sales
 * calls; the welcome page is what the customer sees. So it borrows only
 * where the intake is blank, and only the things a customer would recognise
 * as their own words: how the job runs today, the workflows they named as
 * coming next, who owns it on their side. Nothing here is invented — every
 * field is null when the brief did not say.
 */
export type WelcomeSynthesis = {
  /** "Today" in the customer's words, one or two sentences. */
  currentProcess: string | null;
  /** Workflows named for after the first form, with what each replaces. */
  nextUseCases: Array<{ name: string; objective: string | null }>;
  /** The customer-side owner, when the notes named one. */
  champion: { name: string; role: string | null } | null;
  /** What "good" looks like, in their words. */
  day90: string | null;
};

const CUSTOMER_ROLE =
  /champion|owner|sponsor|operations|ops|office|manager|director|president|ceo|coo|vp/i;
const OUR_SIDE = /gocanvas|account manager|solutions engineer|\bse\b|\bam\b/i;

export function synthesisFromBrief(raw: unknown): WelcomeSynthesis | null {
  const b = raw as Partial<BriefJson> | null | undefined;
  if (!b || typeof b !== "object") return null;

  const bullets = (b.current_process ?? [])
    .flatMap((s) => s.bullets ?? [])
    .map(clean)
    .filter(Boolean);
  const currentProcess = bullets.length ? sentence(bullets.slice(0, 3)) : null;

  const scope = b.kickoff?.scope ?? [];
  const nextUseCases = scope
    .slice(1)
    .map((s) => ({ name: clean(s.workflow), objective: s.replaces ? clean(s.replaces) : null }))
    .filter((s) => s.name)
    .slice(0, 3);

  const stakeholder = (b.stakeholders ?? []).find(
    (s) => s.name && !OUR_SIDE.test(`${s.role} ${s.notes}`) && CUSTOMER_ROLE.test(s.role ?? ""),
  );
  const champion = stakeholder
    ? { name: clean(stakeholder.name), role: stakeholder.role ? clean(stakeholder.role) : null }
    : null;

  const day90 = b.kickoff?.day_90_definition ? clean(b.kickoff.day_90_definition) : null;

  if (!currentProcess && !nextUseCases.length && !champion && !day90) return null;
  return { currentProcess, nextUseCases, champion, day90 };
}

function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Three bullets → one readable line: "A; b; c." */
function sentence(parts: string[]): string {
  const joined = parts
    .map((p) => p.replace(/[.;\s]+$/, ""))
    .map((p, i) => (i === 0 ? p : lower(p)))
    .join("; ");
  return `${joined}.`;
}

function lower(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s;
}
