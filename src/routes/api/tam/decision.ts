import { createFileRoute } from "@tanstack/react-router";

// Email one-click TAM decision endpoint, ported from the old Next.js
// app/api/tam/decision/route.ts. GET renders an auto-submitting interstitial so
// the mutation happens on POST — mail-client link prefetchers GET links and must
// not be able to decide requests. The POST responds with a small self-contained
// result page instead of the old redirect (this app has no /tam/decided route).

function resultPage(status: string): Response {
  const copy: Record<string, { title: string; body: string }> = {
    approved: {
      title: "TAM request approved",
      body: "The requester has been notified. You can close this tab.",
    },
    declined: {
      title: "TAM request declined",
      body: "The requester has been notified. You can close this tab.",
    },
    expired: {
      title: "This link has already been used",
      body: "The request was already decided, or the link expired. Check the portal for its current status.",
    },
    invalid: {
      title: "This link is not valid",
      body: "The decision link could not be verified. Ask for a fresh request email or decide in the portal.",
    },
  };
  const c = copy[status] ?? copy.invalid;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${c.title}</title></head>
<body style="font-family:sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#fafaf9">
  <div style="max-width:26rem;text-align:center">
    <h1 style="font-size:18px;margin-bottom:8px">${c.title}</h1>
    <p style="font-size:14px;color:#555">${c.body}</p>
  </div>
</body></html>`;
  return new Response(html, {
    status: status === "invalid" || status === "expired" ? 400 : 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/tam/decision")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const { verifyDecisionToken } = await import("@/lib/server/tokens");

        const token = new URL(request.url).searchParams.get("token") ?? "";
        const verified = await verifyDecisionToken(token);
        if (!verified) return resultPage("invalid");

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
      },

      POST: async ({ request }: { request: Request }) => {
        const { randomUUID } = await import("crypto");
        const { verifyDecisionToken } = await import("@/lib/server/tokens");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { notifyRequesterOfDecision } = await import("@/lib/server/tam");
        const { audit } = await import("@/lib/server/audit");

        const form = await request.formData();
        const token = String(form.get("token") ?? "");
        const verified = await verifyDecisionToken(token);
        if (!verified) return resultPage("invalid");

        const admin = supabaseAdmin as any;
        // status='pending' + jti match make the link single-use: deciding (from
        // email or portal) rotates token_jti, which kills the sibling link too.
        const { data: tamRequest } = await admin
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
          .maybeSingle();

        if (!tamRequest) return resultPage("expired");

        await audit({
          actor_type: "email_token",
          actor_id: tamRequest.id,
          action: `tam.${verified.action}`,
          entity_type: "tam_request",
          entity_id: tamRequest.id,
          payload: { via: "email" },
        });

        const { data: account } = await admin
          .from("portal_accounts")
          .select("name")
          .eq("id", tamRequest.account_id)
          .single();
        await notifyRequesterOfDecision(tamRequest, account?.name ?? "your account");

        return resultPage(tamRequest.status);
      },
    },
  },
});
