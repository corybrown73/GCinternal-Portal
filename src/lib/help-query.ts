import {
  FEATURE_LEXICON,
  isNoise,
  keywords,
  type HelpArticle,
  type HelpPick,
} from "./help-articles";
import {
  existingBuildFor,
  firstFormName,
  isTrainingOnly,
  type IntakeAnswers,
} from "./intake-answers";

/**
 * The help-article query: what this customer needs to read, worked out
 * from what the tool already knows, before any model is asked.
 *
 * THE RULES, so the picker cannot pull the wrong article:
 * - An integration article is allowed only when the SOW put that
 *   integration on the plan. The calls saying "QuickBooks" does not count;
 *   the same rule the plan follows.
 * - The flow decides what phase 1 is. A final form on an existing account
 *   needs no builder basics; a Field Fusion or training-only account gets
 *   the three sessions' topics; a build flow gets the build topics first.
 * - Every feature carries its evidence: the sentence from the calls that
 *   named it. No evidence, no feature.
 * - Release notes, webinars and legacy-builder pages never qualify.
 * - One article per feature, at most five, ordered by when they earn
 *   their place in the plan.
 */

export type PickWhen = NonNullable<HelpPick["when"]>;

export type HelpFeature = {
  feature: string;
  categories: string[];
  /** The sentence from the calls or the brief that named it. */
  quote: string;
  /** Where in the plan it lands, from the flow. */
  when: PickWhen;
  /** Why it is in the query when the calls did not name it (the plan asks for it). */
  reason: "calls" | "plan";
};

export type HelpQuery = {
  flow: "new_logo" | "existing" | "dm_conversion" | "field_fusion";
  phase1: "build" | "review" | "customer_build" | "training";
  industry: string | null;
  fieldUsers: number | null;
  firstForm: string | null;
  /** Integration systems the SOW put on the plan, lower-cased words to match titles by. */
  allowedIntegrations: string[];
  features: HelpFeature[];
  /** Features that must not be picked, with the reason, for the audit trail. */
  excluded: Array<{ feature: string; reason: string }>;
};

const WHEN_ORDER: PickWhen[] = [
  "before session 1",
  "after session 1",
  "after session 2",
  "phase 2",
];

/** When each feature lands, by what phase 1 is. */
function whenFor(feature: string, phase1: HelpQuery["phase1"]): PickWhen {
  const early = new Set(["the mobile app", "users and departments"]);
  const build = new Set([
    "building a form",
    "photos",
    "signatures",
    "gps and location",
    "conditional logic",
    "calculations",
  ]);
  const later = new Set([
    "reference data",
    "notifications",
    "pdf output",
    "workflow and approvals",
    "dispatch",
    "reports and exports",
    "offline",
  ]);
  if (feature === "integrations") return phase1 === "review" ? "after session 1" : "phase 2";
  if (early.has(feature)) return "before session 1";
  if (phase1 === "training") {
    // Session 1 builds a form; session 2 is reference data, calculations, the
    // PDF; session 3 is where the data goes.
    if (build.has(feature)) return "after session 1";
    if (feature === "reports and exports") return "after session 2";
    return "after session 2";
  }
  if (phase1 === "review") return later.has(feature) ? "after session 1" : "after session 2";
  if (build.has(feature)) return "after session 1";
  if (later.has(feature)) return "after session 2";
  return "after session 2";
}

/** The sentence in `text` that contains `phrase`, trimmed for a card. */
export function sentenceWith(text: string, phrase: string): string | null {
  const lower = text.toLowerCase();
  const at = lower.indexOf(phrase.toLowerCase());
  if (at < 0) return null;
  const start = Math.max(lower.lastIndexOf(".", at), lower.lastIndexOf("\n", at), -1) + 1;
  const endCandidates = [lower.indexOf(".", at), lower.indexOf("\n", at)].filter((i) => i >= 0);
  const end = endCandidates.length ? Math.min(...endCandidates) + 1 : text.length;
  return text.slice(start, end).trim().replace(/\s+/g, " ").slice(0, 200) || null;
}

/** The brief, flattened to the fields that carry the customer's words. */
export function briefWords(brief: unknown): string {
  const b = (brief ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) v.forEach(push);
    else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(push);
  };
  for (const k of [
    "goals",
    "what_we_know",
    "current_process",
    "process_gaps",
    "kickoff",
    "one_liner",
  ])
    push(b[k]);
  return parts.join("\n");
}

/** Systems the SOW put on the plan, as words an article title would carry. */
function integrationWords(intake: IntakeAnswers): string[] {
  const out = new Set<string>();
  for (const s of intake.timeline.services ?? []) {
    if (s.kind !== "integration") continue;
    for (const w of keywords(`${s.name} ${s.tool ?? ""}`)) if (w !== "integration") out.add(w);
    if (s.tool) out.add(s.tool.toLowerCase());
  }
  if (intake.timeline.integration_target) {
    for (const w of keywords(intake.timeline.integration_target)) out.add(w);
  }
  return [...out];
}

