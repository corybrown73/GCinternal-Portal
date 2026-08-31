// ./llm and ./pptx are loaded at their call sites, not here.
//
// This module is already behind a dynamic import in presale.server.ts, but a
// STATIC import of these two lets the bundler hoist the Anthropic SDK (578 kB)
// and pptxgenjs (398 kB) into the SSR boot entry. Nearly a megabyte was being
// parsed on every cold start so that a page which never generates a brief could
// be served. Deferring them here keeps them in their own chunks, loaded only
// when a brief is actually generated.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
const createAdminClient = () => supabaseAdmin as unknown as SupabaseClient;
import { audit } from "../audit";
import { buildTemplateBrief } from "./fallback";
import type { Account, Brief, GongReport, OnboardingNote } from "../../presale-types";
import type { BriefJson } from "../schemas";
import { appUrl } from "@/lib/app-url";
import { stageDefinition } from "@/lib/lifecycle";
import type { KickoffPerson, KickoffStage, KickoffTask } from "@/lib/kickoff-fields";

/**
 * Who the customer is about to work with, and the plan they are about to run.
 *
 * NEITHER IS IN THE BRIEF, and both are what makes this a handoff document
 * rather than a summary of sales calls. The customer met an AE; from the
 * kickoff onward they work with an implementation lead they have never met,
 * against a plan that was generated when the project was created.
 *
 * Both are null-tolerant by design. A deck generated the day a deal closes has
 * no project and therefore no plan; the deck says so rather than dropping the
 * slide, because "no project has been created yet" is exactly the thing a
 * kickoff meeting needs to discover before it starts.
 */
type HandoffContext = {
  team: KickoffPerson[];
  stages: KickoffStage[];
  customerTasks: KickoffTask[];
  risks: Array<{ title: string; mitigation: string | null }>;
  successCriteria: Array<{ description: string; target: string | null }>;
  requirements: Array<{ title: string; inScope: boolean }>;
  solutions: string[];
  targetLaunchDate: string | null;
};

/**
 * What the kickoff deck needs and the brief cannot know.
 *
 * The brief is a reading of sales calls. The deck is a meeting with the
 * customer in the room, so it also needs the people they are about to work
 * with, the plan they are about to run, and what has been recorded against the
 * project since it was created.
 *
 * All of it degrades to nothing. A deck generated the day a deal closes has no
 * project; every one of these comes back empty and the renderer marks the
 * fields for the AE to complete before the call.
 */
async function loadHandoffContext(
  admin: SupabaseClient,
  account: Account,
  owners: { am: string | null; se: string | null },
): Promise<HandoffContext> {
  // Roles use the template's own wording, so a generated deck and a
  // hand-built one read the same.
  const team: KickoffPerson[] = [];
  if (owners.se) {
    team.push({ name: owners.se, role: "Solutions Consultant · Form and workflow build" });
  }
  if (owners.am) {
    team.push({ name: owners.am, role: "Customer Success Manager · Your long-term partner" });
  }

  const empty: HandoffContext = {
    team,
    stages: [],
    customerTasks: [],
    risks: [],
    successCriteria: [],
    requirements: [],
    solutions: [],
    targetLaunchDate: null,
  };

  const customerId = (account as any).customer_id as string | null | undefined;
  if (!customerId) return empty;

  const { data: impl } = await admin
    .from("implementations")
    .select("id, name, target_launch_date, owner_id, contract_start_date")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!impl) return empty;

  const [
    { data: lead },
    { data: stages },
    { data: tasks },
    { data: risks },
    { data: criteria },
    { data: requirements },
    { data: solutions },
  ] = await Promise.all([
    impl.owner_id
      ? admin.from("team_members").select("name").eq("id", impl.owner_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("stage_instances")
      // `id` is what work_items joins on. Without it every customer-side task
      // resolves its stage to a dash, silently.
      .select("id, stage_key, name, target_duration_days, position, entered_at")
      .eq("implementation_id", impl.id)
      .order("position", { ascending: true }),
    admin
      .from("work_items")
      .select("title, stage_instance_id, position, due_at")
      .eq("implementation_id", impl.id)
      .eq("party", "customer")
      .neq("status", "done")
      .neq("status", "skipped")
      .order("position", { ascending: true })
      .limit(8),
    admin
      .from("risks")
      .select("title, mitigation, severity")
      .eq("implementation_id", impl.id)
      .neq("status", "closed")
      .order("identified_at", { ascending: false })
      .limit(3),
    admin
      .from("success_criteria")
      .select("description, target_value")
      .eq("implementation_id", impl.id)
      .limit(3),
    admin.from("requirements").select("title, scope_status").eq("implementation_id", impl.id),
    admin.from("technical_solutions").select("title").eq("implementation_id", impl.id).limit(3),
  ]);

  if ((lead as any)?.name) {
    // First in the list: the person the room most needs to know.
    team.unshift({
      name: (lead as any).name as string,
      role: "Implementation Lead · Your main point of contact",
    });
  }

  const rows = (stages ?? []) as Array<Record<string, any>>;

  return {
    team,
    targetLaunchDate: (impl.target_launch_date as string | null) ?? null,
    stages: rows.map((st) => ({
      name: String(st["name"]),
      // The template names the stage; the lifecycle definition says what
      // "done" means there, which is what a customer actually wants.
      intent: stageDefinition(String(st["stage_key"]))?.intent ?? null,
      targetDays: (st["target_duration_days"] as number | null) ?? null,
      startsOn: (st["entered_at"] as string | null) ?? null,
    })),
    customerTasks: ((tasks ?? []) as Array<Record<string, any>>).map((t) => ({
      title: String(t["title"]),
      stage: stageForInstance(rows, String(t["stage_instance_id"] ?? "")),
      // The customer owns it; naming a person would be inventing one.
      owner: null,
      due: (t["due_at"] as string | null) ?? null,
    })),
    risks: ((risks ?? []) as Array<Record<string, any>>).map((r) => ({
      title: String(r["title"]),
      mitigation: (r["mitigation"] as string | null) ?? null,
    })),
    successCriteria: ((criteria ?? []) as Array<Record<string, any>>).map((c) => ({
      description: String(c["description"]),
      target: (c["target_value"] as string | null) ?? null,
    })),
    requirements: ((requirements ?? []) as Array<Record<string, any>>).map((r) => ({
      title: String(r["title"]),
      inScope: r["scope_status"] !== "out_of_scope",
    })),
    solutions: ((solutions ?? []) as Array<Record<string, any>>).map((s) => String(s["title"])),
  };
}

