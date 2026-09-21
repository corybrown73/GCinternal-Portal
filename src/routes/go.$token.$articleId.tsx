import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /go/{token}/{articleId}
 *
 * A help-article link on the customer's page. The token is the page's own,
 * so a bad one gets the same neutral 404 as a bad page link; a good one
 * records the open against the deal and sends the reader on to the help
 * centre. The article must be one of this deal's picks: this is never an
 * open redirect.
 */
async function handle(params: unknown): Promise<Response> {
  const { token, articleId } = params as { token: string; articleId: string };
  const { followHelpLink } = await import("@/lib/welcome.server");
  const url = await followHelpLink(token, articleId);
  if (!url) return new Response("Not found", { status: 404 });
  return new Response(null, {
    status: 302,
    headers: {
      location: url,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export const Route = createFileRoute("/go/$token/$articleId")({
  server: {
    handlers: {
      GET: ({ params }: { params: unknown }) => handle(params),
    },
  },
});
