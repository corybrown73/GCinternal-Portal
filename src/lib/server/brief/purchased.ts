import type { SowReading } from "../../sow-plan";
import type { BriefJson, DiscussedItem, VerificationStatus } from "../schemas";

/**
 * What was bought, against what was talked about.
 *
 * WHY IT IS CODE. The prompt says the SOW — or, without one, the signed
 * contract or order form — is the record of what was bought, and the
 * verifier checks each integration against the sources. Both are a model's
 * reading. This is the rule that does not depend on one: after the check,
 * an integration stays on the brief only when the kept reading of the SOW
 * or the contract sells it, with the document's words for it. Everything
 * else the calls mention moves to `discussed_not_purchased`, which is
 * INTERNAL — the TIS's open questions and watch-outs, never a slide, a
 * customer page or the customer-visible "Systems and requirements" answer.
 *
 * Sutton Farms: a seats-only contract, and a Google Sheets payroll export
 * talked about on a call. The Sheets line left the deck and the welcome
 * page and became an open question for the TIS.
 */

export type PurchaseRecord = "sow" | "contract" | null;

/** The slice of a kept reading that says what was sold. */
export type PurchaseReading = Pick<SowReading, "integrations" | "services">;

/** Words every integration line has; one of these shared is not the same system. */
const GENERIC = new Set([
  "integration",
  "integrations",
  "integrate",
  "integrated",
  "sync",
  "synced",
  "syncing",
  "connector",
  "connection",
  "connect",
  "api",
  "webhook",
  "export",
  "exports",
  "import",
  "imports",
  "data",
  "the",
  "and",
  "with",
  "from",
  "into",
  "for",
  "via",
  "online",
  "cloud",
  "system",
  "systems",
  "app",
  "software",
  "platform",
  "two",
  "way",
  "one",
  "push",
  "pull",
  "feed",
  "feeds",
  "report",
  "reports",
  "reporting",
  "gocanvas",
  "canvas",
  "form",
  "forms",
  "submission",
  "submissions",
  "their",
  "our",
  "each",
  "every",
  "weekly",
  "daily",
  "monthly",
  "setup",
  "build",
  // What the data is about, not which system it goes to: "payroll" in two
  // lines does not make Google Sheets the ADP integration.
  "payroll",
  "customer",
  "customers",
  "inventory",
  "hours",
  "invoice",
  "invoices",
  "order",
  "orders",
  "job",
  "jobs",
  "records",
  "record",
  "office",
  "pdf",
  "file",
  "files",
]);

/** Vendor words: shared alone they do not make two products the same ("Google Drive" is not "Google Sheets"). */
const VENDOR = new Set(["google", "microsoft", "ms", "oracle", "adobe", "zoho", "intuit", "sap"]);

const ALIASES: Record<string, string> = {
  qbo: "quickbooks",
  qb: "quickbooks",
  sfdc: "salesforce",
  gsheets: "sheets",
  gsheet: "sheets",
  sheet: "sheets",
};

/**
 * Words that make a scope line or a focus item an integration, whatever else
 * it says. Not the everyday verbs of a form's workflow: a bin tally "exported
 * to the office as a PDF", a timesheet that "feeds into payroll" or a work
 * order "synced to the office" is the core product, not a connection.
 */
const INTEGRATION_WORDS = /\b(integrat\w*|apis?|webhooks?|connectors?)\b/i;
/** Systems a line names when it is a connection to them. */
const KNOWN_SYSTEMS =
  /\b(quickbooks(?: online)?|qbo|qb|salesforce|sfdc|zapier|workato|sage|netsuite|xero|hubspot|servicetitan|procore|smartsheet|kronos|sharepoint|onedrive|dropbox|power ?bi|tableau|google (?:sheets|drive|calendar)|gsheets?|airtable|dynamics(?: 365)?|d365|adp|paychex|gusto|jobber|housecall pro)\b/i;

/** Short names of a known system, folded to its one key. */
const SYSTEM_KEYS: Record<string, string> = {
  qbo: "quickbooks",
  qb: "quickbooks",
  sfdc: "salesforce",
  gsheets: "googlesheets",
  gsheet: "googlesheets",
  d365: "dynamics",
  dynamics365: "dynamics",
};

/** "QuickBooks Online", "QBO" → "quickbooks"; "Power BI" → "powerbi": one key per known system. */
function knownSystem(text: string): string | null {
  const hit = KNOWN_SYSTEMS.exec(text)?.[0];
  if (!hit) return null;
  const key = hit
    .toLowerCase()
    .replace(/\s+online$/, "")
    .replace(/\s+/g, "");
  return SYSTEM_KEYS[key] ?? key;
}