export function buildHelpQuery(args: {
  intake: IntakeAnswers;
  brief: unknown;
  notesText: string;
}): HelpQuery {
  const { intake } = args;
  const flow = intake.path ?? "new_logo";
  const training = isTrainingOnly(intake);
  const phase1: HelpQuery["phase1"] = training
    ? "training"
    : flow === "existing"
      ? existingBuildFor(intake) === "customer"
        ? "customer_build"
        : existingBuildFor(intake) === "us"
          ? "build"
          : "review"
      : "build";
  const allowedIntegrations = integrationWords(intake);
  const said = `${args.notesText}\n${briefWords(args.brief)}`;

  const features: HelpFeature[] = [];
  const excluded: HelpQuery["excluded"] = [];
  const seen = new Set<string>();

  // 1. What the calls named, with the sentence that named it.
  for (const f of FEATURE_LEXICON) {
    const hit = f.says.find((s) => said.toLowerCase().includes(s));
    if (!hit) continue;
    if (f.feature === "integrations" && allowedIntegrations.length === 0) {
      excluded.push({
        feature: "integrations",
        reason: "the calls mention an integration but the SOW put none on the plan",
      });
      continue;
    }
    if (f.feature === "building a form" && phase1 === "review") {
      excluded.push({ feature: "building a form", reason: "the form is final; nothing to build" });
      continue;
    }
    seen.add(f.feature);
    features.push({
      feature: f.feature,
      categories: f.categories,
      quote: sentenceWith(said, hit) ?? hit,
      when: whenFor(f.feature, phase1),
      reason: "calls",
    });
  }

  // 2. What the plan asks for even when nobody said it: the first session's
  //    own topics, so the customer can read ahead of the call that teaches it.
  const planned: string[] =
    phase1 === "training"
      ? ["building a form", "reference data", "pdf output", "reports and exports"]
      : phase1 === "review"
        ? ["reports and exports"]
        : ["the mobile app", "building a form", "reference data"];
  for (const feature of planned) {
    if (seen.has(feature)) continue;
    const f = FEATURE_LEXICON.find((x) => x.feature === feature);
    if (!f) continue;
    seen.add(feature);
    features.push({
      feature,
      categories: f.categories,
      quote: "",
      when: whenFor(feature, phase1),
      reason: "plan",
    });
  }

  // 3. An integration the SOW put on the plan is always a feature, evidence
  //    or not: the customer will connect it in phase 2.
  if (allowedIntegrations.length && !seen.has("integrations")) {
    const f = FEATURE_LEXICON.find((x) => x.feature === "integrations")!;
    features.push({
      feature: "integrations",
      categories: f.categories,
      quote: sentenceWith(said, allowedIntegrations[0]!) ?? "",
      when: whenFor("integrations", phase1),
      reason: "plan",
    });
  }

  features.sort(
    (a, b) =>
      (a.reason === "calls" ? 0 : 1) - (b.reason === "calls" ? 0 : 1) ||
      WHEN_ORDER.indexOf(a.when) - WHEN_ORDER.indexOf(b.when),
  );

  return {
    flow,
    phase1,
    industry: intake.industry ?? null,
    fieldUsers: intake.field_users ?? null,
    firstForm: firstFormName(intake),
    allowedIntegrations,
    features,
    excluded,
  };
}

/* ------------------------------------------------------------ retrieval */

export type Candidate = HelpArticle & { feature: string; score: number };

/** An integration article may only name a system the SOW allows. */
export function integrationAllowed(a: HelpArticle, allowed: string[]): boolean {
  const words = keywords(`${a.title} ${a.tags.join(" ")}`);
  // Generic integration pages ("Integrations overview") pass; a page about a
  // named system passes only when the SOW names it.
  const systems = [
    "quickbooks",
    "salesforce",
    "zapier",
    "workato",
    "dropbox",
    "onedrive",
    "sharepoint",
    "google",
    "drive",
    "box",
    "slack",
    "sage",
    "hubspot",
    "servicetitan",
    "procore",
    "smartsheet",
    "kronos",
    "netsuite",
    "xero",
  ];
  const named = systems.filter((s) => words.has(s));
  if (named.length === 0) return true;
  return named.some((s) => allowed.some((w) => w.includes(s) || s.includes(w)));
}

/**
 * The candidates, a few per feature, scored against the feature's words,
 * its evidence and its categories. Everything the rules forbid is out
 * before the model sees the list.
 */
