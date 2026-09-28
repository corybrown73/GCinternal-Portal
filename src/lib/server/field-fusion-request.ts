import { z } from "zod";

import {
  INDUSTRIES,
  intakeAnswersSchema,
  readIntake,
  type FieldFusionRequest,
  type IntakeAnswers,
} from "../intake-answers";
import type { AccountUpsertInput } from "./schemas";
import { decodeEntities, salesforceAccountIdFrom } from "./closed-won";

/**
 * POST /api/v1/field-fusion-requests — the "New FF Client Request" form in
 * GoCanvas becomes a Field Fusion proof-of-concept deal.
 *
 * Liesl fills the form in GoCanvas for every prospective Field Fusion
 * client; a Zap posts the submission here. The deal is opened as a Prospect
 * on the Field Fusion path, marked as a POC, with the main admin as its
 * contact and every answer kept on the intake — so when the deal closes,
 * the setup notes implementation reads are the ones she already wrote.
 *
 * Field names are forgiving (aliases below), because Zapier sends whatever
 * labels the form has, and lists arrive as arrays or as comma, semicolon or
 * newline-separated text. Delivering the same submission twice updates the
 * deal; it never opens a second one.
 */

const ALIASES: Record<string, string[]> = {
  submission_id: ["submission_id", "submission", "id"],
  submission_no: ["submission_no", "no", "number", "submission_number"],
  submitted_at: ["submitted_at", "date", "submission_date", "submitted"],
  company_name: ["company_name", "company", "account", "account_name", "customer", "name"],
  logo_url: ["logo_url", "logo"],
  admin_first_name: ["admin_first_name", "main_admin_first_name", "first_name"],
  admin_last_name: ["admin_last_name", "main_admin_last_name", "last_name"],
  admin_gcid: ["admin_gcid", "main_admin_gcid", "gcid"],
  admin_email: ["admin_email", "main_admin_email", "email", "contact_email"],
  admin_phone: ["admin_phone", "main_admin_phone", "phone", "contact_phone"],
  salesforce_url: [
    "salesforce_url",
    "salesforce_opp_account_link",
    // The form writes it "SalesForce", which the key flattener splits.
    "sales_force_opp_account_link",
    "sales_force_link",
    "sales_force_url",
    "sales_force",
    "salesforce_link",
    "sf_url",
    "sf_link",
    "opportunity_link",
    "salesforce",
  ],
  industry: ["industry"],
  features: ["features", "relevant_features"],
  analytics_needs: ["analytics_needs", "describe_analytics_needs", "analytics"],
  output_destinations: ["output_destinations", "outputs", "destinations"],
  first_use_case: ["first_use_case", "first_use_case_is", "primary_use_case", "use_case"],
  process_description: ["process_description", "description_of_process", "process", "description"],
  forms_in_progress: [
    "forms_in_progress",
    "gocanvas_forms_in_progress",
    // "GoCanvas Form/s In-Progress", as the key flattener spells it.
    "go_canvas_form_s_in_progress",
    "gocanvas_form_s_in_progress",
    "forms",
  ],
  pdf_designer: ["pdf_designer", "pdf_is_designer", "pdf"],
  data_sets: ["data_sets", "relevant_data_sets", "datasets"],
  customers_are: ["customers_are", "customers_are_"],
  customers_have: ["customers_have", "customers_have_"],
  sites_are: ["sites_are", "customer_sites_have_are", "customer_sites", "sites"],
  notes: ["notes", "notes_other_use_cases", "other_use_cases", "anything_else", "comments"],
  requester_name: ["requester_name", "requester", "submitted_by"],
  requester_email: ["requester_email", "requester_email_address"],
};

/** "Account Name", "account-name" and "accountName" are the same field. */
function flatKey(k: string): string {
  return k
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeRequestRow(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const flat = new Map<string, unknown>();
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) flat.set(flatKey(k), v);
  const out: Record<string, unknown> = {};
  for (const [canonical, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const v = flat.get(n);
      if (v !== undefined && v !== null && v !== "") {
        out[canonical] = v;
        break;
      }
    }
  }
  return out;
}

