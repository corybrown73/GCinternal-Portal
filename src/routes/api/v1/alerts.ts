import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * POST /api/v1/alerts — report that something is out of spec from an external
 * system. Inserts an alerts row and emails every manager + super admin when
 * severity is not 'info'.
 * Auth: API key with the 'alerts:write' scope.
 */

const createAlertBody = z.object({
  kind: z.string().min(1).max(60).optional(),
  severity: z.enum(["info", "warning", "critical"]).optional(),
  title: z.string().min(1).max(300),
  detail: z.string().max(20_000).nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  implementation_id: z.string().uuid().nullable().optional(),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const Route = createFileRoute("/api/v1/alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requireApiKey, apiError } = await import("@/lib/server/api-auth");
        const auth = await requireApiKey(request, "alerts:write");
        if (auth instanceof Response) return auth;

        let parsed: z.infer<typeof createAlertBody>;
        try {
          parsed = createAlertBody.parse(await request.json());
        } catch (e) {
          return apiError(
            422,
            "invalid_body",
            e instanceof z.ZodError
              ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
              : "Body must be valid JSON",
          );
        }

        try {
          const { createAlert } = await import("@/lib/tickets.server");
          const alert = await createAlert({
            kind: parsed.kind ?? "external",
            severity: parsed.severity,
            title: parsed.title,
            detail: parsed.detail ?? null,
            customerId: parsed.customer_id ?? null,
            implementationId: parsed.implementation_id ?? null,
            source: "api",
            payload: parsed.payload ?? null,
            notify: true,
            actor: { type: "api_key", id: auth.apiKeyId },
          });
          return Response.json({ alert_id: alert.id }, { status: 201 });
        } catch (e) {
          console.error("POST /api/v1/alerts failed", e);
          return apiError(500, "alert_create_failed", "Could not create the alert");
        }
      },
    },
  },
});