/** Spaces and punctuation out, for "Service Titan" against "ServiceTitan". */
const collapsed = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * A form's PDF or email sent to a system is the core product, not a
 * connection: "Daily inspection, PDF emailed to the Procore project",
 * "Work order (PDF to the QuickBooks inbox)".
 */
const DELIVERY = /\b(pdfs?|e-?mail(?:ed|s)?|inbox|attach(?:ed|ments?)?)\b/i;

/** "PDF emailed to the …", "(PDF to …": the delivery word right before the system. */
const DELIVERED_BEFORE = new RegExp(
  `${DELIVERY.source}\\s+(?:(?:over\\s+)?(?:to|into|in)\\s+)?(?:the\\s+|their\\s+|our\\s+)?$`,
  "i",
);

/**
 * Is the system named at `at` only where a form's PDF or email goes? Only
 * when the delivery word governs it: said right before it ("PDF emailed to
 * the Procore project") or "… inbox" right after it. A PDF named next to a
 * sync ("Invoice PDF and QuickBooks sync") does not exempt the sync.
 */
function deliveredTo(text: string, at: number, length: number): boolean {
  const before = text.slice(0, at);
  const after = text.slice(at + length);
  return DELIVERED_BEFORE.test(before) || /^\s+(?:\w+\s+)?inbox\b/i.test(after);
}

/** Words a form is called as often as a system: alone they name a system only after "to" or "into". */
const FORM_NOUNS = new Set([
  "sheet",
  "sheets",
  "service",
  "services",
  "safety",
  "time",
  "work",
  "field",
  "ticket",
  "log",
  "check",
  "list",
]);

/**
 * The brief's own integration line as patterns for its system: the whole
 * name ("Google Sheets" → google…sheets), and each distinctive word of it on
 * its own ("Vista" for "Viewpoint Vista"), except a word a form is called as
 * often as a system ("sheet", "service", "safety"), which counts alone only
 * as where something goes ("logged to Sheets").
 */
function ownSystemPatterns(line: string): RegExp[] {
  const words = systemOf(line)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !GENERIC.has(w));
  if (!words.some((w) => !VENDOR.has(w)) || words.join("").length < 4) return [];
  const short = words
    .filter((w) => !VENDOR.has(w) && w.length >= 3)
    .map((w) =>
      FORM_NOUNS.has(w)
        ? new RegExp(`\\b(?:to|into)\\s+(?:the\\s+)?${w.replace(/s$/, "")}s?\\b`, "gi")
        : new RegExp(`\\b${w}\\b`, "gi"),
    );
  return [new RegExp(`\\b${words.join("[^a-z0-9]*")}\\b`, "gi"), ...short];
}

/**
 * Is this scope line or focus item an integration, rather than a form or a
 * goal? When it says so outright, or names a system — a known one, or the
 * name of one the brief's own integrations line names (see
 * ownSystemPatterns) — other than as where a form's PDF or email is sent.
 */
export function integrationLike(text: string, systems: ReadonlyArray<string> = []): boolean {
  if (INTEGRATION_WORDS.test(text)) return true;
  const patterns = [new RegExp(KNOWN_SYSTEMS.source, "gi"), ...systems.flatMap(ownSystemPatterns)];
  return patterns.some((p) =>
    [...text.matchAll(p)].some((m) => !deliveredTo(text, m.index ?? 0, m[0].length)),
  );
}

/** "Google Sheets · payroll hours" → "Google Sheets": the system, before the explanation. */
export function systemOf(line: string): string {
  return (line.split(/\s+[·•|:–—-]\s+/)[0] ?? line).trim();
}

/** The words that name a system, lower case, aliases folded, generic words out. */
function systemWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((w) => ALIASES[w] ?? w)
    .filter((w) => w.length >= 2 && !GENERIC.has(w));
}

/**
 * The systems the kept reading sells, each with the words it was sold in: an
 * integration row with the document's quote, or an integration service the
 * reader quoted or marked as plainly stated.
 */
export function soldSystems(reading: PurchaseReading | null): string[] {
  if (!reading) return [];
  return [
    ...reading.integrations.filter((i) => i.system.trim() && i.quote?.trim()).map((i) => i.system),
    ...reading.services
      .filter(
        (s) =>
          s.kind === "integration" &&
          s.name.trim() &&
          (s.evidence?.trim() || s.confidence === "stated"),
      )
      .map((s) => s.name),
  ];
}

/**
 * Systems the reading names as sold without showing the document's words for
 * them. Not proof either way: an item that matches one stays on the brief,
 * marked for a person to confirm, rather than being called "not purchased".
 */
export function namedUnshownSystems(reading: PurchaseReading | null): string[] {
  if (!reading) return [];
  return [
    ...reading.integrations.filter((i) => i.system.trim() && !i.quote?.trim()).map((i) => i.system),
    ...reading.services.filter((s) => s.kind === "integration" && s.name.trim()).map((s) => s.name),
  ];
}

