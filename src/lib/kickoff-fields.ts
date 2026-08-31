import type { BriefJson } from "./server/schemas";

/**
 * The Client Kickoff Deck's data contract, filled from the portal.
 *
 * WHAT THE TEMPLATE ASKS FOR. `Client Kickoff Deck Template.dc.html` is driven
 * by a flat `kickoff-data` JSON block: every value is written into every
 * `[data-field="key"]` element, and the deck has 124 of them across 17 slides.
 * This module produces exactly that map. Field names below are the template's,
 * character for character — a rename there is a findable break here.
 *
 * WHERE WE DEVIATE, and why. The template leaves its example copy in place for
 * a key nobody filled. That is right for a designer previewing a layout and
 * wrong for a deck an AE presents: a kickoff that says "Acme Construction", or
 * promises to "cut safety incidents 25%", to a customer who is neither is the
 * worst failure this feature has. So unfilled keys are REPORTED, in `missing`,
 * and the renderer draws a visible placeholder instead of somebody else's
 * numbers.
 *
 * WHAT IS NOT FILLABLE IS NOT A BUG. Roles, training dates, licensed seats and
 * the next touchpoint have no home in this system, and the template's own
 * speaker notes say they are filled in before the call ("Every row needs a
 * human name, not a department"). They come back in `missing` so the AE gets a
 * list rather than a surprise in the meeting.
 *
 * PURE. No imports beyond a type; the whole thing is testable without a
 * database, which is what makes "does the deck invent a KPI when none is
 * recorded?" a question with an answer.
 */

export type KickoffPerson = { name: string; role: string };

export type KickoffStage = {
  name: string;
  intent: string | null;
  targetDays: number | null;
  /** Set only once the project is running and dates are real. */
  startsOn: string | null;
};

export type KickoffTask = {
  title: string;
  stage: string;
  owner: string | null;
  due: string | null;
};

export type KickoffRisk = {
  title: string;
  mitigation: string | null;
};

export type KickoffCriterion = {
  description: string;
  target: string | null;
};

export type KickoffRequirement = {
  title: string;
  inScope: boolean;
};

export type KickoffInput = {
  clientName: string;
  preparedAt: string;
  brief: BriefJson;
  /** The GoCanvas side. First is treated as the lead. */
  team: KickoffPerson[];
  /** The customer side, from the brief's stakeholders or the account's contacts. */
  clientPeople: KickoffPerson[];
  stages: KickoffStage[];
  customerTasks: KickoffTask[];
  risks: KickoffRisk[];
  successCriteria: KickoffCriterion[];
  requirements: KickoffRequirement[];
  /** Solution titles — the integrations slide. */
  solutions: string[];
  targetLaunchDate: string | null;
  itContact: KickoffPerson | null;
};

export type KickoffDeckData = {
  /** The template's `kickoff-data` block. Only keys we could actually fill. */
  fields: Record<string, string>;
  /**
   * Keys the portal has no source for, in template order. The renderer draws
   * a placeholder for each; the AE gets the list before the call.
   */
  missing: string[];
  /**
   * Optional slides to include. The template marks four as optional and its
   * notes say when to drop them; a slide with nothing to say is dropped.
   */
  optionalSlides: { about: boolean; integrations: boolean; support: boolean; risks: boolean };
};

