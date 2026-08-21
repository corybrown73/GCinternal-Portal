import "server-only";
import { createAdminClient } from "./supabase/admin";
import { signDecisionToken } from "./tokens";
import { sendEmail } from "./email";
import { audit } from "./audit";
import type { Account, TamRequest } from "./types";

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

export async function createTamRequest(input: {
  accountId: string;
  requesterEmail: string;
  requesterProfileId?: string | null;
  justification: string;
  urgency: "low" | "medium" | "high";
  actorApiKeyId?: string | null;
}): Promise<TamRequest> {
  const admin = createAdminClient();

  const { data: account } = await admin
    .from("portal_accounts")
    .select("*")
    .eq("id", input.accountId)
    .maybeSingle<Account>();
  if (!account) throw new Error("Account not found");

  const { data: request, error } = await admin
    .from("portal_tam_requests")
    .insert({
      account_id: input.accountId,
      requested_by: input.requesterProfileId ?? null,
      requester_email: input.requesterEmail.toLowerCase(),
      justification: input.justification,
      urgency: input.urgency,
    })
    .select("*")
    .single<TamRequest>();
  if (error) throw new Error(error.message);

  await audit({
    actor_type: input.actorApiKeyId ? "api_key" : "user",
    actor_id: input.actorApiKeyId ?? input.requesterProfileId ?? null,
    action: "tam.request",
    entity_type: "tam_request",
    entity_id: request.id,
    payload: { account_id: input.accountId, urgency: input.urgency },
  });

  await sendApprovalEmails(request, account);
  return request;
}

// Approvers = every admin profile. Each gets one-click approve/decline links;
// the signed token carries the action, the request id, and the single-use jti.
async function sendApprovalEmails(request: TamRequest, account: Account) {
  const admin = createAdminClient();
  const { data: admins } = await admin
    .from("portal_profiles")
    .select("email")
    .eq("role", "admin")
    .returns<{ email: string }[]>();
  if (!admins || admins.length === 0) {
    console.warn("TAM request created but no admin profiles exist to notify");
    return;
  }

  const approveToken = await signDecisionToken(request.id, "approve", request.token_jti);
  const declineToken = await signDecisionToken(request.id, "decline", request.token_jti);
  const approveUrl = `${appUrl()}/api/tam/decision?token=${approveToken}`;
  const declineUrl = `${appUrl()}/api/tam/decision?token=${declineToken}`;
  const portalUrl = `${appUrl()}/accounts/${account.id}?tab=tam`;

  const html = `
    <div style="font-family:sans-serif;max-width:540px">
      <h2 style="color:#237A4B">TAM request: ${escapeHtml(account.name)}</h2>
      <p><b>${escapeHtml(request.requester_email)}</b> is requesting a Technical Account Manager.</p>
      <table style="font-size:14px;border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Account</td><td>${escapeHtml(account.name)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Urgency</td><td>${request.urgency}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Justification</td><td>${escapeHtml(request.justification)}</td></tr>
      </table>
      <div style="margin:24px 0">
        <a href="${approveUrl}" style="background:#237A4B;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600;margin-right:12px">Approve</a>
        <a href="${declineUrl}" style="background:#fff;color:#b91c1c;border:1px solid #b91c1c;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600">Decline</a>
      </div>
      <p style="font-size:12px;color:#888">Links are single-use and expire in 7 days. You can also decide in the <a href="${portalUrl}">portal</a>.</p>
    </div>`;

  for (const a of admins) {
    await sendEmail({
      to: a.email,
      subject: `TAM request — ${account.name} (${request.urgency})`,
      html,
    });
  }
}

export async function notifyRequesterOfDecision(request: TamRequest, accountName: string) {
  const approved = request.status === "approved";
  await sendEmail({
    to: request.requester_email,
    subject: `TAM request ${approved ? "approved" : "declined"} — ${accountName}`,
    html: `
      <div style="font-family:sans-serif;max-width:540px">
        <h2 style="color:${approved ? "#237A4B" : "#b91c1c"}">Your TAM request was ${approved ? "approved" : "declined"}</h2>
        <p>Account: <b>${escapeHtml(accountName)}</b></p>
        ${request.decision_note ? `<p>Note: ${escapeHtml(request.decision_note)}</p>` : ""}
        <p style="font-size:12px;color:#888">GoCanvas Handoff Portal</p>
      </div>`,
  });
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
