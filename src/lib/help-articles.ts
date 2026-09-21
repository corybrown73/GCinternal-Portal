/**
 * Help articles on the customer's page. Client-safe.
 *
 * After the brief is written, the features the calls flagged as valuable
 * are matched to GoCanvas help centre articles, and the customer's page
 * shows them under "Get started on your own", each with why it is there in
 * the customer's own words. Every open goes through /go on our domain so
 * the deal can show what they tried.
 */

export type HelpPick = {
  article_id: string;
  title: string;
  url: string;
  /** Why this one, in the customer's words from the calls. */
  why: string;
  /** "ai" when the picker chose it; "person" once somebody edited or added it. */
  source: "ai" | "person";
  /** The feature it teaches, from the lexicon below. */
  feature?: string;
  /** When in the plan it earns its place. */
  when?: "before session 1" | "after session 1" | "after session 2" | "phase 2";
};

/**
 * The features a customer talks about, in their words, mapped to the words
 * the help centre uses. "Sign off" is a signature; "parts list" is reference
 * data; "no signal" is offline. Each entry: the help-centre categories that
 * teach it, and the phrases people say. The picker's fallback ranks with
 * this; the model gets it as vocabulary.
 */
export const FEATURE_LEXICON: ReadonlyArray<{
  feature: string;
  categories: string[];
  says: string[];
}> = [
  {
    feature: "reference data",
    categories: ["Reference Data"],
    says: [
      "reference data",
      "parts list",
      "client list",
      "customer list",
      "price list",
      "site list",
      "lookup",
      "dropdown",
      "drop-down",
      "spreadsheet",
      "google sheet",
      "excel list",
    ],
  },
  {
    feature: "dispatch",
    categories: ["Dispatch", "Task Link"],
    says: ["dispatch", "assign a job", "assign jobs", "work order", "schedule jobs", "send jobs"],
  },
  {
    feature: "pdf output",
    categories: ["PDF Designer"],
    says: ["pdf", "report layout", "the output", "printout", "invoice", "certificate", "branded"],
  },
  {
    feature: "photos",
    categories: ["Builder Field Types", "Field Settings in the Builder"],
    says: ["photo", "photos", "picture", "pictures", "image", "camera", "annotate"],
  },
  {
    feature: "signatures",
    categories: ["Builder Field Types", "Field Settings in the Builder"],
    says: ["signature", "signatures", "sign off", "sign-off", "signed", "customer signs"],
  },
  {
    feature: "gps and location",
    categories: ["Builder Field Types", "Field Settings in the Builder"],
    says: ["gps", "location", "geo", "map pin", "where they were"],
  },
  {
    feature: "calculations",
    categories: ["Field Settings in the Builder", "Builder Field Types"],
    says: ["calculation", "calculations", "calculate", "formula", "totals", "add up", "math"],
  },
  {
    feature: "conditional logic",
    categories: ["Field Settings in the Builder", "Form Settings"],
    says: ["conditional", "show or hide", "skip logic", "depends on", "only if", "required field"],
  },
  {
    feature: "workflow and approvals",
    categories: ["Form Settings", "Submissions"],
    says: [
      "workflow",
      "approval",
      "approve",
      "review step",
      "sign-off step",
      "multi-step",
      "hand off",
    ],
  },
  {
    feature: "notifications",
    categories: ["Form Settings", "Submissions"],
    says: ["notification", "notifications", "email alert", "text alert", "notify", "get emailed"],
  },
  {
    feature: "offline",
    categories: ["GoCanvas on Mobile", "Across All Devices"],
    says: ["offline", "no signal", "no service", "cell service", "spotty", "remote sites"],
  },
  {
    feature: "reports and exports",
    categories: ["Reports", "Submissions"],
    says: ["report", "reports", "export", "csv", "excel", "dashboard", "analytics", "trend"],
  },
  {
    feature: "users and departments",
    categories: ["Departments", "Administrative", "Account and Profile Settings"],
    says: ["users", "seats", "logins", "departments", "permissions", "admin", "roles", "crews"],
  },
  {
    feature: "the mobile app",
    categories: ["GoCanvas on Mobile", "Across All Devices"],
    says: ["the app", "phone", "phones", "tablet", "ipad", "android", "install"],
  },
  {
    feature: "building a form",
    categories: ["Builder Basics", "Builder Field Types"],
    says: [
      "build a form",
      "form builder",
      "the builder",
      "add a field",
      "checklist",
      "inspection form",
    ],
  },
  {
    feature: "integrations",
    categories: ["Integrations"],
    says: [
      "integration",
      "integrations",
      "quickbooks",
      "salesforce",
      "zapier",
      "api",
      "sync",
      "google drive",
      "dropbox",
      "onedrive",
      "sharepoint",
    ],
  },
];

/** The features the text names, by the lexicon. */
export function featuresIn(text: string): string[] {
  const t = text.toLowerCase();
  return FEATURE_LEXICON.filter((f) => f.says.some((s) => t.includes(s))).map((f) => f.feature);
}

/** Categories that teach nothing to a customer starting out. */
export const NOISE_CATEGORIES = new Set(["Device Releases", "Feature Releases", "Webinars"]);
export function isNoise(a: Pick<HelpArticle, "title" | "category">): boolean {
  return (
    NOISE_CATEGORIES.has(a.category) ||
    /^20\d\d$/.test(a.category) ||
    /release notes|webinar/i.test(a.title)
  );
}

export type HelpArticle = {
  article_id: string;
  title: string;
  category: string;
  tags: string[];
  url: string;
};

/** The deck screen's key; hidden the usual way. */
export const HELP_SCREEN_KEY = "help";

const STOP = new Set(
  "the a an and or to of in on for with your you we our their it is are be as at by from this that these those how what when into via not no yes can will do does use using used new get set up out one two all any per about more than then them they".split(
    " ",
  ),
);

/** Words worth matching: lower-cased, three letters or more, not glue. */
export function keywords(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length >= 3 && !STOP.has(w)) out.add(w);
  }
  return out;
}

/**
 * Rank the library against what the calls said. Title words count double;
 * a category or tag hit counts once. Release notes and legacy-builder pages
 * are pushed down: a customer starting out does not need either. The top
 * N become the picker's candidates, or the picks themselves when there is
 * no model to ask.
 */
export function rankArticles(text: string, articles: HelpArticle[], limit = 40): HelpArticle[] {
  const words = keywords(text);
  // The lexicon: what they said, in the help centre's words. A feature
  // they named lifts every article in its categories, and its own words
  // join the match set so "sign off" finds "signature".
  const features = FEATURE_LEXICON.filter((f) => featuresIn(text).includes(f.feature));
  const liftedCategories = new Set(features.flatMap((f) => f.categories));
  for (const f of features) for (const w of keywords(f.feature)) words.add(w);
  if (words.size === 0) return [];
  const scored = articles.map((a) => {
    let score = 0;
    for (const w of keywords(a.title)) if (words.has(w)) score += 2;
    for (const t of a.tags) if (words.has(t.toLowerCase())) score += 1;
    for (const w of keywords(a.category)) if (words.has(w)) score += 1;
    if (liftedCategories.has(a.category)) score += 2;
    if (isNoise(a)) score -= 8;
    if (/legacy/i.test(a.category) || /legacy/i.test(a.title)) score -= 4;
    return { a, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score || x.a.title.localeCompare(y.a.title))
    .slice(0, limit)
    .map((s) => s.a);
}