/** Every field the template defines, in slide order. The authority for `missing`. */
export const TEMPLATE_FIELDS: readonly string[] = [
  "deck_eyebrow",
  "client_name",
  "gc_lead_name",
  "client_name_short",
  "client_person_1_name",
  "client_person_1_role",
  "client_person_2_name",
  "client_person_2_role",
  "client_person_3_name",
  "client_person_3_role",
  "gc_lead_role",
  "gc_person_2_name",
  "gc_person_2_role",
  "gc_person_3_name",
  "gc_person_3_role",
  "goal_1",
  "goal_1_detail",
  "goal_2",
  "goal_2_detail",
  "goal_3",
  "goal_3_detail",
  "goal_4",
  "goal_4_detail",
  // `kpi_n_metric` is OURS, not the template's: see buildKickoffData.
  "kpi_1_metric",
  "kpi_1_value",
  "kpi_1_label",
  "kpi_2_metric",
  "kpi_2_value",
  "kpi_2_label",
  "kpi_3_metric",
  "kpi_3_value",
  "kpi_3_label",
  "kpi_4_metric",
  "kpi_4_value",
  "kpi_4_label",
  "day_90_definition",
  "scope_1_workflow",
  "scope_1_replaces",
  "scope_1_teams",
  "scope_2_workflow",
  "scope_2_replaces",
  "scope_2_teams",
  "scope_3_workflow",
  "scope_3_replaces",
  "scope_3_teams",
  "scope_4_workflow",
  "scope_4_replaces",
  "scope_4_teams",
  "scope_4_owner",
  "scope_5_workflow",
  "scope_5_replaces",
  "scope_5_teams",
  "scope_5_owner",
  "out_of_scope",
  "phase_1_date",
  "phase_1_name",
  "phase_1_detail",
  "phase_2_date",
  "phase_2_name",
  "phase_2_detail",
  "phase_3_date",
  "phase_3_name",
  "phase_3_detail",
  "phase_4_date",
  "phase_4_name",
  "phase_4_detail",
  "phase_5_date",
  "phase_5_name",
  "phase_5_detail",
  "need_from_client",
  "timeline_risk",
  "raci_1_owner",
  "raci_1_support",
  "raci_2_owner",
  "raci_2_support",
  "raci_3_owner",
  "raci_3_support",
  "raci_4_owner",
  "raci_4_support",
  "raci_5_owner",
  "raci_5_support",
  "training_1_title",
  "training_1_who",
  "training_2_title",
  "training_2_who",
  "training_3_title",
  "training_3_who",
  "licensed_seats",
  "renewal_date",
  "integration_1",
  "integration_2",
  "integration_3",
  "it_req_1",
  "it_req_2",
  "it_req_3",
  "it_req_4",
  "it_contact",
  "support_tier_1",
  "support_tier_2",
  "support_tier_3",
  "risk_1",
  "risk_1_mitigation",
  "risk_2",
  "risk_2_mitigation",
  "risk_3",
  "risk_3_mitigation",
  "action_1",
  "action_1_why",
  "action_1_owner",
  "action_1_due",
  "action_2",
  "action_2_why",
  "action_2_owner",
  "action_2_due",
  "action_3",
  "action_3_why",
  "action_3_owner",
  "action_3_due",
  "action_4",
  "action_4_why",
  "action_4_owner",
  "action_4_due",
  "kpi_4_value_repeat",
  "next_meeting",
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** `2026-04-01` → `Apr 1`. The template's own short-date style. */
export function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return `${month.slice(0, 3)} ${Number(m[3])}`;
}