export function retrieveCandidates(
  query: HelpQuery,
  articles: HelpArticle[],
  perFeature = 6,
): Candidate[] {
  const out: Candidate[] = [];
  const used = new Set<string>();
  for (const f of query.features) {
    const words = new Set<string>([...keywords(f.feature), ...keywords(f.quote)]);
    const lexicon = FEATURE_LEXICON.find((x) => x.feature === f.feature);
    for (const s of lexicon?.says ?? []) for (const w of keywords(s)) words.add(w);
    const scored = articles
      .filter((a) => !isNoise(a))
      .filter((a) => !/legacy/i.test(a.category) && !/legacy/i.test(a.title))
      .filter(
        (a) => f.feature !== "integrations" || integrationAllowed(a, query.allowedIntegrations),
      )
      .filter((a) => f.feature === "integrations" || !/^Integrations$/.test(a.category))
      .map((a) => {
        let score = 0;
        if (f.categories.includes(a.category)) score += 3;
        for (const w of keywords(a.title)) if (words.has(w)) score += 2;
        for (const t of a.tags) if (words.has(t.toLowerCase())) score += 1;
        if (f.feature === "integrations" && query.allowedIntegrations.length) {
          const tw = keywords(`${a.title} ${a.tags.join(" ")}`);
          if (query.allowedIntegrations.some((w) => tw.has(w))) score += 4;
        }
        if (/^(how to|getting started|overview|create|add|set up|upload)/i.test(a.title))
          score += 1;
        return { ...a, feature: f.feature, score };
      })
      .filter((c) => c.score >= 3 && !used.has(c.article_id))
      .sort((x, y) => y.score - x.score || x.title.localeCompare(y.title))
      .slice(0, perFeature);
    for (const c of scored) used.add(c.article_id);
    out.push(...scored);
  }
  return out;
}

/* ------------------------------------------------------------- the rules */

/**
 * The rules, applied to whatever chose the picks — the model or the
 * fallback: one per feature, only candidates, integrations only when
 * allowed, at most five, in plan order.
 */
export function enforcePickRules(
  picks: Array<{ article_id: string; why?: string | undefined }>,
  query: HelpQuery,
  candidates: Candidate[],
  max = 5,
): HelpPick[] {
  const byId = new Map(candidates.map((c) => [c.article_id, c]));
  const usedFeatures = new Set<string>();
  const out: HelpPick[] = [];
  for (const p of picks) {
    const c = byId.get(p.article_id);
    if (!c || usedFeatures.has(c.feature)) continue;
    if (c.feature === "integrations" && !integrationAllowed(c, query.allowedIntegrations)) continue;
    usedFeatures.add(c.feature);
    const f = query.features.find((x) => x.feature === c.feature);
    out.push({
      article_id: c.article_id,
      title: c.title,
      url: c.url,
      why: (p.why ?? "").trim().slice(0, 240) || defaultWhy(f),
      source: "ai",
      feature: c.feature,
      when: f?.when ?? "after session 2",
    });
    if (out.length === max) break;
  }
  return out.sort(
    (a, b) => WHEN_ORDER.indexOf(a.when ?? "phase 2") - WHEN_ORDER.indexOf(b.when ?? "phase 2"),
  );
}

function defaultWhy(f: HelpFeature | undefined): string {
  if (!f) return "One of the features that came up on your calls.";
  if (f.quote) return `You said: "${f.quote.replace(/"/g, "'")}"`;
  return `Part of ${f.when === "before session 1" ? "getting set up before the first call" : f.when === "phase 2" ? "phase 2" : "the sessions"}: ${f.feature}.`;
}

/** No model: the best candidate per feature, calls first, plan order. */
export function fallbackPicks(query: HelpQuery, candidates: Candidate[], max = 5): HelpPick[] {
  const firstPerFeature = query.features
    .map((f) => candidates.find((c) => c.feature === f.feature))
    .filter((c): c is Candidate => Boolean(c))
    .map((c) => ({ article_id: c.article_id }));
  return enforcePickRules(firstPerFeature, query, candidates, max);
}

/** The query, as the model reads it. */
export function describeQuery(q: HelpQuery): string {
  const lines = [
    `Flow: ${q.flow}. Phase 1 is ${q.phase1 === "training" ? "GoCanvas training (three sessions: build a form; reference data, calculations and a PDF; where the data goes)" : q.phase1 === "review" ? "a review of a form that is already final, then the integration" : q.phase1 === "customer_build" ? "the customer building the form, then the integration" : "the collaborative form build over three training days (build a form; reference data, logic and calculations; the back office)"}.`,
    q.industry ? `Industry: ${q.industry}.` : null,
    q.fieldUsers ? `People in the field: ${q.fieldUsers}.` : null,
    q.firstForm ? `First form: ${q.firstForm}.` : null,
    q.allowedIntegrations.length
      ? `Integrations on the SOW (the only ones allowed): ${q.allowedIntegrations.join(", ")}.`
      : "No integration on the SOW: do not pick any integration article.",
    "",
    "FEATURES, WITH EVIDENCE",
    ...q.features.map(
      (f) =>
        `- ${f.feature} (${f.when}; ${f.reason === "calls" ? "the calls said so" : "the plan asks for it"})${f.quote ? `: "${f.quote}"` : ""}`,
    ),
    ...(q.excluded.length
      ? ["", "EXCLUDED", ...q.excluded.map((e) => `- ${e.feature}: ${e.reason}`)]
      : []),
  ];
  return lines.filter((l) => l !== null).join("\n");
}
