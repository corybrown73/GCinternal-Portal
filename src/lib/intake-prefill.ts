import {
  COMPANY_SIZES,
  INDUSTRIES,
  isServiceName,
  type AiOwnedField,
  type IntakeAnswers,
} from "./intake-answers";
import type { BriefJson } from "./server/schemas";
import { synthesisFromBrief } from "./welcome-synthesis";

/**
 * The AI reading of the calls and the SOW, written into the intake.
 *
 * WHO WINS. A field a person has answered is theirs: the reading never
 * writes it again (`person_set`, and any answer typed before this existed).
 * A field the reading filled last time is the reading's: a new reading —
 * after a new call, or a re-uploaded SOW — refreshes it (`ai_filled`). A
 * blank is anybody's. So "Fill in the rest" can be pressed as often as the
 * sources change without undoing a single thing a person typed.
 *
 * Every field it writes records the words it came from (`ai_sources`).
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
  const ob = b.onboarding ?? null;

  const aiFilled = new Set(intake.ai_filled);
  const sources: IntakeAnswers["ai_sources"] = { ...intake.ai_sources };
  const blank: Record<AiOwnedField, boolean> = {
    path: intake.path === null,
    training_only: intake.training_only === false,
    forms_built: intake.forms_built === null,
    wanted_forms: intake.wanted_forms.length === 0,
    current_process: !intake.current_process,
    solutions_involved: intake.solutions_involved === null,
    industry: !intake.industry,
    company_size: !intake.company_size,
    field_users: intake.field_users == null,
  };
  const may = (f: AiOwnedField) => !intake.person_set.includes(f) && (blank[f] || aiFilled.has(f));
  const write = <K extends AiOwnedField>(
    f: K,
    value: IntakeAnswers[K],
    label: string,
    from?: { quote: string; source: string } | null,
  ) => {
    if (!may(f)) return;
    if (JSON.stringify(intake[f]) === JSON.stringify(value)) {
      aiFilled.add(f);
      return;
    }
    (patch as Record<string, unknown>)[f] = value;
    aiFilled.add(f);
    if (from && from.quote)
      sources[f] = { quote: from.quote.slice(0, 400), source: from.source.slice(0, 200) };
    else delete sources[f];
    filled.push(label);
  };

  // THE FLOW. The checked reading names it with the words that decide it;
  // without one, the older word tests suggest it. Field Fusion is only ever
  // suggested: picking it starts Liesl's setup gate, which a person decides.
  const said = `${notes ?? ""}\n${JSON.stringify(b)}`;
  const suggested =
    ob?.flow ??
    (mentionsFieldFusion(said)
      ? "field_fusion"
      : mentionsDeviceMagic(said)
        ? "dm_conversion"
        : b.expansion && (b.expansion.integration_target || b.expansion.form_already_built)
          ? "existing"
          : null);
  // Suggested only while nobody has picked one, and said so.
  if (suggested && intake.path === null && intake.path_suggested !== suggested) {
    patch.path_suggested = suggested;
    if (!(ob?.flow && ob.flow !== "field_fusion" && may("path"))) {
      filled.push(
        `a suggested flow (${
          suggested === "field_fusion"
            ? "Field Fusion"
            : suggested === "dm_conversion"
              ? "Device Magic conversion"
              : suggested === "existing"
                ? "existing account"
                : "new customer"
        })`,
      );
    }
  }
  if (ob?.flow && ob.flow !== "field_fusion") {
    write("path", ob.flow, "the onboarding flow", ob.flow_evidence);
  }

  // Training only, and whether services were bought.
  if (ob?.training_only === true) write("training_only", true, "training only");
  const involved = ob?.solutions_involved ?? (b.expansion?.integration_target ? true : null);
  if (involved !== null) write("solutions_involved", involved, "integrations involved");

  // How the job runs today.
  const process = ob?.current_process?.summary?.trim() || synth?.currentProcess || null;
  if (process) {
    const before = patch.current_process;
    write("current_process", process, "the process today", ob?.current_process ?? null);
    // Marked as the model's paraphrase until a person confirms or retypes it.
    if (patch.current_process !== before) patch.current_process_source = "ai";
  }

  // THE FORMS, first form first. From the checked reading when there is
  // one — every entry a real form, quoted — else from the brief's scope
  // list with the services taken out.
  const forms =
    ob && ob.forms.length
      ? ob.forms.map((f) => ({ name: f.name, from: { quote: f.quote, source: f.source } }))
      : (b.kickoff?.scope ?? [])
          .map((x) => x.workflow?.trim())
          .filter((n): n is string => Boolean(n) && !isServiceName(n))
          .map((name) => ({ name, from: null }));
  if (forms.length && !intake.training_only && !(ob?.training_only === true)) {
    write(
      "wanted_forms",
      forms.slice(0, 8).map((f, i) => ({
        id: `syn-${i + 1}`,
        name: f.name.slice(0, 160),
        template_id: null,
      })),
      forms.length === 1 ? "the first form" : `${Math.min(forms.length, 8)} forms to build`,
      forms[0]!.from,
    );
    write("forms_built", false, "forms to build together");
  }

  // The four facts the intake asks first, when the notes stated them.
  const acct = b.account;
  if (acct) {
    if (acct.industry && (INDUSTRIES as readonly string[]).includes(acct.industry)) {
      write("industry", acct.industry, "the industry");
    }
    if (acct.company_size && (COMPANY_SIZES as readonly string[]).includes(acct.company_size)) {
      write("company_size", acct.company_size, "company size");
    }
    if (
      typeof acct.field_users === "number" &&
      Number.isInteger(acct.field_users) &&
      acct.field_users > 0
    ) {
      write("field_users", acct.field_users, "people in the field");
    }
  }
  if (patch.field_users == null && intake.field_users == null && b.kickoff?.licensed_seats) {
    const n = Number(/\d[\d,]*/.exec(b.kickoff.licensed_seats)?.[0]?.replace(/,/g, ""));
    if (Number.isInteger(n) && n > 0) write("field_users", n, "people in the field");
  }

  // Integrations and other services come from the SOW read, never from the
  // calls. A system mentioned on a call is a wish; a system on the SOW is a
  // sale, and the plan is built from what was sold.

  if (filled.length || patch.path_suggested) {
    patch.ai_filled = [...aiFilled];
    patch.ai_sources = sources;
  }
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
