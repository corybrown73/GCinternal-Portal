import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { readIntake } from "../intake-answers";
import { prefillHandoffFromSynthesis } from "../intake-prefill";
import { timelineFor } from "../onboarding-plan";
import { purchaseRecordOf, sharedPrefix } from "../server/ai/sources";
import type { PreparedDocument } from "../server/ai/documents";
import {
  BRIEF_CORE_TASK,
  BRIEF_SYSTEM_PROMPT,
  CONTRACT_ATTACHED_NOTE,
  NO_PURCHASE_RECORD_NOTE,
  PURCHASE_RULE,
  SOW_ATTACHED_NOTE,
  briefVerifyTask,
} from "../server/brief/prompt";
import {
  integrationLike,
  soldBy,
  splitPurchased,
  type PurchaseReading,
} from "../server/brief/purchased";
import { finalizeRequirements } from "../server/brief/requirements";
import { unverifiedMap } from "../server/brief/verify";
import { briefCoreSchema, briefJsonSchema, type BriefJson } from "../server/schemas";
import { buildKickoffData } from "../kickoff-fields";
import { watchOutsFor } from "../watch-outs";
import {
  SUTTON_BRIEF,
  SUTTON_CALLS_TEXT,
  SUTTON_CONTRACT_READING,
  SUTTON_CONTRACT_TEXT,
} from "./fixtures/sutton-farms-brief";

/** A document as the model reads it, built from text: enough for the prefix. */
function doc(name: string, text: string): PreparedDocument {
  return {
    kind: "text",
    block: { type: "text", text },
    text,
    bytes: new Uint8Array(),
    sha256: name,
    name,
    mediaType: "text/plain",
    truncated: false,
    problem: null,
  };
}

const prefixText = (blocks: ReturnType<typeof sharedPrefix>) =>
  blocks.map((b) => ("text" in b ? b.text : "")).join("\n");

const account = {
  id: "deal-1",
  name: "Sutton Farms",
  domain: null,
  arr: null,
  products: [],
  stage: "negotiate",
  summary: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
} as any;
const reports = [
  {
    id: "r1",
    account_id: "deal-1",
    report_type: "call_notes",
    title: "Discovery call",
    content_md: SUTTON_CALLS_TEXT,
    uploaded_by: null,
    created_at: "2026-10-02T00:00:00Z",
  },
] as any;

describe("the purchase rule in the prompt", () => {
  it("says the SOW, else the contract, is what was bought and the calls are only discussed", () => {
    expect(BRIEF_SYSTEM_PROMPT).toMatch(/The signed SOW is the record of what was bought/);
    expect(BRIEF_SYSTEM_PROMPT).toMatch(/signed contract or order form is/);
    expect(BRIEF_SYSTEM_PROMPT).toMatch(/DISCUSSED, not purchased/);
    expect(BRIEF_SYSTEM_PROMPT).toMatch(/scope is unconfirmed/);
    expect(BRIEF_SYSTEM_PROMPT).toMatch(/integrations: only systems the SOW/);
    expect(BRIEF_CORE_TASK).toMatch(/requirements/);
    expect(briefVerifyTask("{}")).toMatch(/kickoff\.integrations/);
    expect(briefVerifyTask("{}")).toMatch(/welcome\.focus_items/);
    for (const note of [SOW_ATTACHED_NOTE, CONTRACT_ATTACHED_NOTE, NO_PURCHASE_RECORD_NOTE]) {
      expect(note).toContain(PURCHASE_RULE);
    }
  });

  it("puts the contract's note in the shared prefix on a contract-only deal, and labels its reading", () => {
    const contract = doc("Order form.txt", SUTTON_CONTRACT_TEXT);
    const sources = { account, reports, notes: [], sow: null, contract };
    expect(purchaseRecordOf(sources)).toBe("contract");
    const text = prefixText(sharedPrefix(sources, { sowReading: { seats: 25 } }));
    expect(text).toContain(CONTRACT_ATTACHED_NOTE);
    expect(text).toContain("was DISCUSSED, not purchased");
    expect(text).toContain("WHAT THE SIGNED CONTRACT SAYS");
    expect(text).not.toContain("WHAT THE SIGNED SOW SAYS");
    expect(text).not.toContain(SOW_ATTACHED_NOTE);
  });

  it("says scope is unconfirmed when neither document is on file", () => {
    const sources = { account, reports, notes: [], sow: null, contract: null };
    expect(purchaseRecordOf(sources)).toBeNull();
    const text = prefixText(sharedPrefix(sources));
    expect(text).toContain(NO_PURCHASE_RECORD_NOTE);
    expect(text).toMatch(/what was bought is unconfirmed/);
  });

  it("keeps the SOW's note when the SOW was read", () => {
    const sow = doc("SOW.txt", "Statement of Work: one form, QuickBooks Online integration.");
    const sources = { account, reports, notes: [], sow, contract: null };
    expect(purchaseRecordOf(sources)).toBe("sow");
    expect(prefixText(sharedPrefix(sources))).toContain(SOW_ATTACHED_NOTE);
  });
});

