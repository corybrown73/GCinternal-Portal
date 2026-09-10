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
  implementation_owner_email: [
    "implementation_owner_email",
    "implementation_owner",
    "onboarding_owner",
    "specialist_email",
  ],
  close_date: ["close_date", "closed_date", "closed_at", "closed_won_at", "date"],
  contact_name: ["contact_name", "contact", "primary_contact", "champion"],
  contact_email: ["contact_email", "primary_contact_email", "champion_email"],
  contact_role: ["contact_role", "contact_title", "title"],
  domain: ["domain", "website", "web"],
  notes: ["notes", "note", "summary", "comments", "slack_message", "message"],
  salesforce_id: ["salesforce_id", "sf_account_id", "account_id"],
  salesforce_url: ["salesforce_url", "sf_url", "salesforce_link", "sf_link", "url", "link"],
};

/** Fold the aliases onto the canonical names. Later keys never overwrite earlier. */
export function normalizeClosedWonRow(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  // Case- and separator-insensitive on the incoming key: "Account Name",
  // "account-name" and "accountName" are all the same column.
  const flat = new Map<string, unknown>();
  for (const [k, v] of Object.entries(src)) {
    // camelCase is split BEFORE lowercasing — the other order has nothing left
    // to split, and "accountName" quietly became "accountname", matching nothing.
    flat.set(
      k
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .toLowerCase()
        .replace(/[\s-]+/g, "_"),
      v,
    );
  }
  const out: Record<string, unknown> = {};
  for (const [canonical, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      if (flat.has(n) && flat.get(n) !== "" && flat.get(n) !== null && flat.get(n) !== undefined) {
        out[canonical] = flat.get(n);
        break;
      }
    }
  }
  return out;
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
      implementation_owner_email: emailOrUndefined(r["implementation_owner_email"]),
      close_date: optionalText(40).parse(r["close_date"]),
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
    };
  })
  .refine((v) => v.company.length > 0, {
    message: "company is required (also accepted: account, account_name, customer, name)",
  });

export type ClosedWonInput = z.infer<typeof closedWonSchema>;

function emailOrUndefined(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().toLowerCase();
  return z.string().email().safeParse(t).success ? t : undefined;
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
};

export type ClosedWonOutcome = {
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
    ...(summary && { summary }),
  });

  if (input.contact_name || input.contact_email || input.contact_role) {
    await deps.recordContact(account.id, {
      name: input.contact_name,
      email: input.contact_email,
      role: input.contact_role,
    });
  }

  // Already onboarding: the second delivery of the same row, or a company
  // whose project a person had already started. Report what exists.
  if (account.customer_id) {
    const implementationId = await deps.existingImplementation(account.customer_id);
    return {
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

  return {
    deal_id: account.id,
    deal_created: created,
    customer_id: started.customerId,
    implementation_id: started.implementationId,
    kicked_off: true,
    note: null,
  };
}
