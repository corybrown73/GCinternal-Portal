/**
 * Words this product uses inconsistently, given one home.
 *
 * The audit found "TIS" 21 times in src/ — including in user-visible copy —
 * and never once expanded, anywhere in the repo. It is the implementation-side
 * owner role: Technical Implementation Specialist.
 *
 * The acronym is expanded AT FIRST USE PER SURFACE rather than everywhere:
 * "Waiting on Technical Implementation Specialist to resolve the open issue" in
 * a dense triage list is worse copy, not better. Use TIS_FULL where a reader
 * meets the term for the first time on a page, TIS_SHORT thereafter.
 */
export const TIS_SHORT = "TIS";
export const TIS_FULL = "Technical Implementation Specialist";

/**
 * The final lifecycle stage had one id and two rendered names. The id
 * (`graduate-to-cs`) and its aliases are parsed from stored data and are NOT
 * renamed; only what a reader sees is unified, on the canonical label already
 * declared in lifecycle.ts.
 */
export const FINAL_STAGE_LABEL = "Handover to Customer Success";