describe("splitPurchased — Sutton Farms", () => {
  const split = splitPurchased(SUTTON_BRIEF, SUTTON_CONTRACT_READING, {
    record: "contract",
    callsText: SUTTON_CALLS_TEXT,
  });

  it("moves the Google Sheets integration the contract does not sell to 'discussed, not purchased'", () => {
    expect(split.kickoff.integrations).toEqual([]);
    expect(split.discussed_not_purchased).toHaveLength(1);
    expect(split.discussed_not_purchased![0]).toMatchObject({
      item: "Google Sheets · payroll hours from the bin tally",
      from: "integration",
      source: "calls",
    });
    expect(split.discussed_not_purchased![0]!.quote).toMatch(/Google Sheets payroll sheet/);
  });

  it("takes the same system off the scope and the welcome page's focus, and keeps the form", () => {
    expect(split.kickoff.scope.map((s) => s.workflow)).toEqual(["Bin tally"]);
    expect(split.welcome?.focus_items.map((f) => f.text)).toEqual(["Bin tally on the phone"]);
    expect(split.onboarding?.forms.map((f) => f.name)).toEqual(["Bin tally"]);
  });

  it("re-indexes the verification map so the deck flags the right items", () => {
    expect(split.verification?.fields).toMatchObject({
      "kickoff.integrations[0]": "dropped",
      "kickoff.scope[0]": "grounded",
      "kickoff.scope[1]": "dropped",
      "welcome.focus_items[0]": "grounded",
      "welcome.focus_items[1]": "dropped",
    });
  });

  it("says no services were bought when the contract sells none, and unknown with no document", () => {
    expect(split.onboarding?.solutions_involved).toBe(false);
    const none = splitPurchased(SUTTON_BRIEF, null, { record: null, callsText: SUTTON_CALLS_TEXT });
    expect(none.onboarding?.solutions_involved).toBeNull();
    expect(none.kickoff.integrations).toEqual([]);
  });

  it("keeps an integration the document sells, with its words; one it names without them is kept to confirm", () => {
    const sells = {
      services: [],
      integrations: [
        {
          system: "Google Sheets",
          direction: "GoCanvas -> Sheets",
          tier: 2,
          quote: "Google Sheets export of bin tallies",
        },
      ],
    };
    const kept = splitPurchased(SUTTON_BRIEF, sells, { record: "sow" });
    expect(kept.kickoff.integrations).toEqual(["Google Sheets · payroll hours from the bin tally"]);
    expect(kept.discussed_not_purchased).toEqual([]);
    const unquoted = splitPurchased(
      SUTTON_BRIEF,
      { services: [], integrations: [{ ...sells.integrations[0]!, quote: null }] },
      { record: "sow" },
    );
    expect(unquoted.kickoff.integrations).toEqual([
      "Google Sheets · payroll hours from the bin tally",
    ]);
    expect(unquoted.verification?.fields["kickoff.integrations[0]"]).toBe("unverified");
    expect(unquoted.discussed_not_purchased).toEqual([]);
    // An integration service the reader marked as plainly stated counts as sold.
    const stated = splitPurchased(
      SUTTON_BRIEF,
      {
        integrations: [],
        services: [
          {
            kind: "integration",
            name: "Google Sheets",
            tier: 2,
            weeks: null,
            phase: 2,
            needs: null,
            evidence: null,
            confidence: "stated",
          },
        ],
      },
      { record: "sow" },
    );
    expect(stated.kickoff.integrations).toHaveLength(1);
    expect(stated.verification?.fields["kickoff.integrations[0]"]).not.toBe("unverified");
  });

  it("moves nothing while the document on file has no usable reading", () => {
    // Still queued, failed, or unreadable: nothing says what it sells.
    for (const record of ["sow", "contract"] as const) {
      const split = splitPurchased(SUTTON_BRIEF, null, { record, callsText: SUTTON_CALLS_TEXT });
      expect(split.kickoff.integrations).toEqual(SUTTON_BRIEF.kickoff.integrations);
      expect(split.kickoff.scope).toEqual(SUTTON_BRIEF.kickoff.scope);
      expect(split.welcome?.focus_items).toEqual(SUTTON_BRIEF.welcome?.focus_items);
      expect(split.discussed_not_purchased ?? []).toEqual([]);
      expect(split.verification?.fields["kickoff.integrations[0]"]).toBe("unverified");
    }
  });

  it("keeps a form's ordinary workflow wording in scope and on the welcome page", () => {
    const rows = [
      "Bin tally exported to the office as a PDF",
      "Daily timesheet that feeds into payroll",
      "Work order pushed to the office",
    ];
    const brief: BriefJson = {
      ...SUTTON_BRIEF,
      kickoff: {
        ...SUTTON_BRIEF.kickoff,
        integrations: [],
        scope: rows.map((workflow) => ({ workflow, replaces: null, teams: null })),
      },
      welcome: {
        ...SUTTON_BRIEF.welcome!,
        focus_items: [
          {
            ...SUTTON_BRIEF.welcome!.focus_items[0]!,
            text: "Bin tally synced to the office in real time",
          },
        ],
      },
    };
    const split = splitPurchased(brief, SUTTON_CONTRACT_READING, { record: "contract" });
    expect(split.kickoff.scope.map((r) => r.workflow)).toEqual(rows);
    expect(split.welcome?.focus_items.map((f) => f.text)).toEqual([
      "Bin tally synced to the office in real time",
    ]);
    expect(split.discussed_not_purchased).toEqual([]);
    // A named system, or one the brief's own integrations line names, is judged.
    expect(
      integrationLike("Payroll hours logged to Google Sheets", ["Google Sheets · payroll"]),
    ).toBe(true);
    expect(integrationLike("Daily timesheet that feeds into payroll")).toBe(false);
  });

  it("compares the systems, not the descriptions", () => {
    // A shared description word is not the same system.
    expect(soldBy("Google Sheets payroll export", ["ADP payroll integration"])).toBe(false);
    expect(soldBy("HubSpot customer sync", ["Salesforce customer records"])).toBe(false);
    expect(soldBy("Inventory sync with NetSuite", ["Inventory integration with Sage"])).toBe(false);
    expect(soldBy("Google Sheets · payroll hours", ["Payroll integration (ADP)"])).toBe(false);
    // Spellings of the same system are the same system.
    expect(soldBy("Power BI · dashboards", ["PowerBI"])).toBe(true);
    expect(soldBy("ServiceTitan · jobs", ["Service Titan"])).toBe(true);
    expect(soldBy("QuickBooks Online · invoices", ["QBO"])).toBe(true);
    expect(soldBy("Acme ERP · orders", ["Acme ERP integration"])).toBe(true);
  });

  it("never takes a form out of the scope or the focus for sharing a word with a system", () => {
    // Sutton's shape: a calls-only Google Sheets line, and forms called "sheet".
    const brief: BriefJson = {
      ...SUTTON_BRIEF,
      kickoff: {
        ...SUTTON_BRIEF.kickoff,
        scope: [
          { workflow: "Bin tally sheet", replaces: "Paper bin tally", teams: "Crew leads" },
          { workflow: "Field time sheet", replaces: null, teams: null },
          { workflow: "Payroll hours sync to Google Sheets", replaces: null, teams: null },
        ],
      },
      welcome: {
        ...SUTTON_BRIEF.welcome!,
        focus_items: [
          { ...SUTTON_BRIEF.welcome!.focus_items[0]!, text: "Bin tally sheet on the phone" },
        ],
      },
    };
    const split = splitPurchased(brief, SUTTON_CONTRACT_READING, { record: "contract" });
    expect(split.kickoff.scope.map((r) => r.workflow)).toEqual([
      "Bin tally sheet",
      "Field time sheet",
    ]);
    expect(split.welcome?.focus_items.map((f) => f.text)).toEqual(["Bin tally sheet on the phone"]);
    expect(split.discussed_not_purchased?.map((d) => d.item)).toEqual([
      "Google Sheets · payroll hours from the bin tally",
    ]);
    // One word of a system's name is not the system.
    expect(integrationLike("Service ticket", ["Service Fusion · work orders"])).toBe(false);
    expect(integrationLike("Daily safety inspection", ["Safety Culture · audits"])).toBe(false);
    expect(integrationLike("Jobs pushed to Service Fusion", ["Service Fusion · work orders"])).toBe(
      true,
    );
  });

  it("keeps a form whose PDF or email goes to a system; judges a sync to it", () => {
    const brief: BriefJson = {
      ...SUTTON_BRIEF,
      kickoff: {
        ...SUTTON_BRIEF.kickoff,
        integrations: [],
        scope: [
          {
            workflow: "Daily inspection — PDF emailed to the Procore project",
            replaces: null,
            teams: null,
          },
          { workflow: "Work order (PDF to QuickBooks inbox)", replaces: null, teams: null },
          { workflow: "Push invoices to QuickBooks", replaces: null, teams: null },
        ],
      },
      welcome: { ...SUTTON_BRIEF.welcome!, focus_items: [] },
    };
    const reading = {
      services: [
        {
          kind: "paid_form",
          name: "Daily inspection",
          evidence: "Daily inspection form",
          confidence: "stated",
        },
      ],
      integrations: [],
    } as unknown as PurchaseReading;
    const split = splitPurchased(brief, reading, { record: "sow" });
    expect(split.kickoff.scope.map((r) => r.workflow)).toEqual([
      "Daily inspection — PDF emailed to the Procore project",
      "Work order (PDF to QuickBooks inbox)",
    ]);
    expect(split.discussed_not_purchased?.map((d) => d.item)).toEqual([
      "Push invoices to QuickBooks",
    ]);
  });

  it("knows a system by its short names", () => {
    expect(soldBy("Salesforce · accounts", ["SFDC connector"])).toBe(true);
    expect(soldBy("SFDC · accounts", ["Salesforce integration"])).toBe(true);
    expect(soldBy("Sheets · payroll", ["Google Sheets integration"])).toBe(true);
    expect(soldBy("GSheets · payroll", ["Google Sheets integration"])).toBe(true);
    expect(soldBy("Google Sheets · payroll", ["GSheets"])).toBe(true);
    expect(soldBy("QB · invoices", ["QuickBooks Online"])).toBe(true);
    expect(soldBy("D365 · jobs", ["Microsoft Dynamics 365"])).toBe(true);
    // Still not another system.
    expect(soldBy("Sheets · payroll", ["Google Drive"])).toBe(false);
    expect(soldBy("SFDC · accounts", ["HubSpot"])).toBe(false);
    const brief: BriefJson = {
      ...SUTTON_BRIEF,
      kickoff: {
        ...SUTTON_BRIEF.kickoff,
        scope: [],
        integrations: ["Salesforce · accounts and work orders"],
      },
      welcome: { ...SUTTON_BRIEF.welcome!, focus_items: [] },
    };
    const split = splitPurchased(
      brief,
      {
        services: [],
        integrations: [{ system: "SFDC", quote: "Integration to SFDC", direction: null, tier: 3 }],
      } as unknown as PurchaseReading,
      { record: "sow" },
    );
    expect(split.kickoff.integrations).toEqual(["Salesforce · accounts and work orders"]);
    expect(split.discussed_not_purchased ?? []).toEqual([]);
  });

  it("never calls two systems one for an ordinary word they share when only one is a known system", () => {
    expect(soldBy("Outlook Calendar · schedule", ["Google Calendar integration"])).toBe(false);
    expect(soldBy("Google Calendar · schedule", ["Outlook Calendar integration"])).toBe(false);
    expect(soldBy("Google Drive · photos", ["Box Drive"])).toBe(false);
    expect(soldBy("Excel sheet · hours", ["Google Sheets integration"])).toBe(false);
    expect(soldBy("Power BI · dashboards", ["Looker BI dashboards"])).toBe(false);
    // A short form of the known system is still that system.
    expect(soldBy("Sheets · payroll", ["Google Sheets integration"])).toBe(true);
    expect(soldBy("Google Sheets · payroll", ["Sheets export"])).toBe(true);
    expect(soldBy("Service Titan · jobs", ["ServiceTitan"])).toBe(true);
    // End to end: the unsold Outlook line never reaches the customer-visible answer.
    const brief: BriefJson = {
      ...SUTTON_BRIEF,
      kickoff: { ...SUTTON_BRIEF.kickoff, integrations: ["Outlook Calendar · crew schedule"] },
    };
    const reading = {
      services: [],
      integrations: [
        {
          system: "Google Calendar",
          quote: "Integration: Google Calendar",
          direction: null,
          tier: 2,
        },
      ],
    } as unknown as PurchaseReading;
    const split = splitPurchased(brief, reading, { record: "sow" });
    expect(split.kickoff.integrations).toEqual([]);
    const { answers } = prefillHandoffFromSynthesis(readIntake({}), split, "2026-10-16T00:00:00Z");
    expect(String(answers["system_requirements"]?.value ?? "")).not.toMatch(/Outlook/);
  });

  it("judges a sync named next to a PDF or an email", () => {
    expect(integrationLike("Invoice PDF and QuickBooks sync")).toBe(true);
    expect(integrationLike("Job completion email and Salesforce update")).toBe(true);
    expect(integrationLike("Daily report emailed and synced to Procore")).toBe(true);
    // Still only a delivery when the PDF or email goes to the system.
    expect(integrationLike("Daily inspection — PDF emailed to the Procore project")).toBe(false);
    expect(integrationLike("Work order (PDF to QuickBooks inbox)")).toBe(false);
    expect(integrationLike("Work order PDF to the office, a copy in the QuickBooks inbox")).toBe(
      false,
    );
    const brief: BriefJson = {
      ...SUTTON_BRIEF,
      kickoff: {
        ...SUTTON_BRIEF.kickoff,
        integrations: [],
        scope: [
          { workflow: "Bin tally PDF and QuickBooks invoice sync", replaces: null, teams: null },
        ],
      },
      welcome: {
        ...SUTTON_BRIEF.welcome!,
        focus_items: [
          { ...SUTTON_BRIEF.welcome!.focus_items[0]!, text: "Inspection PDF and QuickBooks sync" },
        ],
      },
    };
    const reading = {
      services: [],
      integrations: [
        {
          system: "Google Calendar",
          quote: "Integration: Google Calendar",
          direction: null,
          tier: 2,
        },
      ],
    } as unknown as PurchaseReading;
    const split = splitPurchased(brief, reading, { record: "sow" });
    expect(split.kickoff.scope).toEqual([]);
    expect(split.welcome?.focus_items).toEqual([]);
    expect(split.discussed_not_purchased?.map((d) => d.item)).toEqual([
      "Bin tally PDF and QuickBooks invoice sync",
    ]);
  });

  it("judges a line that names a brief system by its short name", () => {
    expect(integrationLike("Job cost export to Vista", ["Viewpoint Vista · job costing"])).toBe(
      true,
    );
    expect(integrationLike("Payroll hours logged to Sheets", ["Google Sheets · payroll"])).toBe(
      true,
    );
    // A form called by the same word is still a form.
    expect(integrationLike("Bin tally sheet", ["Google Sheets · payroll"])).toBe(false);
    expect(integrationLike("Service ticket", ["Service Fusion · work orders"])).toBe(false);
    expect(integrationLike("Daily safety inspection", ["Safety Culture · audits"])).toBe(false);
  });

  it("writes a SOW-sold integration to the handoff, whatever the call check marked", () => {
    // The verifier could not find the line's quote in the calls; the SOW sells it.
    const brief: BriefJson = {
      ...SUTTON_BRIEF,
      verification: {
        ...SUTTON_BRIEF.verification!,
        fields: { ...SUTTON_BRIEF.verification!.fields, "kickoff.integrations[0]": "unverified" },
      },
    };
    const reading = {
      services: [],
      integrations: [
        {
          system: "Google Sheets",
          quote: "Integration: Google Sheets payroll export",
          direction: null,
          tier: 2,
        },
      ],
    } as unknown as PurchaseReading;
    const split = splitPurchased(brief, reading, { record: "sow" });
    expect(split.kickoff.integrations).toEqual(SUTTON_BRIEF.kickoff.integrations);
    expect(split.verification?.fields["kickoff.integrations[0]"]).toBe("grounded");
    const { answers } = prefillHandoffFromSynthesis(readIntake({}), split, "2026-10-16T00:00:00Z");
    expect(answers["system_requirements"]?.value).toBe(SUTTON_BRIEF.kickoff.integrations[0]);
    expect(String(answers["open_questions"]?.value ?? "")).not.toMatch(/to confirm against/);
  });

  it("matches a system by its distinctive word, never by a vendor word alone", () => {
    expect(soldBy("QuickBooks Online", ["QBO integration"])).toBe(true);
    expect(soldBy("Google Sheets", ["Google Drive"])).toBe(false);
    expect(integrationLike("Payroll hours sync to Google Sheets")).toBe(true);
    expect(integrationLike("Bin tally")).toBe(false);
  });

  it("keeps discussed items off the customer-visible handoff answer and on the internal open questions", () => {
    const { answers } = prefillHandoffFromSynthesis(readIntake({}), split, "2026-10-16T00:00:00Z");
    expect(answers["system_requirements"]).toBeUndefined();
    expect(String(answers["open_questions"]?.value)).toMatch(
      /Discussed on the calls, not purchased: Google Sheets/,
    );
    // An earlier reading's own answer that named Sheets is taken back.
    const earlier = readIntake({
      handoff: {
        answers: {
          system_requirements: {
            value: "Google Sheets · payroll hours from the bin tally",
            source: "ai",
            at: "2026-10-10T00:00:00Z",
            by: null,
            quote: null,
          },
        },
      },
    });
    const again = prefillHandoffFromSynthesis(earlier, split, "2026-10-16T00:00:00Z");
    expect(again.answers["system_requirements"]?.value).toBeNull();
    // A person's answer is never touched.
    const typed = readIntake({
      handoff: {
        answers: {
          system_requirements: {
            value: "Google Sheets, maybe later",
            source: "sales",
            at: "2026-10-10T00:00:00Z",
            by: null,
            quote: null,
          },
        },
      },
    });
    expect(
      prefillHandoffFromSynthesis(typed, split, "2026-10-16T00:00:00Z").answers[
        "system_requirements"
      ],
    ).toBeUndefined();
  });

  it("keeps an integration nobody has confirmed off the customer-visible answer", () => {
    // A contract on file with no usable reading: the line stays on the brief,
    // marked unverified, and reaches only the internal open questions.
    const unread = splitPurchased(SUTTON_BRIEF, null, { record: "contract" });
    expect(unread.kickoff.integrations).toHaveLength(1);
    const { answers } = prefillHandoffFromSynthesis(readIntake({}), unread, "2026-10-16T00:00:00Z");
    expect(answers["system_requirements"]).toBeUndefined();
    expect(String(answers["open_questions"]?.value)).toMatch(
      /Integration to confirm against the SOW or contract: Google Sheets · payroll hours/,
    );
    // An earlier AI answer naming it is taken back; a confirmed one is written.
    const earlier = readIntake({
      handoff: {
        answers: {
          system_requirements: {
            value: "Google Sheets · payroll hours from the bin tally",
            source: "ai",
            at: "2026-10-10T00:00:00Z",
            by: null,
            quote: null,
          },
        },
      },
    });
    expect(
      prefillHandoffFromSynthesis(earlier, unread, "2026-10-16T00:00:00Z").answers[
        "system_requirements"
      ]?.value,
    ).toBeNull();
    const confirmed = {
      ...unread,
      verification: { ...unread.verification!, fields: {} },
    };
    expect(
      prefillHandoffFromSynthesis(readIntake({}), confirmed, "2026-10-16T00:00:00Z").answers[
        "system_requirements"
      ]?.value,
    ).toBe("Google Sheets · payroll hours from the bin tally");
  });

  it("raises the discussed item as a watch-out to check, never a conflict", () => {
    const intake = readIntake({ path: "new_logo" });
    const rows = watchOutsFor({
      brief: split,
      intake,
      timeline: timelineFor(intake, "2026-10-01"),
    });
    const row = rows.find((r) => r.key.startsWith("discussed-"));
    expect(row).toMatchObject({ severity: "check", type: "scope" });
    expect(row?.title).toMatch(/not purchased: Google Sheets/);
  });
});