/** A list from an array, or from text split on commas, semicolons, pipes or new lines. */
export function parseList(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  const items = Array.isArray(v) ? v.map(String) : String(v).split(/[,;|\n]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const s = decodeEntities(raw).trim();
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s.slice(0, 120));
  }
  return out.slice(0, 40);
}

const text = (max: number) => (v: unknown) =>
  v === null || v === undefined ? null : decodeEntities(String(v)).trim().slice(0, max) || null;

export const fieldFusionRequestRowSchema = z
  .preprocess(normalizeRequestRow, z.object({}).passthrough())
  .transform((row): FieldFusionRequest & { company_name: string } => {
    const r = row as Record<string, unknown>;
    const short = text(300);
    const long = text(6000);
    return {
      submission_id: short(r["submission_id"]),
      submission_no: short(r["submission_no"]),
      submitted_at: short(r["submitted_at"]),
      company_name: short(r["company_name"]) ?? "",
      logo_url: text(1000)(r["logo_url"]),
      admin_first_name: short(r["admin_first_name"]),
      admin_last_name: short(r["admin_last_name"]),
      admin_gcid: short(r["admin_gcid"]),
      admin_email: short(r["admin_email"]),
      admin_phone: short(r["admin_phone"]),
      salesforce_url: text(1000)(r["salesforce_url"]),
      industry: short(r["industry"]),
      features: parseList(r["features"]),
      analytics_needs: long(r["analytics_needs"]),
      output_destinations: parseList(r["output_destinations"]),
      first_use_case: short(r["first_use_case"]),
      process_description: long(r["process_description"]),
      forms_in_progress: short(r["forms_in_progress"]),
      pdf_designer: short(r["pdf_designer"]),
      data_sets: parseList(r["data_sets"]),
      customers_are: parseList(r["customers_are"]),
      customers_have: parseList(r["customers_have"]),
      sites_are: parseList(r["sites_are"]),
      notes: long(r["notes"]),
      requester_name: short(r["requester_name"]),
      requester_email: short(r["requester_email"]),
    };
  })
  .refine((r) => r.company_name.length > 0, {
    message: "company_name is required (the form's Company Name)",
  });
export type FieldFusionRequestRow = z.infer<typeof fieldFusionRequestRowSchema>;

/** The form's free-text industry onto the app's list, when it plainly is one. */
export function industryFor(raw: string | null): (typeof INDUSTRIES)[number] | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const hit = INDUSTRIES.find((i) => i !== "Other" && lower.includes(i.toLowerCase()));
  if (hit) return hit;
  if (/transit|transport|logistic|fleet|deliver/.test(lower)) return "Logistics";
  if (/hvac|heating|cooling/.test(lower)) return "HVAC";
  if (/facilit|janitor|clean/.test(lower)) return "Facilities";
  if (/construct|contract|build/.test(lower)) return "Construction";
  return null;
}

/**
 * The setup notes implementation reads at the handoff, written from the
 * request so Liesl's answers travel with the deal instead of being retyped.
 */
export function setupNotesFrom(r: FieldFusionRequest): string {
  const lines: string[] = [];
  const head = [
    "From the New FF Client Request",
    r.submission_no ? `No. ${r.submission_no}` : null,
    r.submitted_at ? `(${r.submitted_at})` : null,
  ]
    .filter(Boolean)
    .join(" ");
  lines.push(`${head}${r.requester_name ? ` — ${r.requester_name}` : ""}`);
  if (r.first_use_case) lines.push(`First use case: ${r.first_use_case}`);
  if (r.industry) lines.push(`Industry: ${r.industry}`);
  if (r.features.length) lines.push(`Features: ${r.features.join(", ")}`);
  if (r.analytics_needs) lines.push(`Analytics: ${r.analytics_needs}`);
  if (r.output_destinations.length) lines.push(`Outputs: ${r.output_destinations.join(", ")}`);
  if (r.data_sets.length) lines.push(`Data sets: ${r.data_sets.join(", ")}`);
  if (r.customers_are.length) lines.push(`Customers are: ${r.customers_are.join(", ")}`);
  if (r.customers_have.length) lines.push(`Customers have: ${r.customers_have.join(", ")}`);
  if (r.sites_are.length) lines.push(`Sites: ${r.sites_are.join(", ")}`);
  if (r.forms_in_progress) lines.push(`Forms in progress: ${r.forms_in_progress}`);
  if (r.pdf_designer) lines.push(`PDF: ${r.pdf_designer}`);
  if (r.notes) lines.push(`Notes: ${r.notes}`);
  return lines.join("\n").slice(0, 4000);
}

