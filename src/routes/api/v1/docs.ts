import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/v1/docs — a reference renderer for /api/v1/openapi.json.
 *
 * Self-contained HTML that loads Scalar from a CDN and points it at the spec
 * route, so the documentation can never disagree with the validators: there is
 * nothing here to keep in step.
 */
const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GoCanvas Implementation Hub API</title>
  </head>
  <body>
    <script id="api-reference" data-url="/api/v1/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;

export const Route = createFileRoute("/api/v1/docs")({
  server: {
    handlers: {
      GET: async () =>
        new Response(page, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        }),
    },
  },
});