describe("requirements — the customer's specific needs", () => {
  it("keeps the model's QR-code item, once, even when its quote cannot be found", () => {
    const out = finalizeRequirements(
      [
        {
          text: "Scan the QR code on each bin and field",
          kind: "form_feature",
          quote: "Each bin and each field carries a QR code",
          source: "Workflow walkthrough",
        },
        {
          text: "Scan the QR code on each bin and field",
          kind: "form_feature",
          quote: "duplicate",
          source: "Workflow walkthrough",
        },
        { text: "  ", kind: "other", quote: "", source: "" },
      ],
      SUTTON_CALLS_TEXT,
    );
    const qr = out.filter((r) => /QR/.test(r.text));
    expect(qr).toHaveLength(1);
    expect(qr[0]!.quote).toBe("Each bin and each field carries a QR code");
  });

  it("judges a negation in its own clause, and knows the common ways of saying no", () => {
    const needs = (said: string) => finalizeRequirements([], said).map((r) => r.text);
    // One thing negated does not hide another in the same sentence.
    expect(needs("They don't need photos, but every bin has a QR code.")).toEqual([
      "Scan QR codes",
    ]);
    expect(needs("A signature is not required; they scan a barcode on each pallet.")).toEqual([
      "Scan barcodes",
    ]);
    // Ways of saying no.
    expect(needs("We do not use QR codes.")).toEqual([]);
    expect(needs("No QR codes, they hate them.")).toEqual([]);
    expect(needs("They won\u2019t be scanning barcodes.")).toEqual([]);
    expect(needs("GPS is not needed on this form.")).toEqual([]);
    // An idiom is not a need.
    expect(needs("Let's take the pricing conversation offline.")).toEqual([]);
    // A "no" about something else in the clause does not deny the need.
    expect(needs("We don't want to lose a single entry when the crews are offline.")).toEqual([
      "Work offline, with no signal",
    ]);
    expect(needs("The techs never use their phones out there because there's no signal.")).toEqual([
      "Work offline, with no signal",
    ]);
    expect(
      needs("We don't want the guys typing serial numbers when they could scan the barcode."),
    ).toEqual(["Scan barcodes"]);
    expect(needs("The crews are taking readings offline in the basement all day.")).toEqual([
      "Work offline, with no signal",
    ]);
    expect(needs("Let's take that offline.")).toEqual([]);
    expect(needs("We don't need to scan QR codes.")).toEqual([]);
    expect(needs("No need for GPS.")).toEqual([]);
    expect(needs("Barcodes aren't needed.")).toEqual([]);
    // Still a need.
    expect(needs("Crews won't be in signal range, so the form must work offline.")).toEqual([
      "Work offline, with no signal",
    ]);
  });

  it("adds the QR code and offline needs from the calls when the model missed them, and not a negated one", () => {
    const out = finalizeRequirements([], SUTTON_CALLS_TEXT);
    const qr = out.find((r) => r.text === "Scan QR codes");
    expect(qr).toMatchObject({ kind: "form_feature", source: "calls" });
    expect(qr!.quote).toMatch(/Each bin and each field carries a QR code/);
    expect(out.some((r) => /offline/i.test(r.text))).toBe(true);
    // "They do not need GPS on the form."
    expect(out.some((r) => /GPS/.test(r.text))).toBe(false);
  });

  it("marks requirements in the verification map and lists them in the deck's notes, not on a slide", () => {
    const withNeeds: BriefJson = {
      ...SUTTON_BRIEF,
      requirements: finalizeRequirements([], SUTTON_CALLS_TEXT),
    };
    const map = unverifiedMap(withNeeds, "2026-10-16T00:00:00Z");
    expect(map.fields["requirements[0]"]).toBe("unverified");
    expect(map.fields["kickoff.integrations[0]"]).toBe("unverified");
    expect(map.fields["welcome.focus_items[1]"]).toBe("unverified");

    const split = splitPurchased(withNeeds, SUTTON_CONTRACT_READING, {
      record: "contract",
      callsText: SUTTON_CALLS_TEXT,
    });
    const deck = buildKickoffData({
      brief: split,
      clientName: "Sutton Farms",
      preparedAt: "2026-10-16T09:00:00.000Z",
      team: [],
      clientPeople: [],
      stages: [],
      customerTasks: [],
      risks: [],
      successCriteria: [],
      requirements: [],
      solutions: [],
      functionalBy: null,
      itContact: null,
    });
    expect(deck.internal?.requirements.some((r) => /QR/.test(r))).toBe(true);
    expect(deck.internal?.discussed).toEqual(["Google Sheets · payroll hours from the bin tally"]);
    expect(Object.values(deck.fields).some((v) => /QR|Google Sheets/.test(v))).toBe(false);
  });
});