/** The deal contact, if their recorded role marks them as the technical one. */
function itContactFor(account: Account): { name: string; role: string } | null {
  const name = ((account as any).primary_contact_name as string | null)?.trim();
  const role = ((account as any).primary_contact_role as string | null)?.trim();
  if (!name || !role) return null;
  return /\b(it|technical|system|integration|developer|engineer|cio|cto)\b/i.test(role)
    ? { name, role }
    : null;
}

/** work_items carries the stage as an instance id, not a key. */
function stageForInstance(stages: Array<Record<string, any>>, instanceId: string): string {
  const hit = stages.find((s) => String(s["id"]) === instanceId);
  return hit ? String(hit["name"]) : "—";
}

/** am_owner_id / se_owner_id → names, or null where nobody is assigned. */
async function resolveOwnerNames(
  admin: SupabaseClient,
  account: Account,
): Promise<{ am: string | null; se: string | null }> {
  const ids = [(account as any).am_owner_id, (account as any).se_owner_id].filter(
    Boolean,
  ) as string[];
  if (ids.length === 0) return { am: null, se: null };
  const { data } = await admin.from("team_members").select("id,name").in("id", ids);
  const byId = new Map((data ?? []).map((m: any) => [m.id, m.name as string]));
  return {
    am: byId.get((account as any).am_owner_id) ?? null,
    se: byId.get((account as any).se_owner_id) ?? null,
  };
}

/**
 * The customer's logo as a data URI for the title slide.
 *
 * Downloaded rather than linked: pptxgenjs would have to fetch a signed URL at
 * render time, and a one-hour signature that expires between generating and
 * opening produces a deck with a hole in it. Never throws — a missing logo is
 * a plainer deck, not a failed handoff.
 */
