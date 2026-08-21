import { randomUUID } from "crypto";
import { verifyDecisionToken } from "@/lib/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyRequesterOfDecision } from "@/lib/tam";
import { audit } from "@/lib/audit";
import type { TamRequest } from "@/lib/types";

export const runtime = "nodejs";

function decidedRedirect(req: Request, status: string): Response {
  const url = new URL("/tam/decided", new URL(req.url).origin);
  url.searchParams.set("status", status);
  return Response.redirect(url, 303);
}

// GET renders an auto-submitting interstitial so the mutation happens on POST —
// mail-client link prefetchers GET links and must not be able to decide requests.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const verified = await verifyDecisionToken(token);
  if (!verified) return decidedRedirect(req, "invalid");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Confirming…</title></head>
<body style="font-family:sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center">
  <form method="POST" action="/api/tam/decision" id="f">
    <input type="hidden" name="token" value="${token.replaceAll('"', "&quot;")}">
    <p>Recording your decision…</p>
    <noscript><button type="submit">Confirm ${verified.action}</button></noscript>
  </form>
  <script>document.getElementById("f").submit();</script>
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  const verified = await verifyDecisionToken(token);
  if (!verified) return decidedRedirect(req, "invalid");

  const admin = createAdminClient();
  // status='pending' + jti match make the link single-use: deciding (from email
  // or portal) rotates token_jti, which kills the sibling link too.
  const { data: request } = await admin
    .from("portal_tam_requests")
    .update({
      status: verified.action === "approve" ? "approved" : "declined",
      decided_at: new Date().toISOString(),
      decided_via: "email",
      token_jti: randomUUID(),
    })
    .eq("id", verified.requestId)
    .eq("status", "pending")
    .eq("token_jti", verified.jti)
    .select("*")
    .maybeSingle<TamRequest>();

  if (!request) return decidedRedirect(req, "expired");

  await audit({
    actor_type: "email_token",
    actor_id: request.id,
    action: `tam.${verified.action}`,
    entity_type: "tam_request",
    entity_id: request.id,
    payload: { via: "email" },
  });

  const { data: account } = await admin
    .from("portal_accounts")
    .select("name")
    .eq("id", request.account_id)
    .single();
  await notifyRequesterOfDecision(request, account?.name ?? "your account");

  return decidedRedirect(req, request.status);
}
