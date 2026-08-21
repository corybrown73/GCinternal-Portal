"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isStage } from "@/lib/stages";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}

// --- accounts ---------------------------------------------------------------

export async function createAccountAction(formData: FormData) {
  const { supabase } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");

  const arrRaw = String(formData.get("arr") ?? "").trim();
  const { data, error } = await supabase
    .from("portal_accounts")
    .insert({
      name,
      domain: String(formData.get("domain") ?? "").trim().toLowerCase() || null,
      salesforce_id: String(formData.get("salesforce_id") ?? "").trim() || null,
      arr: arrRaw ? Number(arrRaw) : null,
      summary: String(formData.get("summary") ?? "").trim() || null,
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(
      error.message.includes("portal_accounts_lower_name_idx")
        ? "An account with that name already exists."
        : error.message
    );
  }
  redirect(`/accounts/${data.id}`);
}

export async function updateAccountAction(accountId: string, formData: FormData) {
  const { supabase } = await requireUser();
  const arrRaw = String(formData.get("arr") ?? "").trim();
  const { error } = await supabase
    .from("portal_accounts")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      domain: String(formData.get("domain") ?? "").trim().toLowerCase() || null,
      salesforce_id: String(formData.get("salesforce_id") ?? "").trim() || null,
      arr: arrRaw ? Number(arrRaw) : null,
      summary: String(formData.get("summary") ?? "").trim() || null,
    })
    .eq("id", accountId);
  if (error) throw new Error(error.message);
  revalidatePath(`/accounts/${accountId}`);
}

// Single funnel: the portal_transition_stage() database function stamps the
// acting user and writes the history row atomically.
export async function transitionAccountAction(
  accountId: string,
  toStage: string,
  note?: string
) {
  if (!isStage(toStage)) throw new Error("Unknown stage");
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("portal_transition_stage", {
    p_account_id: accountId,
    p_to_stage: toStage,
    p_note: note || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/pipeline");
  revalidatePath(`/accounts/${accountId}`);
}

// --- gong reports -----------------------------------------------------------

export async function addGongReportAction(accountId: string, formData: FormData) {
  const { supabase, user } = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content_md") ?? "").trim();
  const reportType = formData.get("report_type") === "account_map" ? "account_map" : "call_notes";
  if (!title || !content) throw new Error("Title and content are required");

  const { error } = await supabase.from("portal_gong_reports").insert({
    account_id: accountId,
    report_type: reportType,
    title,
    content_md: content,
    uploaded_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/accounts/${accountId}`);
}

export async function deleteGongReportAction(accountId: string, reportId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("portal_gong_reports").delete().eq("id", reportId);
  if (error) throw new Error(error.message);
  revalidatePath(`/accounts/${accountId}`);
}

// --- onboarding notes -------------------------------------------------------

export async function addNoteAction(accountId: string, formData: FormData) {
  const { supabase, user } = await requireUser();
  const body = String(formData.get("body_md") ?? "").trim();
  if (!body) throw new Error("Note is empty");
  const { error } = await supabase.from("portal_onboarding_notes").insert({
    account_id: accountId,
    author_id: user.id,
    body_md: body,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/accounts/${accountId}`);
}

export async function setNoteReviewAction(
  accountId: string,
  noteId: string,
  reviewed: boolean
) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("portal_onboarding_notes")
    .update(
      reviewed
        ? { review_status: "reviewed", reviewed_by: user.id, reviewed_at: new Date().toISOString() }
        : { review_status: "needs_review", reviewed_by: null, reviewed_at: null }
    )
    .eq("id", noteId);
  if (error) throw new Error(error.message);
  revalidatePath(`/accounts/${accountId}`);
}
