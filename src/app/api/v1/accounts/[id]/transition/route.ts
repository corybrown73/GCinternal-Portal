import { requireApiKey, apiError } from "@/lib/api-auth";
import { resolveAccountId, transitionStage } from "@/lib/accounts";
import { transitionSchema } from "@/lib/schemas";

export const runtime = "nodejs";

// POST /api/v1/accounts/{id}/transition — the open stage-transition endpoint.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiKey(req, "transitions:write");
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const accountId = await resolveAccountId(id);
  if (!accountId) return apiError(404, "not_found", "No account matches that id");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(422, "invalid_json", "Body must be JSON");
  }
  const parsed = transitionSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      422,
      "validation_failed",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    );
  }

  try {
    const { changed } = await transitionStage(
      accountId,
      parsed.data.to_stage,
      { source: "api", actorApiKeyId: auth.apiKeyId },
      parsed.data.note,
      parsed.data.occurred_at
    );
    return Response.json({ changed, account_id: accountId, stage: parsed.data.to_stage });
  } catch (e) {
    return apiError(500, "transition_failed", e instanceof Error ? e.message : "Unknown error");
  }
}