async function customerLogoDataUri(
  admin: SupabaseClient,
  account: Account,
): Promise<string | null> {
  const path = (account as any).logo_path as string | null | undefined;
  if (!path) return null;
  try {
    const { data, error } = await admin.storage.from("customer-branding").download(path);
    if (error || !data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    if (buf.byteLength > 2_000_000) return null;
    const ext = path.split(".").pop()?.toLowerCase();
    const mime =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "webp"
          ? "image/webp"
          : ext === "gif"
            ? "image/gif"
            : "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch (e) {
    console.error("[brief] could not read the customer logo", e);
    return null;
  }
}

// Synchronous within the request (Vercel route sets maxDuration=300).
// The LLM call is the long pole; the deck build takes under a second.
export async function generateBrief(accountId: string, createdBy: string): Promise<Brief> {
  const admin = createAdminClient();

  // Crash recovery: anything stuck "generating" for >10 minutes is dead.
  await admin
    .from("portal_briefs")
    .update({ status: "failed", error: "Generation timed out" })
    .eq("account_id", accountId)
    .eq("status", "generating")
    .lt("updated_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

  const { data: account } = await admin
    .from("portal_accounts")
    .select("*")
    .eq("id", accountId)
    .maybeSingle<Account>();
  if (!account) throw new Error("Account not found");

  const [{ data: reports }, { data: notes }] = await Promise.all([
    admin
      .from("portal_gong_reports")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .returns<GongReport[]>(),
    admin
      .from("portal_onboarding_notes")
      .select("*")
      .eq("account_id", accountId)
      .eq("review_status", "reviewed")
      .order("created_at", { ascending: false })
      .returns<OnboardingNote[]>(),
  ]);
  if (!reports || reports.length === 0) {
    throw new Error("Add at least one Gong report before generating a brief");
  }

  // The two owners are team_members ids on the deal. A deck that prints a uuid
  // where a name belongs is worse than one that prints nothing.
  const ownerNames = await resolveOwnerNames(admin, account);
  // Who takes over, and the plan they run. Null when the deal has not been
  // handed off yet — the deck says so on the slide.
  const handoff = await loadHandoffContext(admin, account, ownerNames);

  const { data: briefRow, error: insertError } = await admin
    .from("portal_briefs")
    .insert({
      account_id: accountId,
      status: "generating",
      created_by: createdBy,
      source_report_ids: reports.map((r: GongReport) => r.id),
    })
    .select("*")
    .single<Brief>();
  if (insertError) throw new Error(insertError.message);

  try {
    let json: BriefJson | null = null;
    let generator: "llm" | "template" = "template";
    let llmError: string | null = null;

    const { generateBriefWithLLM, llmAvailable } = await import("./llm");
    if (llmAvailable()) {
      try {
        json = await generateBriefWithLLM(account, reports, notes ?? []);
        if (json) generator = "llm";
        else llmError = "LLM declined or returned unparseable output; used template";
      } catch (e) {
        llmError = e instanceof Error ? e.message : "LLM call failed";
      }
    }
    if (!json) {
      json = buildTemplateBrief(account, reports);
    }

    // The deck IS the Client Kickoff Deck Template: what fills which of its
    // 124 named fields is decided by buildKickoffData (pure, tested), and
    // ./pptx draws the seventeen slides. Nothing about the layout is decided
    // here.
    const { buildKickoffData } = await import("@/lib/kickoff-fields");
    const deckData = buildKickoffData({
      clientName: account.name,
      preparedAt: new Date().toISOString(),
      brief: json,
      team: handoff.team,
      // The people the brief named at the customer. Roles come through as the
      // brief recorded them; inventing a title for somebody is worse than a
      // blank the AE fills in.
      clientPeople: json.stakeholders.map((p) => ({ name: p.name, role: p.role })),
      stages: handoff.stages,
      customerTasks: handoff.customerTasks,
      risks: handoff.risks,
      successCriteria: handoff.successCriteria,
      requirements: handoff.requirements,
      solutions: handoff.solutions,
      targetLaunchDate: handoff.targetLaunchDate,
      // The deal's champion, only when their recorded role says they are the
      // technical contact. Putting the ops director on the IT slide because
      // they are the only contact we have is how a wrong name gets read out.
      itContact: itContactFor(account),
    });

    const { buildKickoffDeckFile } = await import("./pptx");
    const deck = await buildKickoffDeckFile(deckData, await customerLogoDataUri(admin, account));
    const path = `${accountId}/${briefRow.id}.pptx`;
    const { error: uploadError } = await admin.storage.from("portal-briefs").upload(path, deck, {
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      upsert: true,
    });
    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    const { data: done, error: updateError } = await admin
      .from("portal_briefs")
      .update({
        status: "complete",
        generator,
        structured_json: json,
        pptx_storage_path: path,
        error: llmError,
      })
      .eq("id", briefRow.id)
      .select("*")
      .single<Brief>();
    if (updateError) throw new Error(updateError.message);

    await audit({
      actor_type: "user",
      actor_id: createdBy,
      action: "brief.generate",
      entity_type: "brief",
      entity_id: briefRow.id,
      payload: { account_id: accountId, generator },
    });
    return done;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await admin
      .from("portal_briefs")
      .update({ status: "failed", error: message })
      .eq("id", briefRow.id);
    throw e;
  }
}
