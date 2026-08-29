import { createFileRoute } from "@tanstack/react-router";

// POST /api/v1/accounts/{id}/transition — the open stage-transition endpoint.
// Ported from the old Next.js app/api/v1/accounts/[id]/transition/route.ts.
export const Route = createFileRoute("/api/v1/accounts/$id/transition")({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: unknown }) => {
        const { requireApiKey, apiError } = await import("@/lib/server/api-auth");
        const { resolveAccountId, transitionStage } = await import("@/lib/server/accounts");
        const { transitionSchema } = await import("@/lib/server/schemas");

        const auth = await requireApiKey(request, "transitions:write");
        if (auth instanceof Response) return auth;

        const { id } = params as { id: string };
        const accountId = await resolveAccountId(id);
        if (!accountId) return apiError(404, "not_found", "No account matches that id");

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return apiError(422, "invalid_json", "Body must be JSON");
        }
        const parsed = transitionSchema.safeParse(body);
        if (!parsed.success) {
          return apiError(
            422,
            "validation_failed",
            parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
          );
        }

        try {
          const { changed } = await transitionStage(
            accountId,
            parsed.data.to_stage,
            { source: "api", actorApiKeyId: auth.apiKeyId },
            parsed.data.note,
            parsed.data.occurred_at,
          );
          return Response.json({ changed, account_id: accountId, stage: parsed.data.to_stage });
        } catch (e) {
          return apiError(
            500,
            "transition_failed",
            e instanceof Error ? e.message : "Unknown error",
          );
        }
      },
    },
  },
});
