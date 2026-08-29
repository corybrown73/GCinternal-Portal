import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/plan-snapshot/{token}.
 *
 * The PDF of a shared snapshot. It lives on a server route rather than at
 * /plan/s/$token?pdf=1 (as the design sketched) because a page route in this
 * router cannot also answer with application/pdf; the customer reaches it from
 * a link on the snapshot page, so the URL they hold is unchanged.
 *
 * Authorization is the same as the page: the share token is hashed and looked
 * up, and an expired or revoked share gets the same neutral 404 as one that
 * never existed. It renders the FROZEN content — no second query, no second
 * serializer.
 *
 * Stated limitation: once downloaded, a PDF cannot be revoked.
 */
async function handle(params: unknown): Promise<Response> {
  const { token } = params as { token: string };
  const { snapshotForToken } = await import("@/lib/snapshots.server");
  const result = await snapshotForToken(token);
  if (result.state !== "snapshot") {
    return new Response("Not found", { status: 404 });
  }
  try {
    const { renderSnapshotPdf } = await import("@/lib/server/snapshot-pdf");
    const bytes = await renderSnapshotPdf(result.content);
    const name = `plan-update-${result.content.week_start}.pdf`;
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  } catch (e) {
    console.error("[snapshot pdf] render failed", e);
    return new Response("Could not render the PDF", { status: 500 });
  }
}

export const Route = createFileRoute("/api/plan-snapshot/$token")({
  server: {
    handlers: {
      GET: ({ params }: { params: unknown }) => handle(params),
    },
  },
});
