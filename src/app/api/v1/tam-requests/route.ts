import { requireApiKey, apiError } from "@/lib/api-auth";
import { resolveAccountId } from "@/lib/accounts";
import { createTamRequest } from "@/lib/tam";
import { tamRequestCreateSchema } from "@/lib/schemas";

export const runtime = "nodejs";

// POST /api/v1/tam-requests — create a TAM request and trigger approval emails.
export async function POST(req: Request) {
  const auth = await requireApiKey(req, "tam:write");
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(422, "invalid_json", "Body must be JSON");
  }
  const parsed = tamRequestCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      422,
      "validation_failed",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    );
  }

  const accountId = await resolveAccountId(parsed.data.account_id);
  if (!accountId) return apiError(404, "not_found", "No account matches account_id");

  try {
    const request = await createTamRequest({
      accountId,
      requesterEmail: parsed.data.requester_email,
      justification: parsed.data.justification,
      urgency: parsed.data.urgency,
      actorApiKeyId: auth.apiKeyId,
    });
    return Response.json(
      { tam_request_id: request.id, status: request.status },
      { status: 201 }
    );
  } catch (e) {
    return apiError(500, "create_failed", e instanceof Error ? e.message : "Unknown error");
  }
}