/**
 * Does the document sell this? The SYSTEMS are compared, not the
 * descriptions: a known system by its one key ("QuickBooks Online" and the
 * SOW's "QBO integration"; "Power BI" and "PowerBI"), otherwise by the
 * system's own name, before any " · what it does", spaces ignored
 * ("Service Titan", "ServiceTitan"). A word the two descriptions share
 * ("payroll", "customer") never makes two systems one; vendor words alone
 * only when they are all the name has.
 */
export function soldBy(text: string, sold: ReadonlyArray<string>): boolean {
  const head = systemOf(text);
  const mine = knownSystem(head) ?? knownSystem(text);
  const words = systemWords(head);
  const distinctive = words.filter((w) => !VENDOR.has(w));
  return sold.some((name) => {
    const theirHead = systemOf(name);
    const theirs = knownSystem(theirHead) ?? knownSystem(name);
    if (mine && theirs) return mine === theirs;
    if (mine || theirs) {
      // One side a known system: its key inside the other's name, or the
      // other named by a short form of it ("Sheets" for "Google Sheets"),
      // every word of it in the known one's name. One shared ordinary word
      // ("calendar", "drive", "BI") is not the same system.
      const key = (mine ?? theirs)!;
      if (collapsed(mine ? name : text).includes(key)) return true;
      const short = systemWords(mine ? theirHead : head).filter((w) => !VENDOR.has(w));
      const known = new Set([key, ...systemWords(mine ? head : theirHead)]);
      return short.length > 0 && short.every((w) => known.has(w));
    }
    if (!words.length) return false;
    if (collapsed(head) === collapsed(theirHead)) return true;
    const their = new Set(systemWords(theirHead));
    if (distinctive.length) return distinctive.some((w) => their.has(w));
    return words.every((w) => their.has(w));
  });
}

/** The first sentence of the calls that names the system, for the TIS to read it in context. */
export function sentenceAbout(text: string, callsText: string): string | null {
  const words = systemWords(systemOf(text)).filter((w) => !VENDOR.has(w));
  const probe = words.length ? words : systemWords(text);
  if (!probe.length || !callsText.trim()) return null;
  const sentences = callsText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const hit = sentences.find((s) => {
    const own = new Set(systemWords(s));
    return probe.some((w) => own.has(w));
  });
  return hit ? hit.slice(0, 200) : null;
}

/** One key per system, so the integration line and the focus item that say the same thing are one entry. */
function discussedKey(item: string): string {
  const named = knownSystem(item);
  if (named) return named;
  return systemWords(systemOf(item)).join(" ") || item.toLowerCase().trim();
}

/**
 * The verification map with one list re-indexed after items left it: the
 * kept ones at their new places, and one "dropped" per item moved out, past
 * the end — the map's own rule for an item that is no longer on the list.
 */
function reindex(
  fields: Record<string, VerificationStatus>,
  path: string,
  kept: number[],
  before: number,
): void {
  if (kept.length === before) return;
  const old: Record<number, VerificationStatus | undefined> = {};
  for (let i = 0; i < before; i++) {
    old[i] = fields[`${path}[${i}]`];
    delete fields[`${path}[${i}]`];
  }
  kept.forEach((from, to) => {
    const status = old[from];
    if (status) fields[`${path}[${to}]`] = status;
  });
  for (let i = kept.length; i < before; i++) fields[`${path}[${i}]`] = "dropped";
}

/**
 * The brief with what was bought kept and what was only talked about moved
 * out. Pure: the same rule on the job, on a person's "Generate brief" and in
 * the tests.
 *
 *   - kickoff.integrations: kept only when the reading sells the system.
 *   - expansion.integration_target: the same; null when it does not.
 *   - kickoff.scope and welcome.focus_items: a line that is an integration
 *     (a connector, or a named system other than where a form's PDF or
 *     email goes) is kept only when sold; forms and goals are not touched
 *     here (see integrationLike).
 *   - onboarding.solutions_involved: null with no document to say what was
 *     bought; false when the document sells no service at all.
 *
 * Everything moved lands in `discussed_not_purchased`, once per system,
 * with the calls' own sentence for it when one names it.
 */