/** `2026-04-01` → `April 2026`, for the title slide's eyebrow. */
export function monthYear(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

/**
 * Split a goal into its headline and the sentence under it.
 *
 * The template gives each goal two lines. A recorded goal is usually one or
 * two sentences, so the first sentence leads and the rest explains. When there
 * is only one sentence the detail line stays empty rather than repeating it.
 */
export function splitGoal(goal: string): { headline: string; detail: string | null } {
  const t = goal.trim().replace(/\s+/g, " ");
  const at = t.search(/[.!?](\s|$)/);
  if (at === -1 || at === t.length - 1) return { headline: t, detail: null };
  return { headline: t.slice(0, at + 1), detail: t.slice(at + 1).trim() || null };
}

export function buildKickoffData(input: KickoffInput): KickoffDeckData {
  const f: Record<string, string> = {};
  const set = (key: string, value: string | null | undefined) => {
    const v = clean(value ?? null);
    if (v) f[key] = v;
  };

  /* ------------------------------------------------------------ 01, 03, 17 */

  set("deck_eyebrow", `Implementation Kickoff · ${monthYear(input.preparedAt)}`);
  set("client_name", input.clientName);
  set("client_name_short", input.clientName);

  const [lead, second, third] = input.team;
  set("gc_lead_name", lead?.name);
  set("gc_lead_role", lead?.role);
  set("gc_person_2_name", second?.name);
  set("gc_person_2_role", second?.role);
  set("gc_person_3_name", third?.name);
  set("gc_person_3_role", third?.role);

  input.clientPeople.slice(0, 3).forEach((p, i) => {
    set(`client_person_${i + 1}_name`, p.name);
    set(`client_person_${i + 1}_role`, p.role);
  });

  /* ------------------------------------------------------------------- 06 */

  input.brief.goals.slice(0, 4).forEach((g, i) => {
    const { headline, detail } = splitGoal(g);
    set(`goal_${i + 1}`, headline);
    set(`goal_${i + 1}_detail`, detail);
  });

  /* ------------------------------------------------------------------- 07 */

  input.successCriteria.slice(0, 3).forEach((c, i) => {
    // A card is METRIC / number / qualifier. The template hard-codes the
    // metric ("Users live", "Forms live") because its example criteria are
    // fixed; ours are whatever the customer agreed, so the metric has to come
    // from the criterion too — otherwise the card reads "USERS LIVE / 0 /
    // work orders rekeyed per week", which contradicts itself.
    set(`kpi_${i + 1}_metric`, c.description);
    set(`kpi_${i + 1}_value`, c.target);
    // The qualifier line is left for a person. Nothing here knows whether a
    // target is "by end of quarter two" or "against today's baseline", and
    // guessing puts a claim on a customer-facing slide.
  });
  // The fourth card is go-live in the template, and repeated on the close.
  const launch = shortDate(input.targetLaunchDate);
  set("kpi_4_metric", "Go-live");
  set("kpi_4_value", launch);
  set("kpi_4_label", launch ? "target date, to confirm today" : null);
  set("kpi_4_value_repeat", launch);

  /* ------------------------------------------------------------------- 08 */

  const inScope = input.requirements.filter((r) => r.inScope).slice(0, 5);
  inScope.forEach((r, i) => set(`scope_${i + 1}_workflow`, r.title));
  const outOfScope = input.requirements.filter((r) => !r.inScope).map((r) => r.title);
  set("out_of_scope", outOfScope.length ? outOfScope.join(", ") : null);

  /* ------------------------------------------------------------------- 10 */

  input.stages.slice(0, 5).forEach((s, i) => {
    set(`phase_${i + 1}_name`, s.name);
    set(`phase_${i + 1}_detail`, s.intent);
    // A real date when the plan has one, otherwise the cumulative week the
    // template shows. Never a guessed calendar date.
    set(`phase_${i + 1}_date`, shortDate(s.startsOn) ?? weekLabel(input.stages, i));
  });
  const firstAsk = input.customerTasks[0];
  const firstDue = shortDate(firstAsk?.due ?? null);
  set(
    "need_from_client",
    firstAsk ? `${firstAsk.title}${firstDue ? ` by ${firstDue}` : ""}` : null,
  );
  set("timeline_risk", input.risks[0]?.title);

  /* ------------------------------------------------------------------- 13 */

  input.solutions.slice(0, 3).forEach((s, i) => set(`integration_${i + 1}`, s));
  set("it_contact", input.itContact ? `${input.itContact.name} · ${input.itContact.role}` : null);

  /* ------------------------------------------------------------------- 14 */

  set("support_tier_1", "support@gocanvas.com · answered within one business day");
  set("support_tier_2", lead ? `${lead.name} · weekly stand-up and direct line` : null);
  set("support_tier_3", third ? `Flag to ${third.name}, your CSM — same-day response` : null);

  /* ------------------------------------------------------------------- 15 */

  input.risks.slice(0, 3).forEach((r, i) => {
    set(`risk_${i + 1}`, r.title);
    set(`risk_${i + 1}_mitigation`, r.mitigation);
  });

  /* ------------------------------------------------------------------- 16 */

  input.customerTasks.slice(0, 4).forEach((t, i) => {
    set(`action_${i + 1}`, t.title);
    set(`action_${i + 1}_why`, t.stage === "—" ? null : `Needed for ${t.stage}`);
    set(`action_${i + 1}_owner`, t.owner ?? input.clientName);
    set(`action_${i + 1}_due`, shortDate(t.due));
  });

  // A field nobody CAN fill is not the same as one nobody HAS. The KPI
  // qualifier lines are deliberately left to the person presenting, so they
  // are omitted rather than flagged red on a customer-facing slide.
  const optionalByDesign = new Set(["kpi_1_label", "kpi_2_label", "kpi_3_label"]);
  const missing = TEMPLATE_FIELDS.filter((k) => !(k in f) && !optionalByDesign.has(k));

  return {
    fields: f,
    missing,
    optionalSlides: {
      // The template's note: skip for clients who already know us well. There
      // is no signal for that here, so it stays in and the AE removes it.
      about: true,
      // Drop when there is nothing to connect and no IT contact — the slide
      // would be four generic questions and a blank.
      integrations: input.solutions.length > 0 || input.itContact !== null,
      support: true,
      // "Optional but recommended" — but a risks slide with no risks is worse
      // than none, and the deck already asks the room to add one.
      risks: input.risks.length > 0,
    },
  };
}

/**
 * The template shows "Week 1 / Week 3 / Week 6…" — a running position, not a
 * duration. Built from the stages before this one so it stays right when a
 * template has different lengths.
 */
function weekLabel(stages: KickoffStage[], index: number): string | null {
  let days = 0;
  for (let i = 0; i < index; i += 1) {
    const d = stages[i]?.targetDays;
    if (d == null) return null;
    days += d;
  }
  return `Week ${Math.floor(days / 7) + 1}`;
}
