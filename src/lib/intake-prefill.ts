import {
  COMPANY_SIZES,
  INDUSTRIES,
  isServiceName,
  type AiOwnedField,
  type HandoffAnswer,
  type IntakeAnswers,
} from "./intake-answers";
import { focusItemsFromBrief } from "./implementation-focus";
import { normalizeServiceKey } from "./onboarding-services";
import { answerSource, handoffQuestion, isAnswered, type HandoffValue } from "./sales-handoff";
import type { BriefJson } from "./server/schemas";
import type { SowReading } from "./sow-plan";
import { synthesisFromBrief } from "./welcome-synthesis";

/** What the kept SOW reading lends the prefill: the seats and the forms the document names. */
export type SowReadingFacts = Pick<SowReading, "seats" | "forms" | "first_form">;

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
 *
 * The kept SOW reading stands behind the calls: its seats fill the field
 * count when the calls gave none, its forms the list when the calls named
 * none. The calls' own words win where both speak.
 */
export function prefillFromSynthesis(
  intake: IntakeAnswers,
  brief: unknown,
  /** The call notes as pasted, for what the brief did not keep verbatim. */
  notes?: string | null,
  opts: { sowReading?: SowReadingFacts | null } = {},
): { patch: Partial<IntakeAnswers>; filled: string[] } {
  const patch: Partial<IntakeAnswers> = {};
  const filled: string[] = [];
  const b = brief as Partial<BriefJson> | null | undefined;
  if (!b || typeof b !== "object") return { patch, filled };
  const synth = synthesisFromBrief(b);
  const ob = b.onboarding ?? null;
  const sow = opts.sowReading ?? null;

  const aiFilled = new Set(intake.ai_filled);
  // Written by the reading before ownership was tracked: the forms it made
  // carry "syn-" ids (the SOW step's "sow-"), the process it wrote is
  // marked "ai". Still the AI's.
  if (
    intake.wanted_forms.length &&
    intake.wanted_forms.every((f) => /^(syn|sow)-/.test(f.id)) &&
    !intake.person_set.includes("wanted_forms")
  ) {
    aiFilled.add("wanted_forms");
  }
  if (intake.current_process_source === "ai" && !intake.person_set.includes("current_process")) {
    aiFilled.add("current_process");
  }
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
  // list with the services taken out; and when the calls named none, the
  // forms the SOW sells.
  const fromCalls =
    ob && ob.forms.length
      ? ob.forms.map((f) => ({ name: f.name, from: { quote: f.quote, source: f.source } }))
      : (b.kickoff?.scope ?? [])
          .map((x) => x.workflow?.trim())
          .filter((n): n is string => Boolean(n) && !isServiceName(n))
          .map((name) => ({ name, from: null }));
  const forms = fromCalls.length ? fromCalls : sowForms(sow);
  const idPrefix = fromCalls.length ? "syn" : "sow";
  const existingAccount = intake.path === "existing" || ob?.flow === "existing";
  if (forms.length && !intake.training_only && !(ob?.training_only === true) && !existingAccount) {
    write(
      "wanted_forms",
      forms.slice(0, 8).map((f, i) => ({
        id: `${idPrefix}-${i + 1}`,
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
  const seatsInCalls =
    (typeof acct?.field_users === "number" && acct.field_users > 0) ||
    Number(/\d[\d,]*/.exec(b.kickoff?.licensed_seats ?? "")?.[0]?.replace(/,/g, "")) > 0;
  if (patch.field_users == null && intake.field_users == null && b.kickoff?.licensed_seats) {
    const n = Number(/\d[\d,]*/.exec(b.kickoff.licensed_seats)?.[0]?.replace(/,/g, ""));
    if (Number.isInteger(n) && n > 0) write("field_users", n, "people in the field");
  }
  // The SOW's seat count, when the calls gave none. The SOW step may have
  // written it already: the same value is then only claimed, not refilled.
  if (patch.field_users == null && !seatsInCalls && sow?.seats && sow.seats > 0) {
    write("field_users", sow.seats, "people in the field", {
      quote: `${sow.seats} seats`,
      source: "SOW",
    });
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

/** The forms the SOW names, the first form first, one entry per form, each with the words it rests on. */
function sowForms(
  sow: SowReadingFacts | null,
): Array<{ name: string; from: { quote: string; source: string } | null }> {
  if (!sow) return [];
  const first = sow.first_form?.trim().toLowerCase() ?? null;
  const seen = new Set<string>();
  const named = sow.forms
    .map((f) => ({ name: f.name.trim(), quote: f.quote }))
    .filter((f) => f.name);
  const isFirst = (f: { name: string }) => f.name.toLowerCase() === first;
  return [...named.filter(isFirst), ...named.filter((f) => !isFirst(f))]
    .filter((f) => {
      const key = normalizeServiceKey(f.name, "paid_form");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((f) => ({ name: f.name, from: f.quote ? { quote: f.quote, source: "SOW" } : null }));
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

/* ------------------------------------------------- the handoff's blanks */

/** The customer-side questions the brief's welcome block answers, by the same key. */
const CUSTOMER_SIDE_KEYS = ["forms_today", "data_lists", "devices", "kickoff_attendees"] as const;

/**
 * The AI reading fills the Sales handoff's blanks the same way: an answer
 * nobody has given, or that the AI gave last time, from what the brief
 * says — never over a person's or the customer's words. Contacts come by
 * the stakeholder's kind (the older word test stands in for a brief that
 * predates kinds); the customer's own answers land as the AI's, which the
 * welcome link shows as "to confirm" and the readiness check counts as
 * outstanding until they do. Commitments are drafted only from entries
 * that say a promise was made, never over "nothing beyond the SOW", and
 * the Sales gate still waits for a person to say what was promised.
 */
export function prefillHandoffFromSynthesis(
  intake: IntakeAnswers,
  brief: unknown,
  at: string = new Date().toISOString(),
): { answers: Record<string, HandoffAnswer>; filled: string[] } {
  const answers: Record<string, HandoffAnswer> = {};
  const filled: string[] = [];
  const b = brief as Partial<BriefJson> | null | undefined;
  if (!b || typeof b !== "object") return { answers, filled };
  const may = (key: string) => {
    const src = answerSource(intake, key);
    return src === null || src === "ai";
  };
  const write = (key: string, value: HandoffValue, quote: string | null) => {
    if (!isAnswered(value) || !may(key)) return;
    const q = handoffQuestion(key);
    const current = intake.handoff.answers[key];
    if (current && JSON.stringify(current.value) === JSON.stringify(value)) return;
    answers[key] = { value, source: "ai", at, by: null, quote: quote?.slice(0, 400) ?? null };
    filled.push(q?.label ?? key);
  };

  const goals = (b.goals ?? []).filter(Boolean);
  if (goals.length) write("business_outcome", goals.slice(0, 3).join("\n"), goals[0] ?? null);
  const day90 = b.kickoff?.day_90_definition ?? null;
  if (day90) write("success_measure", day90, day90);

  // What was promised, when the brief states it: the "what we know" entries
  // whose topic says a promise was made. "Included services" describes the
  // SOW, not a promise beyond it, so it is not one of them. Nothing stated
  // leaves the question alone.
  if (!intake.handoff.commitments_none) {
    const promised = (b.what_we_know ?? [])
      .filter((w) =>
        /promis|commit|agreed to|thrown in|at no (?:extra )?(?:cost|charge)|free of charge/i.test(
          w.topic,
        ),
      )
      .map((w) => w.detail.trim())
      .filter(Boolean);
    if (promised.length) write("commitments", promised.join("\n"), promised[0] ?? null);
  }

  // Contacts: "Name · role · email", as the question asks.
  const people = b.stakeholders ?? [];
  const line = (p: { name: string; role: string; email?: string | null | undefined }) =>
    [p.name, p.role, p.email ?? null]
      .map((s) => s?.trim() ?? "")
      .filter(Boolean)
      .join(" · ");
  const typed = people.some((p) => p.role_kind);
  const byKind = (kind: string) => people.find((p) => p.role_kind === kind) ?? null;
  const decider = typed
    ? byKind("decision_maker")
    : people.find((p) =>
        /decision|owner|director|vp|vice|president|ceo|cfo|coo|founder|principal|head of/i.test(
          `${p.role} ${p.notes}`,
        ),
      );
  if (decider) write("contact_decision_maker", line(decider), decider.notes || null);
  const builder = typed
    ? byKind("admin_builder")
    : people.find(
        (p) =>
          p !== decider &&
          /admin|build|office|coordinator|manager|analyst|it\b|systems|dispatcher/i.test(
            `${p.role} ${p.notes}`,
          ),
      );
  if (builder) write("contact_admin_builder", line(builder), builder.notes || null);
  const daily = typed ? byKind("day_to_day") : null;
  if (daily) write("contact_day_to_day", line(daily), daily.notes || null);

  const isoDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  const deadline = (b.dates ?? []).find((d) => d.type === "deadline" && isoDay(d.date));
  if (deadline) write("desired_launch_date", deadline.date, deadline.quote);
  const start = (b.dates ?? []).find((d) => d.type === "start" && isoDay(d.date));
  if (start) {
    write("agreed_start", `${start.date}${start.quote ? ` — ${start.quote}` : ""}`, start.quote);
  }

  const systems = [
    ...(b.kickoff?.integrations ?? []),
    ...(b.kickoff?.it_contact ? [`IT contact: ${b.kickoff.it_contact}`] : []),
  ].filter(Boolean);
  if (systems.length) write("system_requirements", systems.join("\n"), systems[0] ?? null);

  const open = (b.risks_open_items ?? []).filter(Boolean);
  if (open.length) write("open_questions", open.join("\n"), open[0] ?? null);

  // The customer's half, drafted from the calls for them to confirm.
  for (const key of CUSTOMER_SIDE_KEYS) {
    const v = b.welcome?.customer_side?.[key] ?? null;
    if (v?.value?.trim()) write(key, v.value.trim(), v.quote || null);
  }

  return { answers, filled };
}

/* ------------------------------------------- the welcome page's own facts */

/**
 * What the brief's welcome block puts on the record beside the intake and
 * the handoff: the workflow story when nobody has written one, the focus
 * items when the list is still the proposal's own, the field tester when
 * the plan has none. All of it is the AI's until a person confirms it — the
 * story and the focus carry their own `validated_at`, the tester is owned
 * through `ai_filled` like the intake's other answers. `timeline` holds
 * the plan keys, merged into intake.timeline by the caller.
 */
export function prefillWelcomeFromBrief(
  intake: IntakeAnswers,
  brief: unknown,
): { patch: Partial<IntakeAnswers>; timeline: Record<string, unknown> | null; filled: string[] } {
  const patch: Partial<IntakeAnswers> = {};
  const filled: string[] = [];
  let timeline: Record<string, unknown> | null = null;
  const b = brief as Partial<BriefJson> | null | undefined;
  const w = b && typeof b === "object" ? (b.welcome ?? null) : null;
  if (!w) return { patch, timeline, filled };

  const story = intake.workflow_story;
  const leg = (s: string | null | undefined) => s?.trim().slice(0, 4000) || null;
  const drafted = {
    before: leg(w.workflow_story?.before),
    during: leg(w.workflow_story?.during),
    after: leg(w.workflow_story?.after),
  };
  if (
    story.before === null &&
    story.during === null &&
    story.after === null &&
    story.validated_at === null &&
    (drafted.before || drafted.during || drafted.after)
  ) {
    patch.workflow_story = { ...drafted, validated_at: null, validated_by: null };
    filled.push("the workflow story");
  }

  // What this prefill owns, on top of what the intake already marks as the
  // reading's; written once at the end, whichever blocks landed.
  const aiFilled = new Set(intake.ai_filled);

  const items = focusItemsFromBrief(intake, w.focus_items ?? []);
  if (items && JSON.stringify(items) !== JSON.stringify(intake.implementation_focus.items)) {
    patch.implementation_focus = { items, validated_at: null, validated_by: null };
    // Marked as the reading's, so Kickoff View keeps its flagged items off
    // the slide until a person has looked, and a person's save (which
    // claims the key) makes the list theirs.
    aiFilled.add("implementation_focus");
    const added = items.filter((i) => i.id.startsWith("focus-ai-")).length;
    filled.push(`${added} focus item${added === 1 ? "" : "s"}`);
  }

  const tester = w.field_tester;
  if (tester?.name?.trim() && !intake.timeline.field_tester) {
    const name = [tester.name.trim(), tester.role?.trim() || null]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 120);
    timeline = { field_tester: name };
    aiFilled.add("field_tester");
    patch.ai_sources = {
      ...intake.ai_sources,
      field_tester: { quote: (tester.quote || name).slice(0, 400), source: "the calls" },
    };
    filled.push("the field tester");
  }

  if (aiFilled.size !== intake.ai_filled.length) patch.ai_filled = [...aiFilled];
  return { patch, timeline, filled };
}
