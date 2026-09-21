import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TERM_LABELS } from "./terms";
import { resolveAccountId, transitionStage, upsertAccount } from "./server/accounts";
import { accountUpsertSchema } from "./server/schemas";
import { isStage, type AccountStage } from "./presale-stages";
import {
  findStage,
  isAtOrPast,
  stageAfterWon,
  stageOrder,
  terminalStage,
  wonStage,
  type PipelineStage,
} from "./pipeline-stages";
import { loadPipelineStages } from "./pipeline-stages.server";
import { isFlagOn } from "./app-config.server";
import { handoffConflictMessage, resolveHandoffCustomer } from "./presale-handoff";
import { audit } from "./server/audit";
import { createTamRequest } from "./server/tam";
import { API_SCOPES, generateApiKey, type ApiScope } from "./server/api-auth";
import { recordImplementationCreated } from "./server/events";
import { sfId18 } from "./server/sf-id";
import { FIELD_FUSION_STAGE, FIELD_FUSION_TEMPLATE_KEY } from "./field-fusion";
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

/**
 * Who may write to a deal: every GoCanvas login. The page opened to every
 * internal role a while ago (canEditDeal), but this guard behind the server
 * functions still said sales only, so an implementation specialist could see
 * the SOW row and be told "Your role cannot edit presale records" when she
 * pressed Upload. One rule, on both sides.
 */
