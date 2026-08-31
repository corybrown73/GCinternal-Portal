import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/plan-pdf/{token}.
 *
 * The customer's plan as a PDF, for forwarding and printing. A server route
 * rather than a page route because a page route in this router cannot answer
 * with application/pdf — the same reason /api/plan-snapshot/{token} is one.
 *
 * AUTHORIZATION IS THE PAGE'S. It resolves the share token through exactly the
 * call the plan page uses, so a revoked link, an expired one, and a
 * passcode-protected one all fail here too: `openPlanWithToken` without a
 * passcode returns `passcode`, not `plan`, and this answers 404. Guessing the
 * URL is not a way around the door.
 *
 * NOT frozen, unlike a completion record. It renders the plan as it stands and
 * says so on the page itself, with the link to the live version.
 */
async function handle(params: unknown): Promise<Response> {
  const { token } = params as { token: string };
  const { openPlanWithToken } = await import("@/lib/external-plan.server");
  const result = await openPlanWithToken(token);
  // Every non-plan state gets the same neutral 404: a revoked link and one that
  // never existed must be indistinguishable from outside.
  if (result.state !== "plan") return new Response("Not found", { status: 404 });

  try {
    const { appUrl } = await import("@/lib/app-url");
    const { renderPlanPdf } = await import("@/lib/server/plan-pdf");
    const bytes = await renderPlanPdf(result.plan, `${appUrl()}/plan/${token}`);
    const name = `${result.plan.customer_name} — project plan.pdf`.replace(/[\\/:*?"<>|]/g, "-");
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${name}"`,
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  } catch (e) {
    console.error("[plan pdf] render failed", e);
    return new Response("Could not render the PDF", { status: 500 });
  }
}

export const Route = createFileRoute("/api/plan-pdf/$token")({
  server: {
    handlers: {
      GET: ({ params }: { params: unknown }) => handle(params),
    },
  },
});
