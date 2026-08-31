import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/completion-record/{token}.
 *
 * The PDF of a completion record. On a server route rather than a page route
 * for the same reason the plan snapshot's PDF is: a page route in this router
 * cannot answer with application/pdf.
 *
 * No login and no expiry. The URL is written into a Salesforce note and opened
 * by whoever is reading that account years later; a record of finished work
 * that stops resolving is worse than not filing it. The token is 32 random
 * bytes, only its hash is stored, and a token that does not resolve gets the
 * same neutral 404 as one that never existed.
 *
 * It renders the FROZEN document. No second query, no second serializer.
 */
async function handle(params: unknown): Promise<Response> {
  const { token } = params as { token: string };
  const { completionRecordForToken } = await import("@/lib/completion.server");
  const record = await completionRecordForToken(token);
  if (!record) return new Response("Not found", { status: 404 });

  try {
    const { renderCompletionPdf } = await import("@/lib/server/completion-pdf");
    const bytes = await renderCompletionPdf(record.content);
    const name = `${record.content.customer_name} — ${record.title} — completion record${
      record.version > 1 ? ` v${record.version}` : ""
    }.pdf`.replace(/[\\/:*?"<>|]/g, "-");
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
    console.error("[completion pdf] render failed", e);
    return new Response("Could not render the PDF", { status: 500 });
  }
}

export const Route = createFileRoute("/api/completion-record/$token")({
  server: {
    handlers: {
      GET: ({ params }: { params: unknown }) => handle(params),
    },
  },
});
