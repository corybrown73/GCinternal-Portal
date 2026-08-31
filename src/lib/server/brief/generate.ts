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

    // The deck is the kickoff and handoff deck, in the 2026 GoCanvas template's
    // language. What it says is decided by buildKickoffDeck (pure, tested);
    // this only gathers the three things the brief itself does not carry — what
    // was sold, who the customer is on the deal record, and which calls it all
    // came from — plus the customer's logo for the title slide.
    const { buildKickoffDeck } = await import("@/lib/kickoff-deck");
    const plan = buildKickoffDeck({
      brief: json,
      account: {
        name: account.name,
        domain: (account as any).domain ?? null,
        arr: account.arr ?? null,
        products: (account as any).products ?? null,
        primaryContactName: (account as any).primary_contact_name ?? null,
        primaryContactEmail: (account as any).primary_contact_email ?? null,
        primaryContactRole: (account as any).primary_contact_role ?? null,
        salesOwner: ownerNames.am,
        seOwner: ownerNames.se,
      },
      sow: {
        reference: (account as any).sow_reference ?? null,
        signedDate: (account as any).sow_signed_date ?? null,
        value: (account as any).sow_value ?? null,
        documentName: (account as any).sow_document_name ?? null,
        documentUrl: (account as any).sow_document_url ?? null,
      },
      sources: reports.map((r: GongReport) => ({
        title: r.title,
        reportType: r.report_type,
        createdAt: r.created_at,
      })),
      preparedAt: new Date().toISOString(),
    });

    const { buildKickoffDeckFile } = await import("./pptx");
    const deck = await buildKickoffDeckFile(plan, await customerLogoDataUri(admin, account));
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
