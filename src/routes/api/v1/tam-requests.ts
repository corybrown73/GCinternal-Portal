import { createFileRoute } from "@tanstack/react-router";

// POST /api/v1/tam-requests — create a TAM request and trigger approval emails.
// Ported from the old Next.js app/api/v1/tam-requests/route.ts.
export const Route = createFileRoute("/api/v1/tam-requests")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { requireApiKey, apiError } = await import("@/lib/server/api-auth");
        const { resolveAccountId } = await import("@/lib/server/accounts");
        const { createTamRequest } = await import("@/lib/server/tam");
        const { tamRequestCreateSchema } = await import("@/lib/server/schemas");

        const auth = await requireApiKey(request, "tam:write");
        if (auth instanceof Response) return auth;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return apiError(422, "invalid_json", "Body must be JSON");
        }
        const parsed = tamRequestCreateSchema.safeParse(body);
        if (!parsed.success) {
          return apiError(
            422,
            "validation_failed",
            parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
          );
        }

        const accountId = await resolveAccountId(parsed.data.account_id);
        if (!accountId) return apiError(404, "not_found", "No account matches account_id");

        try {
          const request_ = await createTamRequest({
            accountId,
            requesterEmail: parsed.data.requester_email,
            justification: parsed.data.justification,
            urgency: parsed.data.urgency,
            actorApiKeyId: auth.apiKeyId,
          });
          return Response.json(
            { tam_request_id: request_.id, status: request_.status },
            { status: 201 },
          );
        } catch (e) {
          return apiError(500, "create_failed", e instanceof Error ? e.message : "Unknown error");
        }
      },
    },
  },
});
