import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveAccountId, transitionStage, upsertAccount } from "./server/accounts";
import { accountUpsertSchema } from "./server/schemas";
import { isStage, STAGES, type AccountStage } from "./presale-stages";
import { audit } from "./server/audit";
import { createTamRequest } from "./server/tam";
import { API_SCOPES, generateApiKey, type ApiScope } from "./server/api-auth";
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

export async function loadPipeline(): Promise<{ deals: PipelineDeal[] }> {
  const [{ data: accounts, error }, names] = await Promise.all([
    db().from("portal_accounts").select("*").order("name"),
    profileNames(),
  ]);
  if (error) throw new Error(error.message);
  const deals = ((accounts ?? []) as Account[]).map((a) => ({
    ...a,
    am_owner_name: a.am_owner_id ? names.get(a.am_owner_id) ?? null : null,
    se_owner_name: a.se_owner_id ? names.get(a.se_owner_id) ?? null : null,
  }));
  return { deals };
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
  return raw.toLowerCase().trim().replace(/[\s-]+/g, "_");
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
        message: check.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; "),
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
  tam_requests: Array<TamRequest & { requested_by_name: string | null; decided_by_name: string | null }>;
  notes: Array<OnboardingNote & { author_name: string | null; reviewed_by_name: string | null }>;
  stage_history: Array<StageTransition & { actor_name: string | null }>;
}

export async function loadDeal(dealId: string): Promise<DealDetail | null> {
  const { data: account } = await db()
    .from("portal_accounts")
    .select("*")
    .eq("id", dealId)
    .maybeSingle();
  if (!account) return null;

  const [names, gong, briefs, tam, notes, history] = await Promise.all([
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
  ]);

  const named = (id: string | null | undefined) => (id ? names.get(id) ?? null : null);

  return {
    account: account as DealDetail["account"],
    am_owner_name: named(account.am_owner_id),
    se_owner_name: named(account.se_owner_id),
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
  };
}

/* ---------- notes & Gong reports ---------- */

export async function addGongReport(
  userId: string,
  input: { dealId: string; title: string; reportType: "call_notes" | "account_map"; contentMd: string },
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

export async function startOnboarding(
  userId: string,
  dealId: string,
): Promise<{ customerId: string; implementationId: string; alreadyLinked: boolean }> {
  await requireSalesEditor(userId);

  const { data: account } = await db()
    .from("portal_accounts")
    .select("*")
    .eq("id", dealId)
    .maybeSingle();
  if (!account) throw new Error("Deal not found");
  if (account.customer_id) {
    return { customerId: account.customer_id, implementationId: "", alreadyLinked: true };
  }

  const stageIdx = (STAGES as readonly string[]).indexOf(account.stage);
  if (stageIdx < (STAGES as readonly string[]).indexOf("closed_won")) {
    throw new Error("Only a closed-won deal can start onboarding");
  }

  // (a) customer + implementation records in the hub's post-sale tables.
  const { data: customer, error: customerError } = await db()
    .from("customers")
    .insert({ name: account.name, arr: account.arr ?? null, industry: null })
    .select("id")
    .single();
  if (customerError || !customer) {
    throw new Error(customerError?.message ?? "Could not create the customer record");
  }

  const firstStage = LIFECYCLE_STAGES[0]!.id;
  const now = new Date().toISOString();
  const { data: impl, error: implError } = await db()
    .from("implementations")
    .insert({
      customer_id: customer.id,
      name: account.name,
      current_stage: firstStage,
      stage_entered_at: now,
      status: "on_track",
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
    throw new Error(`Implementation created, but its stage history row failed: ${historyError.message}`);
  }

  // (b) link the deal to the customer record.
  const { error: linkError } = await db()
    .from("portal_accounts")
    .update({ customer_id: customer.id })
    .eq("id", dealId);
  if (linkError) throw new Error(`Could not link the deal: ${linkError.message}`);

  // (c) move the deal into onboarding_kickoff (only forward, never backward).
  if (account.stage === "closed_won") {
    await transitionStage(
      dealId,
      "onboarding_kickoff",
      { source: "ui", actorProfileId: userId },
      "Onboarding started from the deal record",
    );
  }

  // (d) audit.
  await audit({
    actor_type: "user",
    actor_id: userId,
    action: "account.start_onboarding",
    entity_type: "account",
    entity_id: dealId,
    payload: { customer_id: customer.id, implementation_id: impl.id },
  });

  return { customerId: customer.id as string, implementationId: impl.id as string, alreadyLinked: false };
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
  input: { name: string; scopes: string[] },
): Promise<{ key: string; record: ApiKey }> {
  await requireSuperAdmin(userId);
  const scopes = input.scopes.filter((s): s is ApiScope =>
    (API_SCOPES as readonly string[]).includes(s),
  );
  if (scopes.length === 0) throw new Error("Pick at least one scope");

  const { key, hash, prefix } = generateApiKey();
  const { data, error } = await db()
    .from("portal_api_keys")
    .insert({ name: input.name, key_prefix: prefix, key_hash: hash, scopes, created_by: userId })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create the key");

  await audit({
    actor_type: "user",
    actor_id: userId,
    action: "api_key.create",
    entity_type: "api_key",
    entity_id: data.id,
    payload: { name: input.name, scopes },
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