export type RequestDeps = {
  upsertAccount: (
    input: AccountUpsertInput,
  ) => Promise<{ account: { id: string; stage: string; intake: unknown }; created: boolean }>;
  recordContact: (
    dealId: string,
    contact: { name: string | null; email: string | null; role: string | null },
  ) => Promise<void>;
  /** Read the deal's intake, hand back the whole next intake, write it. */
  writeIntake: (dealId: string, next: IntakeAnswers) => Promise<void>;
};

export type RequestOutcome = {
  deal_id: string;
  deal_created: boolean;
  stage: string;
  poc: true;
  contact: string | null;
  fields_kept: number;
};

/**
 * The submission onto a deal. Pure of the database: every write goes through
 * an injected function, so the decision is tested on its own.
 */
export async function ingestFieldFusionRequest(
  row: FieldFusionRequestRow,
  deps: RequestDeps,
): Promise<RequestOutcome> {
  const sfId = salesforceAccountIdFrom(null, row.salesforce_url);
  const summary = [row.first_use_case ? `Field Fusion POC — ${row.first_use_case}` : null]
    .filter(Boolean)
    .join(" ");
  // No stage on the way in: a new deal opens as a Prospect, and a deal that
  // already exists keeps the stage it is in — the form can be re-submitted
  // after the close without dragging the deal back.
  const { account, created } = await deps.upsertAccount({
    name: row.company_name,
    ...(sfId ? { salesforce_id: sfId } : {}),
    ...(summary ? { summary } : {}),
  });

  const contactName = [row.admin_first_name, row.admin_last_name].filter(Boolean).join(" ") || null;
  if (contactName || row.admin_email) {
    await deps.recordContact(account.id, {
      name: contactName,
      email: row.admin_email,
      role: "Main admin (GoCanvas)",
    });
  }

  const current = readIntake(account.intake);
  const request: FieldFusionRequest = row;
  const next = intakeAnswersSchema.parse({
    ...current,
    path: current.path ?? "field_fusion",
    industry: current.industry ?? industryFor(row.industry),
    // The process, in the requester's words — a person wrote it, so it is
    // quoted as theirs. A person's later edit on the deal stands.
    current_process: current.current_process ?? row.process_description,
    current_process_source: current.current_process
      ? current.current_process_source
      : row.process_description
        ? "person"
        : null,
    person_set: [
      ...new Set([
        ...current.person_set,
        ...(current.industry === null && industryFor(row.industry) ? ["industry"] : []),
        ...(current.current_process === null && row.process_description ? ["current_process"] : []),
      ]),
    ],
    field_fusion: {
      ...current.field_fusion,
      poc: true,
      request,
      // The setup notes implementation reads: written once from the form,
      // and never over what somebody typed on the deal since.
      notes: current.field_fusion.notes || setupNotesFrom(request),
    },
    updated_at: new Date().toISOString(),
  });
  await deps.writeIntake(account.id, next);

  const kept = Object.values(request).filter((v) =>
    Array.isArray(v) ? v.length > 0 : v !== null && v !== "",
  ).length;
  return {
    deal_id: account.id,
    deal_created: created,
    stage: account.stage,
    poc: true,
    contact: contactName,
    fields_kept: kept,
  };
}
