/**
 * The sequence cron body, extracted so the canonical route
 * (/api/cron/sequences) and the deprecated /api/cron/journeys alias share one
 * implementation for the release that both exist.
 *
 * Advances delay-based sequence steps and auto-enrols contacts for
 * 'customer_created' sequences. Auth: Authorization: Bearer ${CRON_SECRET}.
 */
export async function runSequenceCron(request: Request): Promise<Response> {
  const secret = process.env["CRON_SECRET"];
  if (!secret) return new Response("Server configuration error", { status: 500 });

  const match = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "");
  const token = match?.[1];
  if (!token) return new Response("Unauthorized", { status: 401 });

  const { createHash, timingSafeEqual } = await import("node:crypto");
  const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();
  if (!timingSafeEqual(digest(token), digest(secret))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { advanceDelayedSteps, autoEnrollNewCustomers } = await import("./sequences.server");

  const delayed = await advanceDelayedSteps();
  const enrolled = await autoEnrollNewCustomers();

  return Response.json({
    ok: true,
    advanced: delayed.advanced,
    completed: delayed.completed,
    auto_enrolled: enrolled.enrolled,
  });
}
