import { integrationTierFrom } from "@/lib/assignment";
import { companyNameFrom } from "@/lib/company-name";
import { z } from "zod";

import { isSfId, sfId18 } from "./sf-id";

/**
 * The closed-won webhook: a Google Sheets row becomes a deal AND a kicked-off
 * implementation, in one call.
 *
 * WHY THIS EXISTS BESIDE /api/v1/accounts AND /api/v1/implementations. Both
 * already exist and both are correct for what they are. The accounts hook
 * creates the deal and stops — somebody still has to open it and press Start
 * onboarding, which is exactly the manual step a handoff tool is supposed to
 * remove. The implementations hook does the full kick-off but is the
 * SALESFORCE hook: it needs Salesforce opportunity and account ids, runs the
 * conflict-resolution machinery and writes the sync log. A row that came out
 * of a Slack message via a Zap has a company name, an amount and a rep, and
 * that has to be enough.
 *
 * So this accepts what a row has, forgivingly, and does the whole thing:
 *
 *   1. upsert the deal at Closed Won (matched by Salesforce id if one came
 *      through, else by company name — the same match the accounts hook uses)
 *   2. record the contact, which the upsert does not carry
 *   3. start onboarding under the API key: customer, implementation, journey
 *      template, deal link, stage move — the SAME code the deal page runs
 *
 * IDEMPOTENT ON THE COMPANY. Zapier retries, Sheets rows get edited and
 * re-trigger, and the same deal must not become two projects. A second call
 * for a company that is already onboarding updates the deal's facts and
 * reports the existing project rather than creating another.
 */

/* ------------------------------------------------------------- the input */

/**
 * The row, as a Zap would send it. Every field but the company is optional,
 * because a Sheet has whatever columns somebody gave it. A handful of aliases
 * are accepted for the fields people name differently — a webhook that
 * rejects `account_name` because it wanted `company` is a webhook that gets
 * abandoned at the first 422.
 */
const ALIASES: Record<string, string[]> = {
  company: ["company", "account", "account_name", "customer", "name", "company_name"],
  opportunity: ["opportunity", "opportunity_name", "opp", "deal", "deal_name"],
  amount: ["amount", "arr", "value", "acv", "contract_value", "deal_value"],
  products: ["products", "product", "sku", "skus"],
  rep_email: ["rep_email", "rep", "owner_email", "ae_email", "ae", "sales_rep", "closed_by"],
  implementation_owner: [
    "implementation_owner",
    "implementation_owner_email",
    "onboarding_owner",
    "specialist_email",
    "tis",
    "tis_email",
    "tis_assigned",
    "assigned_tis",
    "tis_name",
    "implementation_specialist",
  ],
  se_email: ["se_email", "se", "sales_engineer", "sales_engineer_email", "se_owner_email"],
  close_date: ["close_date", "closed_date", "closed_at", "closed_won_at", "date"],
  seats: ["seats", "users", "licenses", "field_users", "user_count", "seat_count"],
  integration_tier: ["integration_tier", "integration", "tier", "complexity", "complexity_tier"],
  contact_name: ["contact_name", "contact", "primary_contact", "champion"],
  contact_email: ["contact_email", "primary_contact_email", "champion_email"],
  contact_role: ["contact_role", "contact_title", "title"],
  domain: ["domain", "website", "web"],
  notes: ["notes", "note", "summary", "comments", "slack_message", "message"],
  salesforce_id: ["salesforce_id", "sf_account_id", "account_id"],
  salesforce_url: ["salesforce_url", "sf_url", "salesforce_link", "sf_link", "url", "link"],
  // Intake facts and the Sales handoff answers. Each canonical key is its own
  // first alias, so a row that is already canonical passes through unchanged —
  // which is what the deal map hands in.
  industry: ["industry", "vertical", "sector"],
  company_size: ["company_size", "employees", "employee_count", "size", "number_of_employees"],
  current_process: ["current_process", "process_today", "process", "how_it_works_today"],
  path: ["path", "onboarding_type", "deal_type", "implementation_type", "type"],
  desired_launch_date: [
    "desired_launch_date",
    "launch_date",
    "target_launch",
    "go_live_date",
    "wanted_by",
  ],
  business_outcome: ["business_outcome", "outcome", "desired_outcome", "goal", "goals"],
  success_measure: ["success_measure", "success_metric", "success_criteria", "kpi"],
  commitments: ["commitments", "promises", "promised", "commitments_made"],
  system_requirements: ["system_requirements", "systems", "requirements", "integrations_needed"],
  open_questions: ["open_questions", "questions", "unknowns"],
  contact_decision_maker: ["contact_decision_maker", "decision_maker", "economic_buyer", "sponsor"],
  contact_admin_builder: [
    "contact_admin_builder",
    "admin_contact",
    "admin",
    "builder",
    "form_builder",
  ],
  contact_day_to_day: ["contact_day_to_day", "day_to_day_contact", "day_to_day", "project_contact"],
};

