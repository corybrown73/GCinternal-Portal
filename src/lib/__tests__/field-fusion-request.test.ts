import { describe, expect, it, vi } from "vitest";

import { readIntake, type IntakeAnswers } from "../intake-answers";
import type { AccountUpsertInput } from "../server/schemas";
import {
  fieldFusionRequestRowSchema,
  industryFor,
  ingestFieldFusionRequest,
  normalizeRequestRow,
  parseList,
  setupNotesFrom,
  type RequestDeps,
} from "../server/field-fusion-request";

/**
 * The New FF Client Request webhook: the GoCanvas form, via Zapier, opens a
 * Field Fusion proof-of-concept deal and keeps every answer on it.
 *
 * WHAT MATTERS. That the form's own labels are accepted as keys; that the
 * checkbox groups are read whether Zapier sends a list or text; that a new
 * deal opens as a Prospect while an existing one keeps its stage; and that
 * the setup notes are written once and never over a person's.
 */

// The submission from the PDF, keyed the way the form labels its fields.
const SUBMISSION = {
  "Submission ID": "1df5c313-0000-4000-8000-000000000003",
  "No.": "00003",
  Date: "09/28/2026",
  "Company Name": "Central Community Transit",
  "Main Admin First Name": "Kathy",
  "Main Admin Last Name": "Schultz",
  "Main Admin GCID": "1234567",
  "SalesForce Opp/Account link":
    "https://gocanvas.lightning.force.com/lightning/r/Opportunity/006Hn00001AbCdEfGH/view",
  "Main Admin Email": "kathy@cctransit.org",
  "Main Admin Phone": "(320) 555-0100",
  Industry: "Public Transportation - Volunteer",
  "Relevant Features": "Dispatch to Field, Scheduling / Appointments, Route Optimization",
  "Describe analytics needs": "Trips per driver per month",
  "Output Destinations": "Email\nGoogle Sheets",
  "First Use Case is": "Trip Card",
  "Description of Process":
    "Volunteer drivers get a trip card the day before; they record miles and times.",
  "GoCanvas Form/s In-Progress": "Yes",
  "PDF is Designer": "Designer",
  "Relevant Data Sets": ["Customers", "Sites - Company Owned", "Historic Job Data"],
  "Customers are": "Individuals; Counties/Municipalities",
  "Customers have": "Multiple Sites, Multiple Contacts",
  "Customer Sites have/are": "Residential",
  "Notes / Other Use Cases": "Vehicle inspection next.",
  "Requester name": "Liesl",
  "Requester email address": "liesl@gocanvas.com",
};

describe("normalizing a submission", () => {
  it("accepts the form's own labels as keys", () => {
    const row = normalizeRequestRow(SUBMISSION);
    expect(row["company_name"]).toBe("Central Community Transit");
    expect(row["admin_first_name"]).toBe("Kathy");
    expect(row["admin_gcid"]).toBe("1234567");
    expect(row["salesforce_url"]).toContain("006Hn");
    expect(row["first_use_case"]).toBe("Trip Card");
    expect(row["process_description"]).toContain("trip card");
    expect(row["forms_in_progress"]).toBe("Yes");
    expect(row["pdf_designer"]).toBe("Designer");
    expect(row["sites_are"]).toBe("Residential");
    expect(row["notes"]).toBe("Vehicle inspection next.");
    expect(row["requester_email"]).toBe("liesl@gocanvas.com");
  });

  it("accepts the snake_case keys from the setup card too", () => {
    const row = normalizeRequestRow({ company_name: "Acme", admin_email: "a@acme.com" });
    expect(row["company_name"]).toBe("Acme");
    expect(row["admin_email"]).toBe("a@acme.com");
  });

  it("reads a checkbox group as a list or as text", () => {
    expect(parseList(["Customers", "Parts"])).toEqual(["Customers", "Parts"]);
    expect(parseList("Dispatch to Field, Scheduling / Appointments")).toEqual([
      "Dispatch to Field",
      "Scheduling / Appointments",
    ]);
    expect(parseList("Email\nGoogle Sheets")).toEqual(["Email", "Google Sheets"]);
    expect(parseList("Parts; parts ;PARTS")).toEqual(["Parts"]);
    expect(parseList(null)).toEqual([]);
  });

  it("parses the whole submission into the request shape", () => {
    const parsed = fieldFusionRequestRowSchema.parse(SUBMISSION);
    expect(parsed.company_name).toBe("Central Community Transit");
    expect(parsed.features).toEqual([
      "Dispatch to Field",
      "Scheduling / Appointments",
      "Route Optimization",
    ]);
    expect(parsed.data_sets).toEqual(["Customers", "Sites - Company Owned", "Historic Job Data"]);
    expect(parsed.customers_are).toEqual(["Individuals", "Counties/Municipalities"]);
    expect(parsed.output_destinations).toEqual(["Email", "Google Sheets"]);
    expect(parsed.submission_no).toBe("00003");
  });

  it("refuses a submission with no company name", () => {
    const r = fieldFusionRequestRowSchema.safeParse({ "Main Admin Email": "x@y.com" });
    expect(r.success).toBe(false);
  });
});

