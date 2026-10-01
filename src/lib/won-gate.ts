import { STAGE_LABELS, STAGES, type AccountStage } from "./presale-stages";

/**
 * The Closed Won gate, in words both sides read.
 *
 * Closed Won starts everything downstream — the claim email, the plan, the
 * customer's page — so a person cannot move a deal there without the two
 * things they all read: a call note and the signed SOW (or contract). The
 * server refuses the move and says which is missing; the page turns that
 * into buttons. A manager may insist, and the move records that they did.
 * Integrations (Zapier, the API, a CSV import) are not people: a deal they
 * deliver in Closed Won is a fact about Salesforce, and stays.
 */
/** The sentence a refused move starts with, for the stage it was going to. */
export function gatePrefix(stage: AccountStage): string {
  return `Not ready for ${STAGE_LABELS[stage]}:`;
}
export const WON_GATE_PREFIX = gatePrefix("closed_won");
/** The same shape at the other end: Implementation Complete needs the steps before it done. */
export const COMPLETE_GATE_PREFIX = gatePrefix("onboarding_complete");

export type WonGateMissing = "notes" | "sow" | "checklist";

export const WON_GATE_LABEL: Record<WonGateMissing, string> = {
  notes: "Gong brief or call note",
  sow: "signed SOW or contract",
  checklist: "every checklist step done",
};

/** Which gate a thrown message came from, or null for some other error. */
export function gateTarget(message: string): AccountStage | null {
  return STAGES.find((s) => message.includes(gatePrefix(s))) ?? null;
}

/**
 * The sentence the server throws when the steps before a stage are not
 * done — Pre-Kickoff into Get it working, and every stage after, the same way.
 */
export function completeGateMessage(
  open: number,
  toStage: AccountStage = "onboarding_complete",
): string {
  return `${gatePrefix(toStage)} ${open} checklist step${open === 1 ? " is" : "s are"} still open. [checklist]`;
}

/** What a deal still lacks, from the facts the record holds. */
export function missingForClosedWon(facts: {
  reports: number;
  sowPath: string | null | undefined;
  sowReference: string | null | undefined;
}): WonGateMissing[] {
  const missing: WonGateMissing[] = [];
  if (facts.reports <= 0) missing.push("notes");
  if (!facts.sowPath && !facts.sowReference?.trim()) missing.push("sow");
  return missing;
}

/** The sentence the server throws. Stable, so the page can read it back. */
export function wonGateMessage(missing: readonly WonGateMissing[]): string {
  return `${WON_GATE_PREFIX} the deal has no ${missing.map((m) => WON_GATE_LABEL[m]).join(" and no ")}. [${missing.join(",")}]`;
}

/** The missing pieces named in a thrown message, or null when it is some other error. */
export function parseWonGate(message: string): WonGateMissing[] | null {
  const target = gateTarget(message);
  if (!target) return null;
  const m = /\[([a-z,]+)\]\s*$/.exec(message);
  const keys = (m?.[1] ?? "")
    .split(",")
    .filter((k): k is WonGateMissing => k === "notes" || k === "sow" || k === "checklist");
  if (keys.length) return keys;
  return target === "closed_won" ? ["notes", "sow"] : ["checklist"];
}

/** The note a forced move carries: the database lets it through on this prefix alone. */
export const FORCE_NOTE_PREFIX = "force:";
export function forcedNote(note?: string | null): string {
  const why = note?.trim() ? note.trim() : "Moved despite the Closed Won check";
  return `${FORCE_NOTE_PREFIX} ${why}`;
}
