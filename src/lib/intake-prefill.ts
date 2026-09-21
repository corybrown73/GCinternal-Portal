import { COMPANY_SIZES, INDUSTRIES, type IntakeAnswers } from "./intake-answers";
import type { BriefJson } from "./server/schemas";
import { synthesisFromBrief } from "./welcome-synthesis";

/**
 * The AI synthesis of the calls, written into the intake — blanks only.
 *
 * WHY BLANKS ONLY. The intake is what a person typed on a call with the
 * customer; the synthesis is what a model read out of the notes. Where the
 * person has said something, they win, every time. Where they have not,
 * the synthesis gets the field started: how the job runs today, the forms
 * they named, the seat count, the systems to connect. The person sees what
 * was filled and can change any of it — the same fields, the same panel.
 */
export function prefillFromSynthesis(
  intake: IntakeAnswers,
  brief: unknown,
  /** The call notes as pasted, for what the brief did not keep verbatim. */
  notes?: string | null,
): { patch: Partial<IntakeAnswers>; filled: string[] } {
  const patch: Partial<IntakeAnswers> = {};
  const filled: string[] = [];
  const b = brief as Partial<BriefJson> | null | undefined;
  if (!b || typeof b !== "object") return { patch, filled };
  const synth = synthesisFromBrief(b);

  // A customer moving off Device Magic: the calls say so long before a form
  // does. Read the notes as pasted and the brief's own text; only when
  // nobody has said which kind of account this is.
  // Field Fusion is a product, not a form build: the calls name it (or its
  // FFIQ setup) long before anything else does. Checked first, because a
  // Field Fusion customer may also mention the tool they are leaving.
  const said = `${notes ?? ""}\n${JSON.stringify(b)}`;
  if (intake.path === null && mentionsFieldFusion(said)) {
    patch.path = "field_fusion";
    filled.push("the path (Field Fusion — training journey)");
  } else if (intake.path === null && mentionsDeviceMagic(said)) {
    patch.path = "dm_conversion";
    filled.push("the path (Device Magic conversion)");
  }

  // The brief's own reading of "already runs GoCanvas, bought more" is the
  // path. Only when nobody has said yet.
  if (intake.path === null && !patch.path && b.expansion) {
    const ex = b.expansion;
    if (ex.integration_target || ex.form_already_built) {
      patch.path = "existing";
      filled.push("the path (existing account)");
    }
  }

  if (!intake.current_process && synth?.currentProcess) {
    patch.current_process = synth.currentProcess;
    // Marked as the model's paraphrase until a person confirms or retypes it.
    patch.current_process_source = "ai";
    filled.push("the process today");
  }

  const scope = (b.kickoff?.scope ?? []).map((s) => s.workflow?.trim()).filter(Boolean);
  if (!intake.wanted_forms.length && scope.length) {
    patch.wanted_forms = scope.slice(0, 8).map((name, i) => ({
      id: `syn-${i + 1}`,
      name: name.slice(0, 160),
      template_id: null,
    }));
    filled.push(
      `${scope.length === 1 ? "the first form" : `${Math.min(scope.length, 8)} forms to build`}`,
    );
  }

  // The four facts the intake asks first, when the notes stated them.
  const acct = b.account;
  if (acct) {
    if (
      !intake.industry &&
      acct.industry &&
      (INDUSTRIES as readonly string[]).includes(acct.industry)
    ) {
      patch.industry = acct.industry;
      filled.push("the industry");
    }
    if (
      !intake.company_size &&
      acct.company_size &&
      (COMPANY_SIZES as readonly string[]).includes(acct.company_size)
    ) {
      patch.company_size = acct.company_size;
      filled.push("company size");
    }
    if (
      intake.field_users == null &&
      typeof acct.field_users === "number" &&
      Number.isInteger(acct.field_users) &&
      acct.field_users > 0
    ) {
      patch.field_users = acct.field_users;
      filled.push("people in the field");
    }
  }

  if (patch.field_users == null && intake.field_users == null && b.kickoff?.licensed_seats) {
    const n = Number(/\d[\d,]*/.exec(b.kickoff.licensed_seats)?.[0]?.replace(/,/g, ""));
    if (Number.isInteger(n) && n > 0) {
      patch.field_users = n;
      filled.push("people in the field");
    }
  }

  // Integrations and other services come from the SOW read, never from the
  // calls. A system mentioned on a call is a wish; a system on the SOW is a
  // sale, and the plan is built from what was sold. The brief still lists
  // what was mentioned — the watch-outs read it against the SOW.

  return { patch, filled };
}

/**
 * "Device Magic", "DeviceMagic", or "DM" used as a product ("on DM", "from DM",
 * "DM forms", "DM to GoCanvas"). A bare "DM" for a direct message does not
 * count: it needs the product words around it.
 */
/** "Field Fusion", "FieldFusion", or its setup "FFIQ" — the product, named. */
export function mentionsFieldFusion(text: string): boolean {
  return /field\s*fusion|\bFFIQ\b/i.test(text);
}

export function mentionsDeviceMagic(text: string): boolean {
  if (/device\s*magic/i.test(text)) return true;
  return /\b(?:from|off|on|in|our|their|the|convert(?:ing)?|migrat(?:e|ing)|mov(?:e|ing)|replac(?:e|ing))\s+DM\b|\bDM\s+(?:forms?|to\s+(?:go\s*canvas|gc)|conversion|migration|account|users?|data|submissions?)\b/i.test(
    text,
  );
}
