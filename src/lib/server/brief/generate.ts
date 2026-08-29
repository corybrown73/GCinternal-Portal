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

    const { buildBriefDeck } = await import("./pptx");
    const deck = await buildBriefDeck(json);
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
