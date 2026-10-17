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
  // Only the SOW (its document or its reference) clears the gate today: the
  // database gate (0070) refuses a contract-only deal, so the words say SOW.
  // TODO(0087): once migration 0087 (the paperwork gate) is applied, say
  // "signed SOW or contract" again and let missingForClosedWon read paperworkOnFile.
  sow: "signed SOW",
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

/**
 * What paperwork a deal has on file, by one rule every screen reads:
 *
 *  - "sow": the signed SOW uploaded (sow_document_path), linked ("Or link to
 *    it", sow_document_url), or its reference typed in (sow_reference);
 *  - "contract": no SOW, but the signed contract is uploaded (intake.contract);
 *  - "no_sow": somebody said there is no SOW and wrote down why
 *    (intake.has_sow === false and intake.no_sow_reason).
 *
 * null when none of these is true. A bare "No" with neither a contract nor a
 * reason is not paperwork. Pure: the intake may be the raw jsonb or read.
 */
export type PaperworkOnFile = "sow" | "contract" | "no_sow";

export type PaperworkFacts = {
  sow_document_path?: string | null;
  sow_document_url?: string | null;
  sow_reference?: string | null;
  intake?: unknown;
};

const filled = (v: unknown): boolean => typeof v === "string" && v.trim() !== "";

export function paperworkOnFile(row: PaperworkFacts): PaperworkOnFile | null {
  if (filled(row.sow_document_path) || filled(row.sow_document_url) || filled(row.sow_reference)) {
    return "sow";
  }
  const intake = (row.intake && typeof row.intake === "object" ? row.intake : {}) as {
    has_sow?: unknown;
    contract?: { path?: unknown } | null;
    no_sow_reason?: unknown;
  };
  if (intake.contract && typeof intake.contract === "object" && filled(intake.contract.path)) {
    return "contract";
  }
  if (intake.has_sow === false && filled(intake.no_sow_reason)) return "no_sow";
  return null;
}

/** How each kind of paperwork reads on a checklist line. */
export function paperworkSummary(kind: PaperworkOnFile | null, intake?: unknown): string | null {
  if (kind === "sow") return "SOW on file";
  if (kind === "contract") return "Contract on file";
  if (kind === "no_sow") {
    const why = (intake as { no_sow_reason?: unknown } | null | undefined)?.no_sow_reason;
    return filled(why) ? `No SOW: ${String(why).trim()}` : "No SOW";
  }
  return null;
}

/**
 * Kept for callers that only need yes or no: true when paperworkOnFile
 * finds a SOW, a contract or a stated reason there is no SOW.
 */
export function hasSowOnFile(row: PaperworkFacts): boolean {
  return paperworkOnFile(row) !== null;
}

/**
 * What a deal still lacks for Closed Won, from the facts the record holds.
 *
 * Deliberately narrower than paperworkOnFile: the database gate (0070) still
 * accepts only the SOW's document path or a trimmed reference, so the app
 * asks for exactly that and a move it lets through is never refused below.
 * TODO(0087): when migration 0087 (the paperwork gate: SOW link, contract or
 * a stated no-SOW reason) is applied in production, read paperworkOnFile here.
 */
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