describe("requirements against what was signed", () => {
  it("raises a conflict when the signed document rules out a need the customer stated", () => {
    const intake = readIntake({
      path: "new_logo",
      timeline: {
        sow_notes: ["QR code scanning hardware and setup are excluded from this order."],
      },
    });
    const brief = { ...SUTTON_BRIEF, requirements: finalizeRequirements([], SUTTON_CALLS_TEXT) };
    const rows = watchOutsFor({ brief, intake, timeline: timelineFor(intake, "2026-10-01") });
    const row = rows.find((r) => r.key.startsWith("need-excluded-"));
    expect(row).toMatchObject({ severity: "conflict", type: "scope" });
    expect(row?.title).toMatch(/QR codes; the SOW rules it out/);
    expect(row?.against?.quote).toMatch(/excluded/);
    // Offline was not ruled out: no row for it.
    expect(rows.filter((r) => r.key.startsWith("need-excluded-"))).toHaveLength(1);
  });
});

describe("the brief's schemas read old briefs", () => {
  it("parses a stored brief written before requirements and the purchase check", () => {
    const old: Record<string, unknown> = { ...SUTTON_BRIEF };
    delete old["requirements"];
    delete old["discussed_not_purchased"];
    const parsed = briefJsonSchema.safeParse(old);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.requirements).toBeUndefined();
  });

  it("parses a core kept before requirements existed, with the list empty", () => {
    const core = briefCoreSchema.parse({
      account_name: "Sutton Farms",
      one_liner: "x",
      account: { industry: null, company_size: null, field_users: null, website: null },
      current_process: [],
      goals: [],
      what_we_know: [],
      stakeholders: [],
      risks_open_items: [],
      dates: [],
      discovery_questions: [],
      process_gaps: [],
    });
    expect(core.requirements).toEqual([]);
  });

  it("parses a new brief with requirements and discussed items", () => {
    const split = splitPurchased(
      { ...SUTTON_BRIEF, requirements: finalizeRequirements([], SUTTON_CALLS_TEXT) },
      SUTTON_CONTRACT_READING,
      { record: "contract", callsText: SUTTON_CALLS_TEXT },
    );
    expect(briefJsonSchema.safeParse(split).success).toBe(true);
  });
});