export function splitPurchased(
  brief: BriefJson,
  reading: PurchaseReading | null,
  opts: { record?: PurchaseRecord; callsText?: string } = {},
): BriefJson {
  // A SOW or a contract is on file but there is no usable reading of it yet
  // (still queued, failed, or unreadable): nothing says what it sells, so
  // nothing is called "not purchased". Its integrations stay, marked for a
  // person to confirm.
  if (reading === null && (opts.record === "sow" || opts.record === "contract")) {
    return unconfirmedPurchases(brief);
  }
  const sold = soldSystems(reading);
  const unshown = namedUnshownSystems(reading);
  const callsText = opts.callsText ?? "";
  const discussed: DiscussedItem[] = [...(brief.discussed_not_purchased ?? [])];
  const seen = new Set(discussed.map((d) => discussedKey(d.item)));
  const move = (item: string, from: DiscussedItem["from"], quote: string | null = null) => {
    const key = discussedKey(item);
    if (seen.has(key)) return;
    seen.add(key);
    const q = quote?.trim() || sentenceAbout(item, callsText);
    discussed.push({ item, from, quote: q, source: q ? "calls" : null });
  };
  const fields: Record<string, VerificationStatus> = { ...(brief.verification?.fields ?? {}) };

  // The integrations the deck and the handoff read.
  const integrationsKept: number[] = [];
  // Named by the reading without its words: kept, for a person to confirm.
  const toConfirm = new Set<number>();
  brief.kickoff.integrations.forEach((line, i) => {
    if (soldBy(systemOf(line), sold)) integrationsKept.push(i);
    else if (soldBy(systemOf(line), unshown)) {
      integrationsKept.push(i);
      toConfirm.add(i);
    } else move(line, "integration");
  });
  reindex(fields, "kickoff.integrations", integrationsKept, brief.kickoff.integrations.length);
  // Sold in the document's own words: grounded, whatever the call check
  // found, so the handoff never holds a sold line back as "to confirm".
  integrationsKept.forEach((from, to) => {
    fields[`kickoff.integrations[${to}]`] = toConfirm.has(from) ? "unverified" : "grounded";
  });
  const systems = brief.kickoff.integrations;
  const unsold = (text: string) =>
    integrationLike(text, systems) && !soldBy(text, sold) && !soldBy(text, unshown);

  // The phase-one scope: only the lines that are integrations are judged.
  const scopeKept: number[] = [];
  brief.kickoff.scope.forEach((row, i) => {
    if (unsold(row.workflow)) move(row.workflow, "scope");
    else scopeKept.push(i);
  });
  reindex(fields, "kickoff.scope", scopeKept, brief.kickoff.scope.length);

  // The expansion's one system.
  const target = brief.expansion.integration_target?.trim() || null;
  const targetSold = target ? soldBy(target, sold) || soldBy(target, unshown) : false;
  if (target && !targetSold) move(target, "expansion");

  // What the welcome page says this implementation delivers.
  let welcome = brief.welcome;
  if (welcome) {
    const focusKept: number[] = [];
    welcome.focus_items.forEach((f, i) => {
      if (unsold(f.text)) move(f.text, "focus", f.quote || null);
      else focusKept.push(i);
    });
    reindex(fields, "welcome.focus_items", focusKept, welcome.focus_items.length);
    welcome = { ...welcome, focus_items: focusKept.map((i) => welcome!.focus_items[i]!) };
  }

  // Whether services beyond the core product were bought is the document's
  // to say: unknown without one, no when it sells none.
  let onboarding = brief.onboarding;
  if (onboarding && onboarding.solutions_involved === true) {
    const sellsServices = Boolean(
      reading && (reading.services.length > 0 || reading.integrations.length > 0),
    );
    if (!reading || opts.record === null) onboarding = { ...onboarding, solutions_involved: null };
    else if (!sellsServices) onboarding = { ...onboarding, solutions_involved: false };
  }

  return {
    ...brief,
    kickoff: {
      ...brief.kickoff,
      integrations: integrationsKept.map((i) => brief.kickoff.integrations[i]!),
      scope: scopeKept.map((i) => brief.kickoff.scope[i]!),
    },
    expansion: { ...brief.expansion, integration_target: targetSold ? target : null },
    ...(welcome ? { welcome } : {}),
    ...(onboarding ? { onboarding } : {}),
    discussed_not_purchased: discussed,
    ...(brief.verification ? { verification: { ...brief.verification, fields } } : {}),
  };
}

/**
 * The brief as written, its integrations marked for a person to confirm:
 * a document is on file, but no reading of it says what it sells yet.
 */
function unconfirmedPurchases(brief: BriefJson): BriefJson {
  if (!brief.verification) return brief;
  const fields: Record<string, VerificationStatus> = { ...brief.verification.fields };
  brief.kickoff.integrations.forEach((_, i) => {
    fields[`kickoff.integrations[${i}]`] = "unverified";
  });
  return { ...brief, verification: { ...brief.verification, fields } };
}

/** "Discussed on the calls, not purchased: Google Sheets · payroll hours", for the TIS's open questions. */
export function discussedLine(d: Pick<DiscussedItem, "item">): string {
  return `Discussed on the calls, not purchased: ${d.item}`;
}