/** The canonical field names, in the order the aliases declare them. */
export const CLOSED_WON_FIELDS: ReadonlyArray<string> = Object.keys(ALIASES);

/** Case- and separator-insensitive key: "Account Name", "account-name", "accountName" → account_name. */
function flatKey(k: string): string {
  // camelCase is split BEFORE lowercasing — the other order has nothing left
  // to split, and "accountName" quietly became "accountname", matching nothing.
  return k
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

const blank = (v: unknown) => v === "" || v === null || v === undefined;
/** An alias names a value, never a nested record: `Account: { Name }` is not the company. */
const scalarish = (v: unknown) =>
  typeof v === "string" || typeof v === "number" || typeof v === "boolean" || Array.isArray(v);

export type ResolvedRow = {
  /** Canonical field → value, ready for `closedWonSchema`. */
  row: Record<string, unknown>;
  /** Canonical field → how it got there. */
  sources: Record<string, "map" | "alias">;
  /** Payload keys (as sent) that neither a map nor an alias consumed. */
  unmappedKeys: string[];
};

/**
 * The deal map laid over the alias matching. A mapped value always wins —
 * an admin who mapped `TIS_Assigned__r.Email` to the TIS meant it, whatever
 * else the payload happens to call `tis`. Aliases fill the rest, so every
 * Zap that worked before a map existed still works. What neither consumed
 * is reported, which is how the admin learns what is left to map.
 */
export function resolveClosedWonRow(
  raw: unknown,
  mapped: Record<string, unknown> = {},
  mapRoots: ReadonlySet<string> = new Set(),
): ResolvedRow {
  const row: Record<string, unknown> = {};
  const sources: Record<string, "map" | "alias"> = {};
  const consumed = new Set<string>();
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const flat = new Map<string, string>();
  for (const k of Object.keys(src)) flat.set(flatKey(k), k);

  for (const [canonical, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const original = flat.get(n);
      if (original !== undefined && !blank(src[original]) && scalarish(src[original])) {
        row[canonical] = src[original];
        sources[canonical] = "alias";
        consumed.add(original);
        break;
      }
    }
  }
  for (const [canonical, v] of Object.entries(mapped)) {
    if (blank(v) || !(canonical in ALIASES)) continue;
    row[canonical] = v;
    sources[canonical] = "map";
  }
  const unmappedKeys = Object.keys(src).filter(
    (k) => !consumed.has(k) && !mapRoots.has(k) && !blank(src[k]),
  );
  return { row, sources, unmappedKeys };
}

/** Fold the aliases onto the canonical names. Later keys never overwrite earlier. */
export function normalizeClosedWonRow(raw: unknown): Record<string, unknown> {
  return resolveClosedWonRow(raw).row;
}

/**
 * Slack renders `&` as `&amp;` and a Zap copies the rendering, not the text,
 * so "West-Com & TV-Direct" arrived as "West-Com &amp; TV-Direct" and became
 * a customer by that name. Decoded on the way in, for every text field.
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

const optionalText = (max: number) =>
  z.preprocess(
    (v) =>
      v === null || v === undefined ? undefined : decodeEntities(String(v)).trim() || undefined,
    z.string().max(max).optional(),
  );

/** "$48,000" and 48000 are the same amount. Words are not an amount. */
export function parseMoney(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : undefined;
  const stripped = String(v).replace(/[^0-9.-]/g, "");
  if (!/[0-9]/.test(stripped)) return undefined;
  const n = Number(stripped);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** "Forms, Dispatch" and ["Forms","Dispatch"] are the same list. */
export function parseProducts(v: unknown): string[] | undefined {
  if (v === null || v === undefined) return undefined;
  const list = Array.isArray(v) ? v.map(String) : String(v).split(/[,;|]/);
  const clean = list.map((s) => s.trim()).filter(Boolean);
  return clean.length ? clean : undefined;
}

/**
 * A Salesforce ACCOUNT id out of whatever was sent — an id, or a Lightning
 * URL. Only the account prefix (001) is accepted: the deal's `salesforce_id`
 * is the account's, and an opportunity id (006) stored there would make the
 * next handoff match nothing.
 */
export function salesforceAccountIdFrom(id: unknown, url: unknown): string | undefined {
  const direct = typeof id === "string" ? id.trim() : "";
  if (direct && isSfId(direct) && direct.startsWith("001")) return sfId18(direct) ?? undefined;
  const text = typeof url === "string" ? url : "";
  const m = text.match(/\b(001[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?)\b/);
  return m ? (sfId18(m[1]) ?? undefined) : undefined;
}

export const closedWonSchema = z
  .preprocess(normalizeClosedWonRow, z.object({}).passthrough())
  .transform((row) => {
    const r = row as Record<string, unknown>;
    return {
      company: decodeEntities(String(r["company"] ?? "")).trim(),
      opportunity: optionalText(300).parse(r["opportunity"]),
      amount: parseMoney(r["amount"]),
      products: parseProducts(r["products"]),
      rep_email: emailOrUndefined(r["rep_email"]),
      se_email: emailOrUndefined(r["se_email"]),
      // An email or a name: the route resolves either against the team.
      implementation_owner: personOrUndefined(r["implementation_owner"]),
      close_date: optionalText(40).parse(r["close_date"]),
      seats: parseCount(r["seats"]),
      integration_tier: integrationTierFrom(r["integration_tier"]) ?? undefined,
      contact_name: optionalText(200).parse(r["contact_name"]),
      contact_email: emailOrUndefined(r["contact_email"]),
      contact_role: optionalText(200).parse(r["contact_role"]),
      domain: optionalText(200)
        .parse(r["domain"])
        ?.toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, ""),
      notes: optionalText(10000).parse(r["notes"]),
      salesforce_id: salesforceAccountIdFrom(r["salesforce_id"], r["salesforce_url"]),
      industry: optionalText(80).parse(r["industry"]),
      company_size: optionalText(20).parse(r["company_size"]),
      current_process: optionalText(4000).parse(r["current_process"]),
      path: pathFrom(r["path"]),
      handoff: handoffAnswersFrom(r),
    };
  })
  .refine((v) => v.company.length > 0, {
    message: "company is required (also accepted: account, account_name, customer, name)",
  });

export type ClosedWonInput = z.infer<typeof closedWonSchema>;

/** "24", 24, "24 users" → 24. Anything without a digit is not a count. */
function parseCount(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const s = String(v);
  if (!/\d/.test(s)) return undefined;
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

function emailOrUndefined(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().toLowerCase();
  return z.string().email().safeParse(t).success ? t : undefined;
}

/** An email (lower-cased) or a person's name (as written). Blank is nothing. */
function personOrUndefined(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = decodeEntities(v).trim();
  if (!t) return undefined;
  return t.includes("@") ? emailOrUndefined(t) : t.slice(0, 200);
}

export type OnboardingPath = "new_logo" | "existing" | "dm_conversion" | "field_fusion";

/**
 * "New Logo", "new-logo", "Existing Customer", "DM Conversion", "Field
 * Fusion" → the intake's path. Anything else is not a path and is dropped
 * rather than guessed: the type picks the whole checklist.
 */
export function pathFrom(v: unknown): OnboardingPath | undefined {
  if (typeof v !== "string") return undefined;
  const k = v.toLowerCase().replace(/[^a-z]/g, "");
  if (!k) return undefined;
  if (k === "newlogo" || k === "new" || k === "newcustomer" || k === "newbusiness")
    return "new_logo";
  if (k === "existing" || k === "existingcustomer" || k === "expansion" || k === "upsell")
    return "existing";
  if (k === "dmconversion" || k === "dm" || k === "conversion" || k === "dispatchmanagerconversion")
    return "dm_conversion";
  if (k === "fieldfusion" || k === "ff" || k === "partner") return "field_fusion";
  return undefined;
}

/** The handoff questions a row may answer, as the catalogue lists them. */
export const HANDOFF_ANSWER_FIELDS = [
  "desired_launch_date",
  "business_outcome",
  "success_measure",
  "commitments",
  "system_requirements",
  "open_questions",
  "contact_decision_maker",
  "contact_admin_builder",
  "contact_day_to_day",
] as const;
export type HandoffAnswerField = (typeof HANDOFF_ANSWER_FIELDS)[number];

function handoffAnswersFrom(
  r: Record<string, unknown>,
): Partial<Record<HandoffAnswerField, string>> {
  const out: Partial<Record<HandoffAnswerField, string>> = {};
  for (const k of HANDOFF_ANSWER_FIELDS) {
    const v = optionalText(4000).parse(r[k]);
    if (v) out[k] = v;
  }
  return out;
}

/* ---------------------------------------------------------- the decision */

export type ClosedWonDeps = {
  upsertAccount: (input: {
    name: string;
    stage: "closed_won";
    salesforce_id?: string;
    domain?: string;
    arr?: number;
    products?: string[];
    am_owner_email?: string;
    se_owner_email?: string;
    summary?: string;
  }) => Promise<{
    account: { id: string; customer_id?: string | null; stage: string };
    created: boolean;
  }>;
  recordContact: (
    dealId: string,
    contact: { name?: string | undefined; email?: string | undefined; role?: string | undefined },
  ) => Promise<void>;
  startOnboarding: (dealId: string) => Promise<{
    outcome: "started" | "already_linked" | "needs_account_choice";
    customerId: string;
    implementationId: string;
  }>;
  /** The implementation a linked customer already has, if any. */
  existingImplementation: (customerId: string) => Promise<string | null>;
  /**
   * What the sender knew at close time — seats, the tier, the industry, the
   * process, the Sales handoff answers — onto the deal's intake, so the plan
   * and the TIS already have it. Fills blanks only; never overwrites what a
   * person typed. Optional: a caller without the intake does nothing.
   */
  recordFacts?: (dealId: string, facts: DealIntakeFacts) => Promise<void>;
  /**
   * Hand the new project to a person: the rule, or the owner the row named.
   * Optional, and never allowed to fail the ingest — an unassigned account
   * with a project beats no project.
   */
  assign?: (
    dealId: string,
    implementationId: string,
    /** The TIS the row named: an email or a name. The route resolves it. */
    owner: string | undefined,
  ) => Promise<{ assigneeName: string | null } | null>;
};

export type DealIntakeFacts = {
  seats?: number | undefined;
  integrationTier?: number | undefined;
  industry?: string | undefined;
  companySize?: string | undefined;
  currentProcess?: string | undefined;
  path?: OnboardingPath | undefined;
  /** Handoff question key → the answer, recorded as Sales. */
  handoff?: Partial<Record<HandoffAnswerField, string>>;
};

/** The intake facts a parsed row carries, or null when it carries none. */
export function intakeFactsOf(input: ClosedWonInput): DealIntakeFacts | null {
  const facts: DealIntakeFacts = {
    seats: input.seats,
    integrationTier: input.integration_tier,
    industry: input.industry,
    companySize: input.company_size,
    currentProcess: input.current_process,
    path: input.path,
    handoff: input.handoff,
  };
  const any =
    facts.seats !== undefined ||
    facts.integrationTier !== undefined ||
    facts.industry !== undefined ||
    facts.companySize !== undefined ||
    facts.currentProcess !== undefined ||
    facts.path !== undefined ||
    Object.keys(facts.handoff ?? {}).length > 0;
  return any ? facts : null;
}

export type ClosedWonOutcome = {
  /** Who was handed the project, when somebody was. */
  assigned_to: string | null;
  deal_id: string;
  deal_created: boolean;
  customer_id: string | null;
  implementation_id: string | null;
  /** True when THIS call created the project. False on a replay. */
  kicked_off: boolean;
  /** Why nothing was kicked off, when nothing was. */
  note: string | null;
};

export async function ingestClosedWon(
  input: ClosedWonInput,
  deps: ClosedWonDeps,
): Promise<ClosedWonOutcome> {
  const company = companyNameFrom(input.company) || input.company;
  const summary = [
    input.opportunity
      ? `Opportunity: ${input.opportunity}`
      : company !== input.company
        ? `Opportunity: ${input.company}`
        : null,
    input.close_date ? `Closed: ${input.close_date}` : null,
    input.notes,
  ]
    .filter(Boolean)
    .join("\n");

  const { account, created } = await deps.upsertAccount({
    name: company,
    stage: "closed_won",
    ...(input.salesforce_id && { salesforce_id: input.salesforce_id }),
    ...(input.domain && { domain: input.domain }),
    ...(input.amount !== undefined && { arr: input.amount }),
    ...(input.products && { products: input.products }),
    ...(input.rep_email && { am_owner_email: input.rep_email }),
    ...(input.se_email && { se_owner_email: input.se_email }),
    ...(summary && { summary }),
  });

  if (input.contact_name || input.contact_email || input.contact_role) {
    await deps.recordContact(account.id, {
      name: input.contact_name,
      email: input.contact_email,
      role: input.contact_role,
    });
  }
  const facts = intakeFactsOf(input);
  if (deps.recordFacts && facts) {
    await deps.recordFacts(account.id, facts);
  }

  // Already onboarding: the second delivery of the same row, or a company
  // whose project a person had already started. Report what exists.
  if (account.customer_id) {
    const implementationId = await deps.existingImplementation(account.customer_id);
    return {
      assigned_to: null,
      deal_id: account.id,
      deal_created: created,
      customer_id: account.customer_id,
      implementation_id: implementationId,
      kicked_off: false,
      note: "This company is already onboarding; the deal's facts were updated and nothing new was created.",
    };
  }

  const started = await deps.startOnboarding(account.id);
  if (started.outcome !== "started") {
    return {
      assigned_to: null,
      deal_id: account.id,
      deal_created: created,
      customer_id: started.customerId || null,
      implementation_id: null,
      kicked_off: false,
      note:
        started.outcome === "needs_account_choice"
          ? "The deal was created but a person has to choose which existing account it belongs to — open the deal and press Start onboarding."
          : "The deal was already linked to an account; nothing new was created.",
    };
  }

  // Eyes on it within minutes: hand the project to a person, by rule or by
  // the owner the row named. A failure here is logged and reported, never
  // thrown — the project exists, and a person can assign by hand.
  let assignedTo: string | null = null;
  if (deps.assign) {
    try {
      const r = await deps.assign(account.id, started.implementationId, input.implementation_owner);
      assignedTo = r?.assigneeName ?? null;
    } catch (e) {
      console.error("[closed-won] assignment failed; project left unassigned", e);
    }
  }

  return {
    assigned_to: assignedTo,
    deal_id: account.id,
    deal_created: created,
    customer_id: started.customerId,
    implementation_id: started.implementationId,
    kicked_off: true,
    note: assignedTo
      ? null
      : deps.assign
        ? "Nobody is in the assignment pool yet — assign by hand from the deal."
        : null,
  };
}
