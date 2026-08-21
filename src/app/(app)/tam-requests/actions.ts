"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTamRequest, notifyRequesterOfDecision } from "@/lib/tam";
import { audit } from "@/lib/audit";
import type { TamRequest } from "@/lib/types";

export async function createTamRequestFromForm(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) throw new Error("Not signed in");

  const accountId = String(formData.get("account_id") ?? "");
  const justification = String(formData.get("justification") ?? "").trim();
  const urgencyRaw = String(formData.get("urgency") ?? "medium");
  const urgency = ["low", "medium", "high"].includes(urgencyRaw)
    ? (urgencyRaw as "low" | "medium" | "high")
    : "medium";
  if (!accountId) throw new Error("Pick an account");
  if (justification.length < 10) throw new Error("Add a sentence of justification");

  await createTamRequest({
    accountId,
    requesterEmail: user.email,
    requesterProfileId: user.id,
    justification,
    urgency,
  });
  redirect(`/accounts/${accountId}?tab=tam`);
}

export async function decideTamAction(
  requestId: string,
  action: "approve" | "decline",
  formData: FormData
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data: profile } = await supabase
    .from("portal_profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") throw new Error("Admins only");

  const note = String(formData.get("note") ?? "").trim();
  const admin = createAdminClient();
  // Rotating token_jti invalidates any outstanding email links for this request.
  const { data: request, error } = await admin
    .from("portal_tam_requests")
    .update({
      status: action === "approve" ? "approved" : "declined",
      decided_at: new Date().toISOString(),
      decided_by: user.id,
      decided_via: "portal",
      decision_note: note || null,
      token_jti: randomUUID(),
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle<TamRequest>();
  if (error) throw new Error(error.message);
  if (!request) throw new Error("Request was already decided");

  await audit({
    actor_type: "user",
    actor_id: user.id,
    action: `tam.${action}`,
    entity_type: "tam_request",
    entity_id: requestId,
    payload: { via: "portal" },
  });

  const { data: account } = await admin
    .from("portal_accounts")
    .select("name")
    .eq("id", request.account_id)
    .single();
  await notifyRequesterOfDecision(request, account?.name ?? "your account");

  revalidatePath("/tam-requests");
}
