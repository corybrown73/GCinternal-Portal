import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveAccountId, transitionStage, upsertAccount } from "./server/accounts";
import { accountUpsertSchema } from "./server/schemas";
import { isStage, type AccountStage } from "./presale-stages";
import { stageAfterWon, stageOrder, wonStage, type PipelineStage } from "./pipeline-stages";
import { loadPipelineStages } from "./pipeline-stages.server";
import { isFlagOn } from "./app-config.server";
import { handoffConflictMessage, resolveHandoffCustomer } from "./presale-handoff";
import { audit } from "./server/audit";
import { createTamRequest } from "./server/tam";
import { API_SCOPES, generateApiKey, type ApiScope } from "./server/api-auth";
import { recordImplementationCreated } from "./server/events";
import { sfId18 } from "./server/sf-id";
import { LIFECYCLE_STAGES } from "./lifecycle";
import type {
  Account,
  ApiKey,
  Brief,
  GongReport,
  OnboardingNote,
  StageTransition,
  TamRequest,
} from "./presale-types";
import { matchesScope } from "./ownership";
import { EDITABLE_DEAL_FIELDS, type EditableDealField } from "./presale-fields";
import type { ResolvedScope } from "./ownership.server";

const db = () => supabaseAdmin as any;

/* ---------- profiles + server-side role checks ---------- */

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
}

const SUPER_ROLES = ["admin", "super_admin"];
const MANAGE_ROLES = [...SUPER_ROLES, "manager"];
const SALES_EDIT_ROLES = [...MANAGE_ROLES, "sales", "am"];

async function profileOf(userId: string): Promise<ProfileRow> {
  const { data, error } = await db()
    .from("portal_profiles")
    .select("id, email, full_name, role, created_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No portal profile exists for this user");
  return data as ProfileRow;
}

/** Any signed-in non-customer user. */
export async function requireInternal(userId: string): Promise<ProfileRow> {
  const profile = await profileOf(userId);
  if (profile.role === "customer") throw new Error("Not available to customer accounts");
  return profile;
}

export async function requireSalesEditor(userId: string): Promise<ProfileRow> {
  const profile = await profileOf(userId);
  if (!SALES_EDIT_ROLES.includes(profile.role)) {
    throw new Error("Your role cannot edit presale records");
  }
  return profile;
}

export async function requireSuperAdmin(userId: string): Promise<ProfileRow> {
  const profile = await profileOf(userId);
  if (!SUPER_ROLES.includes(profile.role)) {
    throw new Error("Super admin only");
  }
  return profile;
}

async function profileNames(): Promise<Map<string, string>> {
  const { data } = await db().from("portal_profiles").select("id, email, full_name");
  const map = new Map<string, string>();
  for (const p of data ?? []) map.set(p.id, p.full_name || p.email);
  return map;
}

/* ---------- pipeline board ---------- */

export interface PipelineDeal extends Account {
  am_owner_name: string | null;
  se_owner_name: string | null;
}

/**
 * The pre-sale board.
 *
 * Scoped on the ACCOUNT's own owners (am/se) rather than through
 * implementations: a deal in Prospect has no implementation yet, so scoping it
 * by delivery ownership would empty the left-hand columns of the board — the
 * columns a seller cares most about.
 */
export async function loadPipeline(
  scope?: ResolvedScope | null,
): Promise<{ deals: PipelineDeal[]; stages: PipelineStage[] }> {
  // Loaded alongside the deals rather than after them: the board needs both to
  // render one column per configured stage, and a waterfall here is a second
  // round trip on the busiest internal page.
  const [{ data: accounts, error }, names, stages] = await Promise.all([
    db().from("portal_accounts").select("*").order("name"),
    profileNames(),
    loadPipelineStages(),
  ]);
  if (error) throw new Error(error.message);
  const inScope = (a: Account) =>
    !scope ||
    matchesScope(
      {
        implementationOwnerId: null,
        csmOwnerId: null,
        amOwnerProfileId: a.am_owner_id ?? null,
        seOwnerProfileId: a.se_owner_id ?? null,
      },
      scope.scope,
      scope.viewer,
      scope.person ?? null,
    );

  const deals = ((accounts ?? []) as Account[]).filter(inScope).map((a) => ({
    ...a,
    am_owner_name: a.am_owner_id ? (names.get(a.am_owner_id) ?? null) : null,
    se_owner_name: a.se_owner_id ? (names.get(a.se_owner_id) ?? null) : null,
  }));
  return { deals, stages };
}

export async function createDeal(
  userId: string,
  input: {
    name: string;
    domain: string | null;
    salesforce_id: string | null;
    arr: number | null;
    summary: string | null;
  },
): Promise<{ account: Account; created: boolean }> {
  await requireSalesEditor(userId);
  const parsed = accountUpsertSchema.parse({
    name: input.name,
    ...(input.domain ? { domain: input.domain } : {}),
    ...(input.salesforce_id ? { salesforce_id: input.salesforce_id } : {}),
    ...(input.arr != null ? { arr: input.arr } : {}),
    ...(input.summary ? { summary: input.summary } : {}),
  });
  const result = await upsertAccount(parsed, { source: "ui", actorProfileId: userId });
  return { account: result.account, created: result.created };
}