export async function requireSalesEditor(userId: string): Promise<ProfileRow> {
  return requireInternal(userId);
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

/** Every login with its role, for the pickers that must not offer everyone. */
async function profileDirectory(): Promise<
  Array<{ id: string; name: string; role: import("./auth").PortalRole }>
> {
  const [{ data }, confirmed] = await Promise.all([
    db().from("portal_profiles").select("id, email, full_name, role"),
    confirmedAuthIds(),
  ]);
  return (
    (data ?? [])
      // An invited login that has never been activated cannot own anything yet.
      .filter((p: any) => !confirmed || confirmed.has(String(p.id)))
      .map((p: any) => ({
        id: String(p.id),
        name: (p.full_name || p.email) as string,
        role: p.role as import("./auth").PortalRole,
      }))
  );
}

let confirmedCache: { at: number; ids: Set<string> } | null = null;
/** Auth accounts that are confirmed, cached five minutes; null if auth cannot be read. */
async function confirmedAuthIds(): Promise<Set<string> | null> {
  if (confirmedCache && Date.now() - confirmedCache.at < 5 * 60_000) return confirmedCache.ids;
  try {
    const { data: page } = await db().auth.admin.listUsers({ page: 1, perPage: 1000 });
    const ids = new Set<string>();
    for (const u of (page?.users ?? []) as Array<{
      id: string;
      email_confirmed_at?: string | null;
      confirmed_at?: string | null;
    }>) {
      if (u.email_confirmed_at ?? u.confirmed_at) ids.add(u.id);
    }
    confirmedCache = { at: Date.now(), ids };
    return ids;
  } catch {
    return null;
  }
}

/**
 * Who an owner field may name. The AM owner is a seller or a manager; the SE
 * owner is technical or a manager. One unfiltered list let an SE be set as
 * the AM and offered customer logins as owners.
 */
/** A role as a word on screen; the same mapping auth.ts's ROLE_LABELS uses, without its browser imports. */
function roleWord(role: string): string {
  const key = role === "am" ? "sales" : role === "se" ? "tam_se" : role;
  return (TERM_LABELS as Record<string, string>)[key] ?? role.replace(/_/g, " ");
}

export function ownerOptionsByRole(
  people: ReadonlyArray<{ id: string; name: string; role: import("./auth").PortalRole }>,
): { am: Array<{ value: string; label: string }>; se: Array<{ value: string; label: string }> } {
  const managers = new Set(["admin", "super_admin", "manager"]);
  const sellers = new Set(["sales", "am"]);
  const technical = new Set(["tam_se", "se", "implementation", "onboarding"]);
  const pick = (roles: Set<string>) =>
    people
      .filter((p) => managers.has(p.role) || roles.has(p.role))
      .map((p) => ({ value: p.id, label: `${p.name} · ${roleWord(p.role)}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  return { am: pick(sellers), se: pick(technical) };
}

/* ---------- pipeline board ---------- */

export interface PipelineDeal extends Account {
  am_owner_name: string | null;
  /** The customer page this deal lives on once it has closed. */
  customer_id: string | null;
  /** The implementation on that page this deal became. */
  implementation_id: string | null;
  se_owner_name: string | null;
  /** New customer or existing account, when the intake has said. */
  path: "new_logo" | "existing" | "dm_conversion" | "field_fusion" | null;
  /** The two things Closed Won is gated on. */
  has_notes: boolean;
  has_sow: boolean;
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
  const [{ data: accounts, error }, names, stages, { data: noted }, { data: impls }] =
    await Promise.all([
      db().from("portal_accounts").select("*").order("name"),
      profileNames(),
      loadPipelineStages(),
      db().from("portal_gong_reports").select("account_id"),
      db()
        .from("implementations")
        .select("id,deal_id,created_at,owner_id")
        .is("superseded_by_implementation_id", null)
        .not("deal_id", "is", null)
        .order("created_at", { ascending: false }),
    ]);
  const implByDeal = new Map<string, string>();
  const implOwnerByDeal = new Map<string, string | null>();
  for (const i of (impls ?? []) as Array<{
    id: string;
    deal_id: string;
    owner_id: string | null;
  }>) {
    if (!implByDeal.has(i.deal_id)) {
      implByDeal.set(i.deal_id, String(i.id));
      implOwnerByDeal.set(i.deal_id, i.owner_id ?? null);
    }
  }
  if (error) throw new Error(error.message);
  const withNotes = new Set(
    ((noted ?? []) as Array<{ account_id: string }>).map((r) => r.account_id),
  );
  const { readIntake } = await import("./intake-answers");
  // "My accounts" on the board: a deal is mine when I own it as AM or SE, or
  // when I own the implementation it became. Most closed deals carry no
  // pre-sale owner at all, so the second is how a specialist's board fills.
  const inScope = (a: Account) =>
    !scope ||
    matchesScope(
      {
        implementationOwnerId: implOwnerByDeal.get(a.id) ?? null,
        csmOwnerId: null,
        amOwnerProfileId: a.am_owner_id ?? null,
        seOwnerProfileId: a.se_owner_id ?? null,
      },
      scope.scope,
      scope.viewer,
      scope.person ?? null,
    );

  const deals = ((accounts ?? []) as Array<Account & { customer_id?: string | null }>)
    .filter(inScope)
    .map((a) => ({
      ...a,
      customer_id: a.customer_id ?? null,
      implementation_id: implByDeal.get(a.id) ?? null,
      am_owner_name: a.am_owner_id ? (names.get(a.am_owner_id) ?? null) : null,
      se_owner_name: a.se_owner_id ? (names.get(a.se_owner_id) ?? null) : null,
      path: readIntake(a.intake).path,
      has_notes: withNotes.has(a.id),
      has_sow: Boolean(a.sow_document_path),
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
    path?: "new_logo" | "existing" | "dm_conversion" | "field_fusion" | null;
    industry?: string | null;
    /** Where the deal already is. A deal entered after it closed starts closed. */
    stage?: AccountStage | null;
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

  // The two facts the plan and the page read, captured while they are known.
  if (input.path || input.industry) {
    const { readIntake, intakeAnswersSchema } = await import("./intake-answers");
    const current = readIntake(result.account.intake);
    const next = intakeAnswersSchema.parse({
      ...current,
      ...(input.path && !current.path ? { path: input.path } : {}),
      ...(input.industry && !current.industry ? { industry: input.industry } : {}),
      updated_at: new Date().toISOString(),
    });
    await db().from("portal_accounts").update({ intake: next }).eq("id", result.account.id);
  }
  // A deal entered where it already is. The Closed Won check is for a move
  // somebody makes; a fact about the past is recorded as one.
  if (input.stage && input.stage !== result.account.stage && result.created) {
    await transitionStage(
      result.account.id,
      input.stage,
      { source: "ui", actorProfileId: userId },
      "Created in this stage",
    );
    result.account = { ...result.account, stage: input.stage };
  }
  return { account: result.account, created: result.created };
}

export const WON_GATE_PREFIX = "Not ready for Closed Won:";

/**
 * Closed Won is the trigger for everything downstream — the claim email,
 * the plan, the customer's page — so a deal does not get there without the
 * two things they all read: a call note and the signed SOW. A person may
 * still insist (`force`), and the move records that they did.
 */
export async function wonGate(dealId: string): Promise<string[]> {
  const [{ count: reports }, { data: row }] = await Promise.all([
    db()
      .from("portal_gong_reports")
      .select("id", { count: "exact", head: true })
      .eq("account_id", dealId),
    db().from("portal_accounts").select("sow_document_path").eq("id", dealId).maybeSingle(),
  ]);
  const missing: string[] = [];
  if ((reports ?? 0) === 0) missing.push("a Gong brief or call note");
  if (!row?.sow_document_path) missing.push("the signed SOW");
  return missing;
}

export async function transitionDeal(
  userId: string,
  dealId: string,
  toStage: AccountStage,
  note?: string,
  force = false,
): Promise<{ changed: boolean }> {
  await requireInternal(userId);
  const pipeline = await loadPipelineStages();
  if (toStage === wonStage(pipeline).key && !force) {
    const missing = await wonGate(dealId);
    if (missing.length) {
      throw new Error(`${WON_GATE_PREFIX} the deal has no ${missing.join(" and no ")}.`);
    }
  }
  if (force)
    note = note
      ? `${note} (moved despite the Closed Won check)`
      : "Moved despite the Closed Won check";
  // Via supabaseAdmin the RPC has no auth.uid(), so the passed actor is kept.
  const result = await transitionStage(
    dealId,
    toStage,
    { source: "ui", actorProfileId: userId },
    note,
  );
  // Closing the deal creates the customer's page and the implementation on
  // it. Nobody clicks "start onboarding" — the close is the start. A deal
  // whose customer is ambiguous (a name match with no identity match) is
  // left for a person to resolve on the deal, and the audit log says so.
  if (result.changed && toStage === wonStage(pipeline).key) {
    const { data: row } = await db()
      .from("portal_accounts")
      .select("customer_id")
      .eq("id", dealId)
      .maybeSingle();
    if (!row?.customer_id) {
      try {
        const first = await startOnboardingAs({ kind: "user", profileId: userId }, dealId, {});
        if (first.outcome === "needs_account_choice") {
          // No Salesforce match. A customer with the same name is a person's
          // call; nothing by that name means a new account, now.
          const { data: acct } = await db()
            .from("portal_accounts")
            .select("name")
            .eq("id", dealId)
            .maybeSingle();
          const { data: sameName } = await db()
            .from("customers")
            .select("id,name")
            .ilike("name", String(acct?.name ?? "").trim())
            .limit(1)
            .maybeSingle();
          if (sameName) {
            throw new Error(
              `A customer named “${sameName.name}” already exists. Pick it, or create a new account.`,
            );
          }
          await startOnboardingAs({ kind: "user", profileId: userId }, dealId, {
            createNewCustomer: true,
          });
        }
      } catch (e) {
        await audit({
          actor_type: "user",
          actor_id: userId,
          action: "onboarding.autostart_deferred",
          entity_type: "account",
          entity_id: dealId,
          payload: { reason: e instanceof Error ? e.message : String(e) },
        });
      }
    }
    // A Field Fusion account does not go to implementation yet: it moves on
    // to the setup stage, and the person who confirms the setup owns it
    // until she presses "Hand to implementation".
    const { readIntake } = await import("./intake-answers");
    const { data: closed } = await db()
      .from("portal_accounts")
      .select("intake")
      .eq("id", dealId)
      .maybeSingle();
    if (closed && readIntake(closed.intake).path === "field_fusion") {
      const { startFieldFusionSetup } = await import("./field-fusion.server");
      await startFieldFusionSetup(dealId, userId);
    }
  }
  return result;
}

/* ---------- help articles for the customer's page ---------- */

/**
 * Pick the articles for a deal from its latest brief and notes, and save
 * them on the intake. `replace` false leaves an existing list alone; true
 * replaces the AI's picks and keeps the ones a person added or edited.
 */
async function pickHelpForDeal(
  dealId: string,
  actorId: string | null,
  brief: unknown,
  replace: boolean,
): Promise<number> {
  const { readIntake, intakeAnswersSchema } = await import("./intake-answers");
  const { pickHelpArticles } = await import("./server/help/articles.server");
  const { data: row } = await db()
    .from("portal_accounts")
    .select("intake")
    .eq("id", dealId)
    .maybeSingle();
  const current = readIntake((row as any)?.intake);
  if (!replace && current.help_picks.length > 0) return 0;
  const { data: notes } = await db()
    .from("portal_gong_reports")
    .select("content_md")
    .eq("account_id", dealId);
  const notesText = ((notes ?? []) as Array<{ content_md: string }>)
    .map((r) => r.content_md)
    .join("\n\n");
  const { picks: picked, query } = await pickHelpArticles({
    intake: current,
    brief,
    notesText,
  });
  const kept = current.help_picks.filter((p) => p.source === "person");
  const merged = [
    ...kept,
    ...picked.filter((p) => !kept.some((k) => k.article_id === p.article_id)),
  ].slice(0, 8);
  const next = intakeAnswersSchema.parse({
    ...current,
    help_picks: merged,
    updated_at: new Date().toISOString(),
  });
  const { error } = await db()
    .from("portal_accounts")
    .update({ intake: next, updated_at: new Date().toISOString() })
    .eq("id", dealId);
  if (error) throw new Error(`Could not save the help articles: ${error.message}`);
  await audit({
    actor_type: actorId ? "user" : "system",
    actor_id: actorId,
    action: "deal.help_articles_picked",
    entity_type: "account",
    entity_id: dealId,
    payload: {
      picked: picked.length,
      kept: kept.length,
      features: query.features.map((f) => `${f.feature} (${f.reason})`),
      excluded: query.excluded,
      allowed_integrations: query.allowedIntegrations,
    },
  });
  return picked.length;
}

/** Pick again, from the latest complete brief. A person's own picks stay. */
export async function repickHelpArticles(
  userId: string,
  dealId: string,
): Promise<{ picked: number }> {
  await requireInternal(userId);
  const { data: brief } = await db()
    .from("portal_briefs")
    .select("structured_json")
    .eq("account_id", dealId)
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const picked = await pickHelpForDeal(dealId, userId, brief?.structured_json ?? null, true);
  return { picked };
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
  /** The same, narrowed to who may hold each role. */
  am_owner_options: Array<{ value: string; label: string }>;
  se_owner_options: Array<{ value: string; label: string }>;
  /** Short-lived signed link to the customer's logo, or null if none is set. */
  logo_url: string | null;
  /** Short-lived signed link to the uploaded SOW, or null if none was uploaded. */
  sow_url: string | null;
  /** The implementation this deal became, so links land on it and not on "latest". */
  implementation_id: string | null;
  /** Why onboarding did not start by itself at Closed Won, when it did not. */
  onboarding_deferred: string | null;
}

export async function loadDeal(dealId: string): Promise<DealDetail | null> {
  const { data: account } = await db()
    .from("portal_accounts")
    .select("*")
    .eq("id", dealId)
    .maybeSingle();
  if (!account) return null;

  const [names, gong, briefs, tam, notes, history, stages, people] = await Promise.all([
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
    profileDirectory(),
  ]);

  const named = (id: string | null | undefined) => (id ? (names.get(id) ?? null) : null);
  const byRole = ownerOptionsByRole(people);

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

  const [{ data: implRow }, { data: deferredRow }] = await Promise.all([
    db()
      .from("implementations")
      .select("id")
      .eq("deal_id", dealId)
      .is("superseded_by_implementation_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    account.customer_id
      ? Promise.resolve({ data: null })
      : db()
          .from("portal_audit_log")
          .select("payload,created_at")
          .eq("action", "onboarding.autostart_deferred")
          .eq("entity_id", dealId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
  ]);

  return {
    account: account as DealDetail["account"],
    logo_url: logoUrl,
    sow_url: sowUrl,
    implementation_id: implRow?.id ? String(implRow.id) : null,
    onboarding_deferred: (deferredRow?.payload as { reason?: string } | null)?.reason ?? null,
    am_owner_name: named(account.am_owner_id),
    se_owner_name: named(account.se_owner_id),
    // Sorted by the name a person will look for, not by id.
    owner_options: [...names.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    am_owner_options: byRole.am,
    se_owner_options: byRole.se,
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
    /** The day the call happened, when it is not the day it was pasted. */
    callDate?: string | null | undefined;
  },
): Promise<{ ok: true }> {
  await requireInternal(userId);
  const { error } = await db()
    .from("portal_gong_reports")
    .insert({
      account_id: input.dealId,
      report_type: input.reportType,
      title: input.title,
      content_md: input.contentMd,
      uploaded_by: userId,
      call_date: input.callDate ?? null,
    });
  if (error) throw new Error(`Could not save the report: ${error.message}`);
  // The notes are the first step, and the brief follows them on its own:
  // nobody presses a button to have the calls read. A failure here is
  // reported on the deal, not raised — the notes are already saved.
  try {
    await generateDealBrief(userId, input.dealId);
  } catch (e) {
    console.error("[reports] could not write the brief from the new notes", e);
  }
  return { ok: true };
}

/**
 * The signed contract, beside or instead of a SOW: a three-seat deal has no
 * SOW, but its contract says how many seats and for how long. PDF only,
 * same bucket and same rule as the forms.
 */
export async function uploadDealContract(
  userId: string,
  args: { dealId: string; fileName: string; dataBase64: string },
): Promise<import("./intake-answers").IntakeAnswers> {
  await requireSalesEditor(userId);
  if (args.dataBase64.length > SOW_MAX_BASE64) throw new Error("That file is over 25MB");
  const { readIntake, intakeAnswersSchema } = await import("./intake-answers");
  const { data: before } = await db()
    .from("portal_accounts")
    .select("intake")
    .eq("id", args.dealId)
    .maybeSingle();
  if (!before) throw new Error("Deal not found");
  const binary = Buffer.from(args.dataBase64, "base64");
  const safe = args.fileName.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-120) || "contract.pdf";
  const path = `deals/${args.dealId}/contract/${crypto.randomUUID()}-${safe}`;
  const { error: upErr } = await db()
    .storage.from("attachments")
    .upload(path, binary, { contentType: "application/pdf", upsert: false });
  if (upErr) throw new Error(`Could not upload the contract: ${upErr.message}`);
  const current = readIntake((before as any).intake);
  const next = intakeAnswersSchema.parse({
    ...current,
    contract: { path, name: args.fileName, uploaded_at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  });
  const { error } = await db()
    .from("portal_accounts")
    .update({ intake: next, updated_at: new Date().toISOString() })
    .eq("id", args.dealId);
  if (error) throw new Error(`Could not record the contract: ${error.message}`);
  await audit({
    actor_type: "user",
    actor_id: userId,
    action: "deal.contract_uploaded",
    entity_type: "account",
    entity_id: args.dealId,
    payload: { name: args.fileName },
  });
  return next;
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
): Promise<{
  id: string;
  status: string;
  generator: "llm" | "template" | null;
  error: string | null;
  filled: string[];
}> {
  await requireInternal(userId);
  const { generateBrief } = await import("./server/brief/generate");
  const brief = await generateBrief(dealId, userId);

  // A brief on file is the first fact the journey reads: the account moves
  // from Handoff to Kickoff on its own.
  if (brief.status === "complete") {
    const { syncJourneyStage } = await import("./journey-sync.server");
    await syncJourneyStage(dealId, userId);
  }

  // An AI synthesis fills the intake's blanks — the process today, the forms
  // they named, seats, the systems to connect. A person's answers stand.
  let filled: string[] = [];
  if (brief.status === "complete" && brief.generator === "llm" && brief.structured_json) {
    try {
      const { readIntake, intakeAnswersSchema } = await import("./intake-answers");
      const { prefillFromSynthesis } = await import("./intake-prefill");
      const { data: row } = await db()
        .from("portal_accounts")
        .select("intake")
        .eq("id", dealId)
        .maybeSingle();
      const current = readIntake((row as any)?.intake);
      const { data: notes } = await db()
        .from("portal_gong_reports")
        .select("content_md")
        .eq("account_id", dealId);
      const notesText = ((notes ?? []) as Array<{ content_md: string }>)
        .map((r) => r.content_md)
        .join("\n\n");
      const result = prefillFromSynthesis(current, brief.structured_json, notesText);
      if (result.filled.length) {
        const next = intakeAnswersSchema.parse({
          ...current,
          ...result.patch,
          updated_at: new Date().toISOString(),
        });
        const { error } = await db()
          .from("portal_accounts")
          .update({ intake: next, updated_at: new Date().toISOString() })
          .eq("id", dealId);
        if (!error) {
          filled = result.filled;
          await audit({
            actor_type: "user",
            actor_id: userId,
            action: "deal.intake_prefilled",
            entity_type: "account",
            entity_id: dealId,
            payload: { brief_id: brief.id, filled },
          });
        }
      }
    } catch (e) {
      // The brief is done either way; a prefill that fails is a blank left
      // blank, not a failed synthesis.
      console.error("[brief] could not prefill the intake", e);
    }

    // "Get started on your own": the help articles for what the calls
    // flagged. Only while nobody has picked any — a person's list stands.
    try {
      await pickHelpForDeal(dealId, userId, brief.structured_json, false);
    } catch (e) {
      console.error("[brief] could not pick the help articles", e);
    }

    // The deal's own header, blanks only: the champion the calls named, and
    // the website. The same rule as the intake — a person's entry stands.
    try {
      const { synthesisFromBrief } = await import("./welcome-synthesis");
      const synth = synthesisFromBrief(brief.structured_json);
      const b = brief.structured_json as { account?: { website?: string | null } } | null;
      const { data: row } = await db()
        .from("portal_accounts")
        .select("primary_contact_name,primary_contact_role,domain")
        .eq("id", dealId)
        .maybeSingle();
      const header: Record<string, string> = {};
      if (row && !row.primary_contact_name && synth?.champion?.name) {
        header["primary_contact_name"] = synth.champion.name;
        if (!row.primary_contact_role && synth.champion.role) {
          header["primary_contact_role"] = synth.champion.role;
        }
        filled = [...filled, "the contact"];
      }
      const site = b?.account?.website
        ?.trim()
        .replace(/^https?:\/\//i, "")
        .replace(/\/.*$/, "");
      if (row && !row.domain && site && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(site)) {
        header["domain"] = site.toLowerCase();
        filled = [...filled, "the website"];
      }
      if (Object.keys(header).length) {
        await db().from("portal_accounts").update(header).eq("id", dealId);
      }
    } catch (e) {
      console.error("[brief] could not fill the deal header", e);
    }
  }
  return {
    id: brief.id,
    status: brief.status,
    generator: brief.generator,
    error: brief.error,
    filled,
  };
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

/**
 * Who is starting onboarding. A person on the deal page, or an integration
 * (the closed-won webhook) with no person behind it — the same work either way,
 * with the audit trail and the plan's "applied by" naming whichever it was.
 */
export type OnboardingActor =
  { kind: "user"; profileId: string } | { kind: "api_key"; apiKeyId: string };

export async function startOnboarding(
  userId: string,
  dealId: string,
  options: StartOnboardingOptions = {},
): Promise<StartOnboardingResult> {
  await requireSalesEditor(userId);
  return startOnboardingAs({ kind: "user", profileId: userId }, dealId, options);
}

/**
 * The body of startOnboarding, with the role check already done by the caller.
 *
 * Split out so the closed-won webhook can run exactly this — customer,
 * implementation, plan, deal link, stage move — under an API key. Before the
 * split, an integration could create the deal but not kick anything off, and
 * "a deal appeared, somebody go and press Start onboarding" is not a handoff.
 */
export async function startOnboardingAs(
  actor: OnboardingActor,
  dealId: string,
  options: StartOnboardingOptions = {},
): Promise<StartOnboardingResult> {
  const userId = actor.kind === "user" ? actor.profileId : null;

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
  const { readIntake: readIntakeFor } = await import("./intake-answers");
  const { data: impl, error: implError } = await db()
    .from("implementations")
    .insert({
      customer_id: customerId,
      // The deal this project came from (0041). Without it the customer page
      // has no way back to the plan, the clock or the welcome link — the
      // backfill covered the old rows; this covers every new one.
      deal_id: account.id,
      name: implementationNameFor(readIntakeFor(account.intake), String(account.name)),
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
  // entered_by is a team_members id; the login's profile carries the link.
  const { teamMemberIdForProfile } = await import("./activity.server");
  const { error: historyError } = await db()
    .from("implementation_stage_history")
    .insert({
      implementation_id: impl.id,
      stage: firstStage,
      entered_at: now,
      entered_by: await teamMemberIdForProfile(userId),
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
    // A Field Fusion account is a training journey, not a form build: the
    // rail and the tasks come from that template when it is published.
    preferKey:
      (await import("./intake-answers")).readIntake((account as { intake?: unknown }).intake)
        .path === "field_fusion"
        ? FIELD_FUSION_TEMPLATE_KEY
        : null,
  });

  // Carry what the deal already settled onto the project, so nobody is asked
  // to redo it: the owner who claimed it, and the handoff tasks the deal's
  // record already satisfies — a call note on file, the SOW uploaded, the
  // champion named, the kickoff booked. Never throws: the project exists.
  try {
    const { data: led } = await db()
      .from("portal_assignments")
      .select("team_member_id")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (led?.team_member_id) {
      await db().from("implementations").update({ owner_id: led.team_member_id }).eq("id", impl.id);
    }
    const { readIntake } = await import("./intake-answers");
    const intake = readIntake((account as { intake?: unknown }).intake);

    // The facts the deal already holds, onto the record that will be read
    // for the next twelve weeks: the seller, the target launch from the plan,
    // the integration tier, the goal the brief captured, and the named
    // contact as the first customer contact. None of this is re-asked.
    await carryDealFacts(dealId, impl.id as string, customerId, account, intake, userId);
    const { count: reports } = await db()
      .from("portal_gong_reports")
      .select("id", { count: "exact", head: true })
      .eq("account_id", dealId);
    const satisfied: string[] = [];
    if ((reports ?? 0) > 0) satisfied.push("nl.packet_review");
    if (
      (account as { sow_document_path?: string | null }).sow_document_path ||
      account.sow_document_url
    )
      satisfied.push("nl.sow_confirm");
    if (account.primary_contact_name) satisfied.push("nl.name_champion");
    if (intake.timeline.times?.["kickoff"]) satisfied.push("nl.kickoff_scheduled");
    if (satisfied.length) {
      const { data: items } = await db()
        .from("work_items")
        .select("id,task_key,status")
        .eq("implementation_id", impl.id)
        .in("task_key", satisfied);
      const { setWorkItemStatus } = await import("./plan.server");
      for (const it of (items ?? []) as Array<{ id: string; status: string }>) {
        if (it.status !== "done") {
          await setWorkItemStatus({
            workItemId: String(it.id),
            status: "done",
            actorProfileId: actor.kind === "user" ? actor.profileId : null,
          });
        }
      }
    }
  } catch (e) {
    console.error("[start onboarding] could not carry the deal's work onto the project", e);
  }

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
  // A Field Fusion deal goes to its setup wait instead: the product is
  // confirmed working before implementation sees it.
  const isFieldFusion =
    (await import("./intake-answers")).readIntake((account as { intake?: unknown }).intake).path ===
    "field_fusion";
  const next = isFieldFusion
    ? (findStage(pipeline, FIELD_FUSION_STAGE) ?? stageAfterWon(pipeline))
    : stageAfterWon(pipeline);
  if (account.stage === won.key && next) {
    await transitionStage(
      dealId,
      next.key as AccountStage,
      actor.kind === "user"
        ? { source: "ui", actorProfileId: actor.profileId }
        : { source: "api", actorApiKeyId: actor.apiKeyId },
      actor.kind === "user"
        ? "Onboarding started from the deal record"
        : "Onboarding started by the closed-won webhook",
    );
  }

  const matchedBy = decision.action === "use_existing" ? decision.matchedBy : "created";

  // (d) audit.
  await audit({
    actor_type: actor.kind === "user" ? "user" : "api_key",
    actor_id: actor.kind === "user" ? actor.profileId : actor.apiKeyId,
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

export type ProfileListRow = ProfileRow & {
  /** The auth account is confirmed: the person can sign in. */
  activated: boolean;
  last_sign_in_at: string | null;
};

/**
 * Every profile, with whether its sign-in actually works. An invite creates
 * the profile at once, so "in the list" never meant "can sign in": the
 * confirmation lives on the auth account, which is read here so an admin
 * can see who is still locked out and activate them by hand.
 */
export async function listProfiles(userId: string): Promise<ProfileListRow[]> {
  await requireSuperAdmin(userId);
  const { data, error } = await db()
    .from("portal_profiles")
    .select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ProfileRow[];

  const auth = new Map<string, { confirmed: boolean; lastSignIn: string | null }>();
  try {
    const { data: page } = await db().auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of (page?.users ?? []) as Array<{
      id: string;
      email_confirmed_at?: string | null;
      confirmed_at?: string | null;
      last_sign_in_at?: string | null;
    }>) {
      auth.set(u.id, {
        confirmed: Boolean(u.email_confirmed_at ?? u.confirmed_at),
        lastSignIn: u.last_sign_in_at ?? null,
      });
    }
  } catch (e) {
    // The list must still render: without the auth read everyone shows as
    // activated, which is the pre-existing behaviour, not a new failure.
    console.error("[users] could not read auth accounts", e);
  }
  return rows.map((r) => {
    const a = auth.get(r.id);
    return {
      ...r,
      activated: a ? a.confirmed : true,
      last_sign_in_at: a?.lastSignIn ?? null,
    };
  });
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

  // The implementation's "sales owner" is the deal's AM: a change here
  // follows through, else the customer page shows whoever it was at handoff.
  if (field === "am_owner_id") {
    const { data: am } = next
      ? await db().from("portal_profiles").select("full_name,email").eq("id", next).maybeSingle()
      : { data: null };
    await db()
      .from("implementations")
      .update({ sales_owner: am ? am.full_name || am.email : null, sales_owner_id: next })
      .eq("deal_id", dealId);
  }

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

/* ---------- onboarding intake (0047) ---------- */

/**
 * The intake answers on a deal, saved one at a time as the conversation
 * gives them. Merged, never replaced: two people on the same deal must not
 * undo each other, and an upload must not wipe an answer typed a minute ago.
 */
export async function saveDealIntake(
  userId: string,
  dealId: string,
  patch: Record<string, unknown>,
): Promise<import("./intake-answers").IntakeAnswers> {
  await requireSalesEditor(userId);
  const { readIntake, intakeAnswersSchema } = await import("./intake-answers");

  const { data: before } = await db()
    .from("portal_accounts")
    .select("intake")
    .eq("id", dealId)
    .maybeSingle();
  if (!before) throw new Error("Deal not found");

  const current = readIntake((before as any).intake);
  // The Field Fusion block is patched one tick at a time; a tick must not
  // wipe the other tick, the note, or the handoff stamp.
  const merged: Record<string, unknown> = { ...patch };
  for (const block of ["field_fusion", "existing"] as const) {
    if (patch[block] && typeof patch[block] === "object") {
      merged[block] = { ...current[block], ...(patch[block] as Record<string, unknown>) };
    }
  }
  const next = intakeAnswersSchema.parse({
    ...current,
    ...merged,
    updated_at: new Date().toISOString(),
  });

  const { error } = await db()
    .from("portal_accounts")
    .update({ intake: next, updated_at: new Date().toISOString() })
    .eq("id", dealId);
  if (error) throw new Error(`Could not save the intake: ${error.message}`);

  await audit({
    actor_type: "user",
    actor_id: userId,
    action: "deal.intake_updated",
    entity_type: "account",
    entity_id: dealId,
    payload: { fields: Object.keys(patch) },
  });

  // A ticked step is a fact the journey reads: the stage follows the plan.
  {
    const { syncJourneyStage } = await import("./journey-sync.server");
    await syncJourneyStage(dealId, userId);
  }

  // The flow was set to Field Fusion on a deal that has already closed —
  // a Salesforce close, or a person who picked the flow late. The setup
  // gate runs now, the way it would have at the close.
  if (
    next.path === "field_fusion" &&
    current.path !== "field_fusion" &&
    !next.field_fusion.handed_off_at
  ) {
    const { data: row } = await db()
      .from("portal_accounts")
      .select("stage")
      .eq("id", dealId)
      .maybeSingle();
    const stages = await loadPipelineStages();
    if (
      row &&
      row.stage !== FIELD_FUSION_STAGE &&
      isAtOrPast(stages, row.stage, wonStage(stages).key)
    ) {
      const { startFieldFusionSetup } = await import("./field-fusion.server");
      await startFieldFusionSetup(dealId, userId);
    }
  }
  return next;
}

/**
 * Facts an integration knows at close time — seats, the integration tier —
 * onto the intake without a person, so the plan panel and the assignment
 * weight already have them. Never overwrites what a person typed.
 */
export async function saveDealIntakeFacts(
  dealId: string,
  facts: { seats?: number | undefined; integrationTier?: number | undefined },
): Promise<void> {
  const { readIntake, intakeAnswersSchema } = await import("./intake-answers");
  const { data: before } = await db()
    .from("portal_accounts")
    .select("intake")
    .eq("id", dealId)
    .maybeSingle();
  if (!before) return;
  const current = readIntake((before as any).intake);
  const next = intakeAnswersSchema.parse({
    ...current,
    field_users: current.field_users ?? facts.seats ?? null,
    timeline: {
      ...current.timeline,
      integration_tier:
        current.timeline.integration_tier ||
        (facts.integrationTier ?? current.timeline.integration_tier),
    },
    updated_at: new Date().toISOString(),
  });
  await db().from("portal_accounts").update({ intake: next }).eq("id", dealId);
}

/**
 * A form the customer already has, filed against the deal. The same private
 * bucket and signed-link rule as the SOW: a customer's own paperwork is not
 * something that sits behind a URL that works for anyone who has it.
 */
export async function uploadDealIntakeForm(
  userId: string,
  args: { dealId: string; fileName: string; contentType: string; dataBase64: string },
): Promise<import("./intake-answers").IntakeAnswers> {
  await requireSalesEditor(userId);
  if (args.dataBase64.length > SOW_MAX_BASE64) {
    throw new Error("That file is over 25MB — a photo of the form is enough");
  }
  const { readIntake, intakeAnswersSchema } = await import("./intake-answers");

  const { data: before } = await db()
    .from("portal_accounts")
    .select("intake")
    .eq("id", args.dealId)
    .maybeSingle();
  if (!before) throw new Error("Deal not found");

  const binary = Buffer.from(args.dataBase64, "base64");
  const safe = args.fileName.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-120) || "form";
  const path = `deals/${args.dealId}/forms/${crypto.randomUUID()}-${safe}`;

  const { error: upErr } = await db()
    .storage.from("attachments")
    .upload(path, binary, { contentType: args.contentType, upsert: false });
  if (upErr) throw new Error(`Could not upload the form: ${upErr.message}`);

  const current = readIntake((before as any).intake);
  const next = intakeAnswersSchema.parse({
    ...current,
    forms_built: true,
    uploaded_forms: [
      ...current.uploaded_forms,
      { path, name: args.fileName, uploaded_at: new Date().toISOString() },
    ],
    updated_at: new Date().toISOString(),
  });

  const { error } = await db()
    .from("portal_accounts")
    .update({ intake: next, updated_at: new Date().toISOString() })
    .eq("id", args.dealId);
  if (error) {
    try {
      await db().storage.from("attachments").remove([path]);
    } catch {
      /* the row is what matters */
    }
    throw new Error(error.message);
  }

  await audit({
    actor_type: "user",
    actor_id: userId,
    action: "deal.intake_form_uploaded",
    entity_type: "account",
    entity_id: args.dealId,
    payload: { name: args.fileName, content_type: args.contentType },
  });

  return next;
}

export async function intakeFormLink(dealId: string, path: string): Promise<{ url: string }> {
  // The path must belong to this deal: a signed link for any path a caller
  // names would turn this into a read of the whole bucket.
  if (!path.startsWith(`deals/${dealId}/forms/`) && !path.startsWith(`deals/${dealId}/contract/`))
    throw new Error("That file is not on this deal");
  const { data, error } = await db()
    .storage.from("attachments")
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) throw new Error("Could not open that file");
  return { url: data.signedUrl as string };
}

/* ---------- the deals waiting before kickoff ---------- */

export type DealInboxRow = {
  id: string;
  name: string;
  stage: AccountStage;
  stage_label: string;
  stage_entered_at: string;
  path: "new_logo" | "existing" | "dm_conversion" | "field_fusion" | null;
  /** The implementation owner from the claim ledger, when somebody has claimed it. */
  owner_name: string | null;
  /** The viewer is that owner. */
  mine: boolean;
  /** Nobody has claimed it yet. */
  unclaimed: boolean;
  /** The next step of the deal page's own guide, so Home says the same thing the deal does. */
  next_step: string | null;
};

/**
 * Deals that have not started onboarding yet: everything Home did not show.
 *
 * "Today" listed implementations only, so a deal waiting to be claimed, or
 * claimed and waiting for its brief, appeared nowhere on the page the team
 * opens first. Scope follows the page's scope control: "mine" is what I own
 * plus what nobody owns yet, "person" is theirs, "all" is everything.
 */
export async function loadDealInbox(scope: ResolvedScope | null): Promise<DealInboxRow[]> {
  const { deals, stages } = await loadPipeline(null);
  const done = terminalStage(stages).key;
  const open = deals.filter((d) => d.stage !== done);
  if (open.length === 0) return [];
  const ids = open.map((d) => d.id);

  const [{ data: impls }, { data: ledger }, { data: briefs }] = await Promise.all([
    db().from("implementations").select("deal_id").in("deal_id", ids),
    db()
      .from("portal_assignments")
      .select("deal_id, team_member_id, created_at, team_members(name)")
      .in("deal_id", ids)
      .order("created_at", { ascending: false }),
    db()
      .from("portal_briefs")
      .select("account_id")
      .eq("status", "complete")
      .eq("generator", "llm")
      .in("account_id", ids),
  ]);
  const started = new Set(
    ((impls ?? []) as Array<{ deal_id: string | null }>).map((r) => r.deal_id),
  );
  const briefed = new Set(
    ((briefs ?? []) as Array<{ account_id: string }>).map((r) => r.account_id),
  );
  const owner = ownersFromLedger(ledger);

  const { guideSteps } = await import("./deal-guide");
  const labels = new Map(stages.map((s) => [s.key, s.label]));
  const won = wonStage(stages).key;
  const me = scope?.viewer.teamMemberId ?? null;
  const person = scope?.person?.teamMemberId ?? null;

  return open
    .filter((d) => !started.has(d.id))
    .map((d): DealInboxRow => {
      const o = owner.get(d.id);
      const ownerId = o?.id ?? null;
      const next =
        guideSteps({
          intake: d.intake,
          gongReports: d.has_notes ? 1 : 0,
          aiBriefs: briefed.has(d.id) ? 1 : 0,
          hasSow: d.has_sow,
          shareUrl: (d as { welcome_share_url?: string | null }).welcome_share_url ?? null,
          stageHistory: [],
          wonStageKey: won,
        }).find((s) => !s.done)?.label ?? "Start onboarding";
      return {
        id: d.id,
        name: d.name,
        stage: d.stage,
        stage_label: labels.get(d.stage) ?? d.stage,
        stage_entered_at: d.stage_entered_at,
        path: d.path,
        owner_name: ownerId ? (o?.name ?? null) : null,
        mine: Boolean(me) && ownerId === me,
        unclaimed: !ownerId,
        next_step: next,
      };
    })
    .filter((row) => {
      const mode = scope?.scope.mode ?? "all";
      if (mode === "all") return true;
      if (mode === "person") return person !== null && owner.get(row.id)?.id === person;
      return row.mine || row.unclaimed;
    })
    .sort(
      (a, b) =>
        Number(b.unclaimed) - Number(a.unclaimed) ||
        a.stage_entered_at.localeCompare(b.stage_entered_at),
    );
}

type LedgerRow = {
  deal_id: string | null;
  team_member_id: string | null;
  team_members: { name: string } | { name: string }[] | null;
};

/** Latest ledger row per deal wins; a null team member is an unassignment. */
function ownersFromLedger(
  ledger: unknown,
): Map<string, { id: string | null; name: string | null }> {
  const owner = new Map<string, { id: string | null; name: string | null }>();
  for (const row of (ledger ?? []) as LedgerRow[]) {
    if (!row.deal_id || owner.has(row.deal_id)) continue;
    const tm = Array.isArray(row.team_members) ? row.team_members[0] : row.team_members;
    owner.set(row.deal_id, {
      id: row.team_member_id ? String(row.team_member_id) : null,
      name: tm?.name ?? null,
    });
  }
  return owner;
}

/** Who owns each deal today, from the claim ledger. Deals with no row are absent. */
export async function dealOwners(
  dealIds: string[],
): Promise<Map<string, { id: string | null; name: string | null }>> {
  if (dealIds.length === 0) return new Map();
  const { data } = await db()
    .from("portal_assignments")
    .select("deal_id, team_member_id, created_at, team_members(name)")
    .in("deal_id", dealIds)
    .order("created_at", { ascending: false });
  return ownersFromLedger(data);
}

/**
 * What the deal settled, written onto the implementation and the customer at
 * handoff. Blanks only: a value somebody already typed on the record stands.
 * Never throws.
 */
async function carryDealFacts(
  dealId: string,
  implementationId: string,
  customerId: string,
  account: Account & { customer_id?: string | null },
  intake: import("./intake-answers").IntakeAnswers,
  actorProfileId: string | null = null,
): Promise<void> {
  try {
    const { closeDateFor, timelineFor } = await import("./onboarding-plan");
    const [{ data: transitions }, stages, { data: brief }, { data: am }] = await Promise.all([
      db().from("portal_stage_transitions").select("to_stage,occurred_at").eq("account_id", dealId),
      loadPipelineStages(),
      db()
        .from("portal_briefs")
        .select("structured_json")
        .eq("account_id", dealId)
        .eq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      account.am_owner_id || account.se_owner_id || actorProfileId
        ? db()
            .from("portal_profiles")
            .select("full_name,email")
            .eq("id", account.am_owner_id ?? account.se_owner_id ?? actorProfileId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const close = closeDateFor({
      intake,
      stageHistory: (transitions ?? []) as Array<{ to_stage: string; occurred_at: string }>,
      wonStageKey: wonStage(stages).key,
    }).date;
    const t = timelineFor(intake, close);
    const integrationTier = Math.max(
      intake.timeline.integration_tier ?? 0,
      ...((intake.timeline.services ?? []) as Array<{ kind: string; tier?: number | null }>)
        .filter((x) => x.kind === "integration")
        .map((x) => x.tier ?? 0),
    );
    const goal =
      (brief?.structured_json as { kickoff?: { day_90_definition?: string | null } } | null)
        ?.kickoff?.day_90_definition ?? null;

    const patch: Record<string, unknown> = {};
    if (am?.full_name || am?.email) patch["sales_owner"] = am.full_name || am.email;
    patch["target_launch_date"] = t.phases.length
      ? (t.phases[t.phases.length - 1]?.endsOn ?? t.liveDate)
      : t.liveDate;
    if (integrationTier > 0) patch["tier"] = `Tier ${integrationTier}`;
    if (goal) patch["customer_goals"] = goal;
    if (Object.keys(patch).length) {
      await db().from("implementations").update(patch).eq("id", implementationId);
    }

    if (account.primary_contact_name) {
      const { data: existing } = await db()
        .from("customer_contacts")
        .select("id")
        .eq("customer_id", customerId)
        .ilike("name", account.primary_contact_name.trim())
        .limit(1)
        .maybeSingle();
      if (!existing) {
        await db()
          .from("customer_contacts")
          .insert({
            customer_id: customerId,
            name: account.primary_contact_name.trim(),
            role: account.primary_contact_role?.trim() || "Champion",
            email: account.primary_contact_email?.trim() || null,
          });
      }
    }
  } catch (e) {
    console.error("[handoff] could not carry the deal's facts onto the record", e);
  }
}

/**
 * A project's name, from what it is: the customer's name is already the
 * page's heading, and a second project called the same thing left the list
 * ambiguous by the third. The first form names a new logo's onboarding; the
 * bought services name an existing account's; the customer's name is the
 * last resort.
 */
export function implementationNameFor(
  intake: import("./intake-answers").IntakeAnswers,
  accountName: string,
): string {
  const firstForm = intake.wanted_forms[0]?.name?.trim() || intake.uploaded_forms[0]?.name?.trim();
  const services = (intake.timeline.services ?? []).map((s) => s.name.trim()).filter(Boolean);
  if (intake.path === "existing" && services.length) {
    return services.length === 1 ? services[0]! : `${services[0]} + ${services.length - 1} more`;
  }
  if (intake.path === "field_fusion") return `${accountName} — Field Fusion training`;
  if (intake.training_only) return `${accountName} — training`;
  if (intake.path === "dm_conversion") {
    return firstForm
      ? `${firstForm} — from Device Magic`
      : `${accountName} — Device Magic conversion`;
  }
  if (firstForm) {
    return services.length ? `${firstForm} + ${services.length} more` : `${firstForm} — first form`;
  }
  if (services.length)
    return services.length === 1 ? services[0]! : `${services[0]} + ${services.length - 1} more`;
  return `${accountName} onboarding`;
}