describe("the industry", () => {
  it("maps the form's wording onto ours when it plainly matches", () => {
    expect(industryFor("Public Transportation - Volunteer")).toBe("Logistics");
    expect(industryFor("HVAC contractor")).toBe("HVAC");
    expect(industryFor("Construction")).toBe("Construction");
  });
  it("leaves it blank rather than guess", () => {
    expect(industryFor("Volunteer coordination")).toBeNull();
    expect(industryFor(null)).toBeNull();
  });
});

describe("the setup notes", () => {
  it("carry every answer worth reading at the handoff", () => {
    const notes = setupNotesFrom(fieldFusionRequestRowSchema.parse(SUBMISSION));
    expect(notes).toContain("No. 00003");
    expect(notes).toContain("First use case: Trip Card");
    expect(notes).toContain("Features: Dispatch to Field, Scheduling / Appointments");
    expect(notes).toContain("Data sets: Customers");
    expect(notes).toContain("Notes: Vehicle inspection next.");
  });
});

function deps(existing?: Partial<IntakeAnswers>, stage = "prospect") {
  const written: IntakeAnswers[] = [];
  const contacts: Array<{ name: string | null; email: string | null; role: string | null }> = [];
  const upsertAccount = vi.fn(async (_input: AccountUpsertInput) => ({
    account: { id: "deal-1", stage, intake: existing ?? {} },
    created: !existing,
  }));
  const d: RequestDeps = {
    upsertAccount,
    recordContact: async (_id, c) => {
      contacts.push(c);
    },
    writeIntake: async (_id, next) => {
      written.push(next);
    },
  };
  return { d, upsertAccount, written, contacts };
}

describe("opening the deal", () => {
  const row = fieldFusionRequestRowSchema.parse(SUBMISSION);

  it("opens a new company as a Prospect on the Field Fusion path, marked POC", async () => {
    const { d, upsertAccount, written, contacts } = deps();
    const out = await ingestFieldFusionRequest(row, d);
    expect(out.deal_created).toBe(true);
    expect(out.poc).toBe(true);
    // No stage is sent: a new deal takes the default (Prospect), and an
    // existing one is left where it is.
    expect(upsertAccount.mock.calls[0]![0]).not.toHaveProperty("stage");
    expect(upsertAccount.mock.calls[0]![0]).toMatchObject({ name: "Central Community Transit" });
    // An opportunity link (006…) is not an account id: nothing to link by.
    expect(upsertAccount.mock.calls[0]![0]).not.toHaveProperty("salesforce_id");
    expect(contacts[0]).toEqual({
      name: "Kathy Schultz",
      email: "kathy@cctransit.org",
      role: "Main admin (GoCanvas)",
    });
    const intake = written[0]!;
    expect(intake.path).toBe("field_fusion");
    expect(intake.industry).toBe("Logistics");
    expect(intake.current_process).toContain("trip card");
    expect(intake.current_process_source).toBe("person");
    expect(intake.field_fusion.poc).toBe(true);
    expect(intake.field_fusion.request?.first_use_case).toBe("Trip Card");
    expect(intake.field_fusion.notes).toContain("First use case: Trip Card");
    expect(out.fields_kept).toBeGreaterThan(15);
  });

  it("links by the Salesforce account id when the link is an account link", async () => {
    const { d, upsertAccount } = deps();
    await ingestFieldFusionRequest(
      fieldFusionRequestRowSchema.parse({
        ...SUBMISSION,
        "SalesForce Opp/Account link":
          "https://gocanvas.lightning.force.com/lightning/r/Account/001Hn00001AbCdEfGH/view",
      }),
      d,
    );
    expect(upsertAccount.mock.calls[0]![0]).toMatchObject({ salesforce_id: "001Hn00001AbCdEfGH" });
  });

  it("re-delivery keeps what a person set and never touches the stage", async () => {
    const existing = readIntake({
      path: "field_fusion",
      industry: "Facilities",
      current_process: "Typed on the deal by Cory.",
      current_process_source: "person",
      person_set: ["industry", "current_process"],
      field_fusion: { notes: "Cory's own setup notes", poc: true },
    });
    const { d, upsertAccount, written } = deps(existing, "field_fusion_setup");
    const out = await ingestFieldFusionRequest(row, d);
    expect(out.deal_created).toBe(false);
    expect(out.stage).toBe("field_fusion_setup");
    expect(upsertAccount.mock.calls[0]![0]).not.toHaveProperty("stage");
    const intake = written[0]!;
    expect(intake.industry).toBe("Facilities");
    expect(intake.current_process).toBe("Typed on the deal by Cory.");
    expect(intake.field_fusion.notes).toBe("Cory's own setup notes");
    // The request itself is refreshed: it is the form's latest word.
    expect(intake.field_fusion.request?.submission_no).toBe("00003");
  });
});