export async function transitionDeal(
  userId: string,
  dealId: string,
  toStage: AccountStage,
  note?: string,
): Promise<{ changed: boolean }> {
  await requireInternal(userId);
  // Via supabaseAdmin the RPC has no auth.uid(), so the passed actor is kept.
  return transitionStage(dealId, toStage, { source: "ui", actorProfileId: userId }, note);
}

/* ---------- CSV import (ported from the old Next.js internal import route) ---------- */

// Header names are matched case-insensitively with spaces/underscores ignored.
const COLUMN_ALIASES: Record<string, string> = {
  name: "name",
  account: "name",
  accountname: "name",
  salesforceid: "salesforce_id",
  sfid: "salesforce_id",
  domain: "domain",
  website: "domain",
  stage: "stage",
  arr: "arr",
  amowneremail: "am_owner_email",
  owneremail: "am_owner_email",
  summary: "summary",
};

function normalizeHeader(h: string): string | null {
  return COLUMN_ALIASES[h.toLowerCase().replace(/[\s_-]/g, "")] ?? null;
}

function normalizeStageValue(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
}

export interface CsvImportSummary {
  created: number;
  updated: number;
  stage_changes: number;
  errors: { row: number; message: string }[];
}

export async function importDealsCsv(userId: string, csvText: string): Promise<CsvImportSummary> {
  await requireSalesEditor(userId);
  if (csvText.length > 2 * 1024 * 1024) {
    throw new Error("CSV must be under 2 MB");
  }

  const { default: Papa } = await import("papaparse");
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  let created = 0;
  let updated = 0;
  let stageChanges = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const raw = parsed.data[i];
    if (!raw) continue;
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      const col = normalizeHeader(key);
      if (!col || value == null || String(value).trim() === "") continue;
      mapped[col] = String(value).trim();
    }
    if (mapped["arr"] !== undefined) {
      const n = Number(String(mapped["arr"]).replace(/[$,]/g, ""));
      if (Number.isNaN(n)) delete mapped["arr"];
      else mapped["arr"] = n;
    }
    if (mapped["stage"] !== undefined) {
      const s = normalizeStageValue(String(mapped["stage"]));
      if (isStage(s)) mapped["stage"] = s;
      else {
        errors.push({ row: i + 2, message: `Unknown stage "${mapped["stage"]}"` });
        continue;
      }
    }

    const check = accountUpsertSchema.safeParse(mapped);
    if (!check.success) {
      errors.push({
        row: i + 2,
        message: check.error.issues
          .map((iss) => `${iss.path.join(".")}: ${iss.message}`)
          .join("; "),
      });
      continue;
    }

    try {
      const result = await upsertAccount(check.data, {
        source: "csv_import",
        actorProfileId: userId,
      });
      if (result.created) created++;
      else updated++;
      if (result.stage_changed) stageChanges++;
    } catch (e) {
      errors.push({ row: i + 2, message: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return { created, updated, stage_changes: stageChanges, errors };
}

/* ---------- deal record ---------- */

/** JSON-safe value type so serverFn results validate as serializable. */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type BriefRow = Omit<Brief, "structured_json"> & { structured_json: Json | null };

export interface DealDetail {
  account: Account & { customer_id: string | null };
  am_owner_name: string | null;
  se_owner_name: string | null;
  gong_reports: Array<GongReport & { uploaded_by_name: string | null }>;
  briefs: Array<BriefRow & { created_by_name: string | null }>;
  tam_requests: Array<
    TamRequest & { requested_by_name: string | null; decided_by_name: string | null }
  >;
  notes: Array<OnboardingNote & { author_name: string | null; reviewed_by_name: string | null }>;
  stage_history: Array<StageTransition & { actor_name: string | null }>;
  /** The configured pipeline, so the record renders labels and the Closed Won
   *  control from the same list the board does. */
  stages: PipelineStage[];
  /** Who an owner field can be set to, resolved once here rather than by a
   *  second round trip when somebody opens the AM owner dropdown. */
  owner_options: Array<{ value: string; label: string }>;
  /** Short-lived signed link to the customer's logo, or null if none is set. */
  logo_url: string | null;
  /** Short-lived signed link to the uploaded SOW, or null if none was uploaded. */
  sow_url: string | null;
}

export async function loadDeal(dealId: string): Promise<DealDetail | null> {
  const { data: account } = await db()
    .from("portal_accounts")
    .select("*")
    .eq("id", dealId)
    .maybeSingle();
  if (!account) return null;

  const [names, gong, briefs, tam, notes, history, stages] = await Promise.all([
    profileNames(),
    db()
      .from("portal_gong_reports")
      .select("*")
      .eq("account_id", dealId)
      .order("created_at", { ascending: false }),
    db()
      .from("portal_briefs")
      .select("*")
      .eq("account_id", dealId)
      .order("created_at", { ascending: false }),
    db()
      .from("portal_tam_requests")
      .select("*")
      .eq("account_id", dealId)
      .order("created_at", { ascending: false }),
    db()
      .from("portal_onboarding_notes")
      .select("*")
      .eq("account_id", dealId)
      .order("created_at", { ascending: false }),
    db()
      .from("portal_stage_transitions")
      .select("*")
      .eq("account_id", dealId)
      .order("occurred_at", { ascending: false }),
    loadPipelineStages(),
  ]);

  const named = (id: string | null | undefined) => (id ? (names.get(id) ?? null) : null);

  // Guarded on logo_path: signing a null path throws, and most deals have no
  // logo. A logo that cannot be signed is a plainer page, never a failed load.
  let logoUrl: string | null = null;
  if (account.logo_path) {
    try {
      const { data } = await db()
        .storage.from("customer-branding")
        .createSignedUrl(account.logo_path, 60 * 60);
      logoUrl = data?.signedUrl ?? null;
    } catch (e) {
      console.error("[deal] could not sign the logo url", e);
    }
  }

  let sowUrl: string | null = null;
  if (account.sow_document_path) {
    try {
      const { data } = await db()
        .storage.from("attachments")
        .createSignedUrl(account.sow_document_path, 60 * 60);
      sowUrl = data?.signedUrl ?? null;
    } catch (e) {
      console.error("[deal] could not sign the sow url", e);
    }
  }

  return {
    account: account as DealDetail["account"],
    logo_url: logoUrl,
    sow_url: sowUrl,
    am_owner_name: named(account.am_owner_id),
    se_owner_name: named(account.se_owner_id),
    // Sorted by the name a person will look for, not by id.
    owner_options: [...names.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    gong_reports: ((gong.data ?? []) as GongReport[]).map((r) => ({
      ...r,
      uploaded_by_name: named(r.uploaded_by),
    })),
    briefs: ((briefs.data ?? []) as BriefRow[]).map((b) => ({
      ...b,
      created_by_name: named(b.created_by),
    })),
    tam_requests: ((tam.data ?? []) as TamRequest[]).map((t) => ({
      ...t,
      requested_by_name: named(t.requested_by),
      decided_by_name: named(t.decided_by),
    })),
    notes: ((notes.data ?? []) as OnboardingNote[]).map((n) => ({
      ...n,
      author_name: named(n.author_id),
      reviewed_by_name: named(n.reviewed_by),
    })),
    stage_history: ((history.data ?? []) as StageTransition[]).map((t) => ({
      ...t,
      actor_name: named(t.actor_profile_id),
    })),
    stages,
  };
}

/* ---------- the signed SOW ---------- */

/** ~34 MB of base64 is ~25 MB of PDF, the same ceiling account uploads use. */
const SOW_MAX_BASE64 = 34_000_000;

/**
 * Upload the countersigned SOW against a deal.
 *
 * A FILE, NOT A LINK. What an AE has after close is the PDF; asking them to
 * park it somewhere else first and paste a URL is why the field stayed empty.
 * `sow_document_url` survives for a SOW that genuinely lives in Docusign.
 *
 * Into the PRIVATE attachments bucket, like every other customer document
 * here. A contract must never sit behind a URL that works for anyone who has
 * it — `dealSowLink` mints a short-lived signed link per download.
 */
export async function uploadDealSow(
  userId: string,
  args: { dealId: string; fileName: string; contentType: string; dataBase64: string },
): Promise<{ ok: true; path: string; name: string }> {
  await requireSalesEditor(userId);

  if (args.contentType !== "application/pdf") {
    throw new Error("The signed SOW should be a PDF");
  }
  if (args.dataBase64.length > SOW_MAX_BASE64) {
    throw new Error("That file is over 25MB — link to it instead");
  }

  const { data: before } = await db()
    .from("portal_accounts")
    .select("sow_document_path")
    .eq("id", args.dealId)
    .maybeSingle();
  if (!before) throw new Error("Deal not found");

  const binary = Buffer.from(args.dataBase64, "base64");
  const safe = args.fileName.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-120) || "sow.pdf";
  const path = `deals/${args.dealId}/${crypto.randomUUID()}-${safe}`;

  const { error: upErr } = await db()
    .storage.from("attachments")
    .upload(path, binary, { contentType: args.contentType, upsert: false });
  if (upErr) throw new Error(`Could not upload the SOW: ${upErr.message}`);

  const { error } = await db()
    .from("portal_accounts")
    .update({
      sow_document_path: path,
      sow_document_name: args.fileName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.dealId);
  if (error) {
    // The row failed, so nothing points at the object. Remove it rather than
    // leaving a customer's contract in the bucket unreachable.
    try {
      await db().storage.from("attachments").remove([path]);
    } catch {
      /* the row is what matters */
    }
    throw new Error(error.message);
  }

  // Replacing a SOW removes the one it replaced: a superseded contract sitting
  // in the bucket with nothing pointing at it is a document nobody can find
  // and nobody can delete.
  const previous = (before as any).sow_document_path as string | null;
  if (previous && previous !== path) {
    try {
      await db().storage.from("attachments").remove([previous]);
    } catch (e) {
      console.error("[sow] uploaded the new SOW but could not remove the old object", e);
    }
  }

  const { recordActivity } = await import("./activity.server");
  await recordActivity(
    [
      {
        entity_type: "account",
        entity_id: args.dealId,
        field_name: "sow_document_name",
        old_value: null,
        new_value: args.fileName,
      },
    ],
    { actorProfileId: userId },
  );

  await audit({
    actor_type: "user",
    actor_id: userId,
    action: "account.sow_uploaded",
    entity_type: "account",
    entity_id: args.dealId,
    payload: { file_name: args.fileName, replaced: previous ?? null },
  });

  return { ok: true, path, name: args.fileName };
}

/** A short-lived link to the uploaded SOW. The bucket stays private. */
export async function dealSowLink(userId: string, dealId: string): Promise<{ url: string }> {
  await requireSalesEditor(userId);
  const { data } = await db()
    .from("portal_accounts")
    .select("sow_document_path")
    .eq("id", dealId)
    .maybeSingle();
  const path = (data as any)?.sow_document_path as string | null | undefined;
  if (!path) throw new Error("No SOW has been uploaded for this deal");

  const { data: signed, error } = await db()
    .storage.from("attachments")
    .createSignedUrl(path, 3600);
  if (error || !signed?.signedUrl) {
    throw new Error(`Could not open the SOW: ${error?.message ?? "no link returned"}`);
  }
  return { url: signed.signedUrl };
}

/* ---------- notes & Gong reports ---------- */

export async function addGongReport(
  userId: string,
  input: {
    dealId: string;
    title: string;
    reportType: "call_notes" | "account_map";
    contentMd: string;
  },
): Promise<{ ok: true }> {
  await requireInternal(userId);
  const { error } = await db().from("portal_gong_reports").insert({
    account_id: input.dealId,
    report_type: input.reportType,
    title: input.title,
    content_md: input.contentMd,
    uploaded_by: userId,
  });
  if (error) throw new Error(`Could not save the report: ${error.message}`);
  return { ok: true };
}

export async function deleteGongReport(userId: string, reportId: string): Promise<{ ok: true }> {
  const profile = await requireInternal(userId);
  const { data: report } = await db()
    .from("portal_gong_reports")
    .select("id, uploaded_by")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) throw new Error("Report not found");
  if (report.uploaded_by !== userId && !SUPER_ROLES.includes(profile.role)) {
    throw new Error("You can only delete reports you uploaded");
  }
  const { error } = await db().from("portal_gong_reports").delete().eq("id", reportId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/* ---------- briefs ---------- */

export async function generateDealBrief(
  userId: string,
  dealId: string,
): Promise<{ id: string; status: string; error: string | null }> {
  await requireInternal(userId);
  const { generateBrief } = await import("./server/brief/generate");
  const brief = await generateBrief(dealId, userId);
  return { id: brief.id, status: brief.status, error: brief.error };
}

export async function briefDownloadUrl(userId: string, briefId: string): Promise<{ url: string }> {
  await requireInternal(userId);
  const { data: brief } = (await db()
    .from("portal_briefs")
    .select("pptx_storage_path")
    .eq("id", briefId)
    .maybeSingle()) as { data: { pptx_storage_path: string | null } | null };
  if (!brief?.pptx_storage_path) throw new Error("No file exists for this brief");

  const { data: signed, error } = await db()
    .storage.from("portal-briefs")
    .createSignedUrl(brief.pptx_storage_path, 3600, { download: true });
  if (error || !signed?.signedUrl) {
    throw new Error(`Could not sign the download link: ${error?.message ?? "no link returned"}`);
  }
  return { url: signed.signedUrl as string };
}

/* ---------- TAM requests ---------- */

export async function requestTam(
  userId: string,
  input: { dealId: string; justification: string; urgency: "low" | "medium" | "high" },
): Promise<{ id: string; status: string }> {
  const profile = await requireInternal(userId);
  const request = await createTamRequest({
    accountId: input.dealId,
    requesterEmail: profile.email,
    requesterProfileId: userId,
    justification: input.justification,
    urgency: input.urgency,
  });
  return { id: request.id, status: request.status };
}

/* ---------- onboarding notes ---------- */

export async function addDealNote(
  userId: string,
  input: { dealId: string; bodyMd: string },
): Promise<{ ok: true }> {
  await requireInternal(userId);
  const { error } = await db().from("portal_onboarding_notes").insert({
    account_id: input.dealId,
    author_id: userId,
    body_md: input.bodyMd,
  });
  if (error) throw new Error(`Could not save the note: ${error.message}`);
  return { ok: true };
}

export async function setNoteReviewStatus(
  userId: string,
  noteId: string,
  reviewed: boolean,
): Promise<{ ok: true }> {
  await requireInternal(userId);
  const { error } = await db()
    .from("portal_onboarding_notes")
    .update(
      reviewed
        ? { review_status: "reviewed", reviewed_by: userId, reviewed_at: new Date().toISOString() }
        : { review_status: "needs_review", reviewed_by: null, reviewed_at: null },
    )
    .eq("id", noteId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function deleteDealNote(userId: string, noteId: string): Promise<{ ok: true }> {
  const profile = await requireInternal(userId);
  const { data: note } = await db()
    .from("portal_onboarding_notes")
    .select("id, author_id")
    .eq("id", noteId)
    .maybeSingle();
  if (!note) throw new Error("Note not found");
  if (note.author_id !== userId && !SUPER_ROLES.includes(profile.role)) {
    throw new Error("You can only delete notes you wrote");
  }
  const { error } = await db().from("portal_onboarding_notes").delete().eq("id", noteId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/* ---------- start onboarding handoff ---------- */

/** What the deal page needs to render the account choice (see §7 rule 1). */
export interface HandoffOptions {
  /** `account_model`. When false the page renders exactly the pre-Phase-1 action. */
  flagOn: boolean;
  linkedCustomerId: string | null;
  salesforceId: string | null;
  /** The account whose `salesforce_account_id` equals the deal's `salesforce_id`. */
  salesforceMatch: { id: string; name: string } | null;
  /** Existing accounts to pick from. Empty while the flag is off. */
  accounts: { id: string; name: string }[];
}

export async function loadHandoffOptions(userId: string, dealId: string): Promise<HandoffOptions> {
  await requireInternal(userId);

  const { data: account } = await db()
    .from("portal_accounts")
    .select("id, name, salesforce_id, customer_id")
    .eq("id", dealId)
    .maybeSingle();
  if (!account) throw new Error("Deal not found");

  const flagOn = await isFlagOn("account_model");
  const linkedCustomerId = (account.customer_id as string | null) ?? null;
  const salesforceId = (account.salesforce_id as string | null) ?? null;
  if (!flagOn) {
    return { flagOn, linkedCustomerId, salesforceId, salesforceMatch: null, accounts: [] };
  }

  const [{ data: match }, { data: accounts }] = await Promise.all([
    salesforceId && !linkedCustomerId
      ? db()
          .from("customers")
          .select("id, name")
          .eq("salesforce_account_id", salesforceId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    db().from("customers").select("id, name").order("name"),
  ]);

  return {
    flagOn,
    linkedCustomerId,
    salesforceId,
    salesforceMatch: (match as { id: string; name: string } | null) ?? null,
    accounts: (accounts ?? []) as { id: string; name: string }[],
  };
}

export interface StartOnboardingOptions {
  /** Link the deal to this existing account instead of creating one. */
  customerId?: string | null;
  /** Explicitly create a brand-new account for this deal. */
  createNewCustomer?: boolean;
}

export interface StartOnboardingResult {
  /**
   * `started` — an implementation now exists (`implementationId` is real).
   * `already_linked` — the legacy flag-off dead-end; `implementationId` is "".
   * `needs_account_choice` — nothing was written; the caller must pick an
   * account or ask for a new one.
   */
  outcome: "started" | "already_linked" | "needs_account_choice";
  /** "" only on `needs_account_choice`. */
  customerId: string;
  /** "" on `already_linked` and `needs_account_choice`. */
  implementationId: string;
  /** The deal was already linked to its account before this call. */
  alreadyLinked: boolean;
  customerCreated: boolean;
  matchedBy: "deal_link" | "salesforce" | "chosen" | "created" | null;
}

export async function startOnboarding(
  userId: string,
  dealId: string,
  options: StartOnboardingOptions = {},
): Promise<StartOnboardingResult> {
  await requireSalesEditor(userId);

  const { data: account } = await db()
    .from("portal_accounts")
    .select("*")
    .eq("id", dealId)
    .maybeSingle();
  if (!account) throw new Error("Deal not found");

  const flagOn = await isFlagOn("account_model");

  // Identity match, never by name. Only looked up while the flag is on, so the
  // flag-off path issues exactly the queries it always has.
  let salesforceMatchCustomerId: string | null = null;
  if (flagOn && !account.customer_id && account.salesforce_id) {
    const { data: match } = await db()
      .from("customers")
      .select("id")
      // Normalized: a deal carrying the 15-character id must still find the
      // customer stamped with the 18-character one (see server/sf-id.ts).
      .eq("salesforce_account_id", sfId18(account.salesforce_id))
      .maybeSingle();
    salesforceMatchCustomerId = (match?.id as string | undefined) ?? null;
  }

  const decision = resolveHandoffCustomer({
    flagOn,
    linkedCustomerId: (account.customer_id as string | null) ?? null,
    salesforceMatchCustomerId,
    choice: {
      customerId: options.customerId ?? null,
      createNew: options.createNewCustomer === true,
    },
  });

  if (decision.action === "already_linked") {
    return {
      outcome: "already_linked",
      customerId: decision.customerId,
      implementationId: "",
      alreadyLinked: true,
      customerCreated: false,
      matchedBy: "deal_link",
    };
  }
  if (decision.action === "conflict") throw new Error(handoffConflictMessage(decision));
  if (decision.action === "needs_choice") {
    // Nothing is written: creating a duplicate account is a human's call.
    return {
      outcome: "needs_account_choice",
      customerId: "",
      implementationId: "",
      alreadyLinked: false,
      customerCreated: false,
      matchedBy: null,
    };
  }

  // The Closed Won gate reads the CONFIGURED won stage, not the literal
  // "closed_won". Exactly one stage carries that meaning (0028 enforces it),
  // and on an unconfigured deployment it is still `closed_won` — so this is the
  // same gate it has always been until somebody moves the mark.
  const pipeline = await loadPipelineStages();
  const won = wonStage(pipeline);
  if (stageOrder(pipeline, account.stage) < stageOrder(pipeline, won.key)) {
    throw new Error(`Only a deal at ${won.label} or later can start onboarding`);
  }

  // (a) customer + implementation records in the hub's post-sale tables.
  let customerId: string;
  let customerCreated = false;
  if (decision.action === "use_existing") {
    const { data: existing } = await db()
      .from("customers")
      .select("id")
      .eq("id", decision.customerId)
      .maybeSingle();
    if (!existing) throw new Error("That account no longer exists — pick another one");
    customerId = decision.customerId;
  } else {
    const { data: customer, error: customerError } = await db()
      .from("customers")
      .insert({
        name: account.name,
        arr: account.arr ?? null,
        industry: null,
        // Stamp the identity so the next handoff matches instead of duplicating.
        ...(flagOn && account.salesforce_id
          ? { salesforce_account_id: sfId18(account.salesforce_id) }
          : {}),
        // 0045: the same bucket and the same column name on both sides, so
        // this is a path copy and not a re-upload. Only on a customer being
        // created — a logo carried onto an existing account would silently
        // replace one somebody already chose there.
        ...(account.logo_path ? { logo_path: account.logo_path } : {}),
      })
      .select("id")
      .single();
    if (customerError || !customer) {
      throw new Error(customerError?.message ?? "Could not create the customer record");
    }
    customerId = customer.id as string;
    customerCreated = true;
  }

  const firstStage = LIFECYCLE_STAGES[0]!.id;
  const now = new Date().toISOString();
  const { data: impl, error: implError } = await db()
    .from("implementations")
    .insert({
      customer_id: customerId,
      name: account.name,
      current_stage: firstStage,
      stage_entered_at: now,
      status: "on_track",
      source: "presale",
      // What was sold, carried from the deal (0045). Delivery keeps its own
      // copy: correcting the reference on the project must not rewrite what
      // the deal says was signed.
      sow_reference: account.sow_reference ?? null,
      sow_signed_date: account.sow_signed_date ?? null,
      sow_value: account.sow_value ?? null,
      sow_document_url: account.sow_document_url ?? null,
      sow_document_name: account.sow_document_name ?? null,
      // The uploaded PDF travels as a path, not a re-upload: same bucket, same
      // object, so the project and the deal point at one contract rather than
      // two copies that can diverge.
      sow_document_path: account.sow_document_path ?? null,
    })
    .select("id")
    .single();
  if (implError || !impl) {
    throw new Error(implError?.message ?? "Could not create the implementation record");
  }

  // Mirror the hub's origination pattern: the first row of the append-only
  // stage history opens with the implementation itself.
  const { error: historyError } = await db().from("implementation_stage_history").insert({
    implementation_id: impl.id,
    stage: firstStage,
    entered_at: now,
    entered_by: null,
    exited_at: null,
  });
  if (historyError) {
    throw new Error(
      `Implementation created, but its stage history row failed: ${historyError.message}`,
    );
  }

  // Every creator of an implementation emits the same event, so a webhook
  // consumer sees the whole world rather than only Salesforce-sourced activity.
  // Never throws (see server/events.ts).
  await recordImplementationCreated({
    implementationId: impl.id as string,
    customerId,
    source: "presale",
  });

  // Give it a plan. Until this call existed, a project handed off from a deal
  // arrived with no stages and no tasks — an empty rail the operator was left
  // to interpret. The deal carries no opportunity type or amount, so no
  // `default_for` rule can match it; this is precisely the case the configured
  // fallback covers.
  //
  // Never throws: the deal is already linked and the pre-sale stage has already
  // moved, and a handoff that half-succeeds is worse than a project that needs
  // a template picked by hand.
  const { applyPlanToNewImplementation } = await import("./server/plan-apply");
  const plan = await applyPlanToNewImplementation({
    implementationId: impl.id as string,
    actorProfileId: userId,
  });

  // (b) link the deal to the customer record (already linked deals keep theirs).
  const alreadyLinked = Boolean(account.customer_id);
  if (!alreadyLinked) {
    const { error: linkError } = await db()
      .from("portal_accounts")
      .update({ customer_id: customerId })
      .eq("id", dealId);
    if (linkError) throw new Error(`Could not link the deal: ${linkError.message}`);
  }

  // (c) move the deal one stage on (only forward, never backward). Which stage
  // that is comes from the configuration: the first stage after the won stage
  // that an account can actually be in. If there is none — the won stage is
  // last, or everything after it is declared but not yet an account stage — the
  // deal stays where it is rather than attempting a transition the enum would
  // reject.
  const next = stageAfterWon(pipeline);
  if (account.stage === won.key && next) {
    await transitionStage(
      dealId,
      next.key as AccountStage,
      { source: "ui", actorProfileId: userId },
      "Onboarding started from the deal record",
    );
  }

  const matchedBy = decision.action === "use_existing" ? decision.matchedBy : "created";

  // (d) audit.
  await audit({
    actor_type: "user",
    actor_id: userId,
    action: "account.start_onboarding",
    entity_type: "account",
    entity_id: dealId,
    payload: {
      customer_id: customerId,
      implementation_id: impl.id,
      // Whether this project got a plan, and why — the question somebody asks
      // when they open a project and find an empty rail.
      plan,
      ...(flagOn ? { matched_by: matchedBy, customer_created: customerCreated } : {}),
    },
  });

  return {
    outcome: "started",
    customerId,
    implementationId: impl.id as string,
    alreadyLinked,
    customerCreated,
    matchedBy,
  };
}

/* ---------- admin: API keys ---------- */

export async function listApiKeys(userId: string): Promise<ApiKey[]> {
  await requireSuperAdmin(userId);
  const { data, error } = await db()
    .from("portal_api_keys")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ApiKey[];
}

export async function createApiKeyRecord(
  userId: string,
  input: {
    name: string;
    scopes: string[];
    /** Phase 7. Null (the default) means the key never expires, which is what
     * every key created before this existed does. */
    expiresAt?: string | null | undefined;
    rateLimitPerMinute?: number | null | undefined;
  },
): Promise<{ key: string; record: ApiKey }> {
  await requireSuperAdmin(userId);
  const scopes = input.scopes.filter((s): s is ApiScope =>
    (API_SCOPES as readonly string[]).includes(s),
  );
  if (scopes.length === 0) throw new Error("Pick at least one scope");

  const { key, hash, prefix } = generateApiKey();
  const { data, error } = await db()
    .from("portal_api_keys")
    .insert({
      name: input.name,
      key_prefix: prefix,
      key_hash: hash,
      scopes,
      created_by: userId,
      expires_at: input.expiresAt ?? null,
      ...(input.rateLimitPerMinute ? { rate_limit_per_minute: input.rateLimitPerMinute } : {}),
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create the key");

  await audit({
    actor_type: "user",
    actor_id: userId,
    action: "api_key.create",
    entity_type: "api_key",
    entity_id: data.id,
    payload: {
      name: input.name,
      scopes,
      expires_at: input.expiresAt ?? null,
      rate_limit_per_minute: input.rateLimitPerMinute ?? null,
    },
  });
  return { key, record: data as ApiKey };
}

export async function revokeApiKeyRecord(userId: string, keyId: string): Promise<{ ok: true }> {
  await requireSuperAdmin(userId);
  const { error } = await db()
    .from("portal_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
  await audit({
    actor_type: "user",
    actor_id: userId,
    action: "api_key.revoke",
    entity_type: "api_key",
    entity_id: keyId,
  });
  return { ok: true };
}

/* ---------- admin: users ---------- */

export async function listProfiles(userId: string): Promise<ProfileRow[]> {
  await requireSuperAdmin(userId);
  const { data, error } = await db()
    .from("portal_profiles")
    .select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProfileRow[];
}

export const ASSIGNABLE_ROLES = [
  "super_admin",
  "manager",
  "sales",
  "implementation",
  "tam_se",
  "customer",
] as const;

/**
 * Role changes must run through the CALLER's RLS-bound client, not the service
 * role: the portal_guard_role_change trigger checks portal_is_admin(), which
 * reads auth.uid() — a service-role update has no auth.uid() and is always
 * rejected by the database.
 */
export async function setProfileRole(
  callerUserId: string,
  callerSupabase: { from: (t: string) => any },
  targetProfileId: string,
  role: (typeof ASSIGNABLE_ROLES)[number],
): Promise<{ ok: true }> {
  await requireSuperAdmin(callerUserId);
  if (!ASSIGNABLE_ROLES.includes(role)) throw new Error("Unknown role");

  const { error } = await (callerSupabase as any)
    .from("portal_profiles")
    .update({ role })
    .eq("id", targetProfileId);
  if (error) {
    if (/only admins can change roles/i.test(error.message)) {
      throw new Error(
        "The database's role guard rejected this change — it currently only recognizes the legacy 'admin' role as an admin.",
      );
    }
    throw new Error(error.message);
  }

  // RLS can silently match zero rows instead of erroring, so confirm the write.
  const { data: after } = await db()
    .from("portal_profiles")
    .select("role")
    .eq("id", targetProfileId)
    .maybeSingle();
  if (!after) throw new Error("Profile not found");
  if (after.role !== role) {
    throw new Error(
      "The role was not changed — the database only lets profiles with the legacy 'admin' role change roles.",
    );
  }

  await audit({
    actor_type: "user",
    actor_id: callerUserId,
    action: "profile.role_change",
    entity_type: "profile",
    entity_id: targetProfileId,
    payload: { role },
  });
  return { ok: true };
}

/* Re-export for the API routes, which resolve sf_ ids the same way. */
export { resolveAccountId };

/* ---------- Deal field edits ---------- */

/**
 * Correct one fact on a deal, from wherever it is displayed.
 *
 * WHY ONE FIELD AT A TIME. The caller is an inline editor on a single value,
 * and a whole-record PATCH from that editor would send back every other field
 * as the browser last saw it — quietly reverting a colleague's edit made in the
 * meantime. One field, one write, and the rest of the row is left alone.
 *
 * ARR is the reason this exists at all: an account that starts at 5k and grows
 * to 8k is the fact the pipeline is for. The change is written to `audit_log`
 * through the shared activity path, so the account carries its own history of
 * what the number was and when it moved — no separate ARR-history table, and
 * the same feed picks up owner changes for free.
 */
export async function updateDealField(
  userId: string,
  dealId: string,
  field: EditableDealField,
  value: string | null,
): Promise<{ ok: true; field: EditableDealField; value: string | number | null }> {
  await requireSalesEditor(userId);

  const kind = EDITABLE_DEAL_FIELDS[field];
  if (!kind) throw new Error(`${field} is not editable here`);

  const { data: before } = await db()
    .from("portal_accounts")
    .select("*")
    .eq("id", dealId)
    .maybeSingle();
  if (!before) throw new Error("Deal not found");

  let next: string | number | null = value;

  if (kind === "number") {
    if (value === null || value.trim() === "") {
      next = null;
    } else {
      // Accept what a person actually types into a money field: "48,000",
      // "$48000", "48000.00". Refusing those and saying "must be a number" is
      // technically correct and infuriating.
      const cleaned = value.replace(/[$,\s]/g, "");
      const n = Number(cleaned);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`"${value}" is not an amount — enter a number like 48000`);
      }
      next = n;
    }
  }

  if (kind === "uuid" && next !== null) {
    // An owner must be a real profile. A free-typed id would save cleanly and
    // then render as "Unassigned" forever, which looks like the save failed.
    const { data: profile } = await db()
      .from("portal_profiles")
      .select("id")
      .eq("id", next)
      .maybeSingle();
    if (!profile) throw new Error("That person is not a user of this portal");
  }

  if (kind === "date" && next !== null) {
    const t = String(next).trim();
    if (t === "") {
      next = null;
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(Date.parse(t))) {
      throw new Error(`"${next}" is not a date — enter it as YYYY-MM-DD`);
    } else {
      next = t;
    }
  }

  if (kind === "url" && next !== null) {
    const t = String(next).trim();
    if (t === "") {
      next = null;
    } else {
      // http(s) only. A `javascript:` or `data:` link saved here is rendered
      // as an anchor on the deal page and put into a deck a customer opens.
      let parsed: URL;
      try {
        parsed = new URL(t);
      } catch {
        throw new Error(`"${t}" is not a link — paste the full https:// address`);
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("Only http and https links can be saved here");
      }
      next = parsed.toString();
    }
  }

  if (field === "name" && (next === null || String(next).trim() === "")) {
    throw new Error("A deal needs a name");
  }

  if (field === "salesforce_id" && next !== null) {
    next = sfId18(String(next));
  }

  const { error } = await db()
    .from("portal_accounts")
    .update({ [field]: next, updated_at: new Date().toISOString() })
    .eq("id", dealId);
  if (error) throw new Error(error.message);

  // After the write, never before: a feed row for a save that then failed is a
  // lie about history.
  const { recordActivity } = await import("./activity.server");
  await recordActivity(
    [
      {
        entity_type: "account",
        entity_id: dealId,
        field_name: field,
        old_value: before[field] == null ? null : String(before[field]),
        new_value: next == null ? null : String(next),
      },
    ],
    { actorProfileId: userId },
  );

  await audit({
    actor_type: "user",
    actor_id: userId,
    action: "account.field_update",
    entity_type: "account",
    entity_id: dealId,
    payload: { field, from: before[field] ?? null, to: next },
  });

  return { ok: true, field, value: next };
}
