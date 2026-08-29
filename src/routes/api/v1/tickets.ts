import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * POST /api/v1/tickets — create a ticket from an external system.
 * Auth: API key with the 'tickets:write' scope.
 */

const createTicketBody = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  implementation_id: z.string().uuid().nullable().optional(),
  category: z.enum(["technical", "training", "billing", "data", "integration", "other"]),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20_000),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  submitter_email: z.string().email(),
});

export const Route = createFileRoute("/api/v1/tickets")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requireApiKey, apiError } = await import("@/lib/server/api-auth");
        const auth = await requireApiKey(request, "tickets:write");
        if (auth instanceof Response) return auth;

        let parsed: z.infer<typeof createTicketBody>;
        try {
          parsed = createTicketBody.parse(await request.json());
        } catch (e) {
          return apiError(
            422,
            "invalid_body",
            e instanceof z.ZodError
              ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
              : "Body must be valid JSON",
          );
        }

        // Optional customer resolution: an unknown id is a caller error, not a 500.
        if (parsed.customer_id) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: customer } = await (supabaseAdmin as any)
            .from("customers")
            .select("id")
            .eq("id", parsed.customer_id)
            .maybeSingle();
          if (!customer) return apiError(422, "unknown_customer", "No customer with that id");
        }

        try {
          const { createTicket } = await import("@/lib/tickets.server");
          const ticket = await createTicket({
            customerId: parsed.customer_id ?? null,
            implementationId: parsed.implementation_id ?? null,
            category: parsed.category,
            subject: parsed.subject,
            body: parsed.body,
            priority: parsed.priority,
            submittedBy: null,
            submitterEmail: parsed.submitter_email,
            actor: { type: "api_key", id: auth.apiKeyId },
          });
          return Response.json(
            { ticket_id: ticket.id, status: ticket.status, sla_due_at: ticket.sla_due_at },
            { status: 201 },
          );
        } catch (e) {
          console.error("POST /api/v1/tickets failed", e);
          return apiError(500, "ticket_create_failed", "Could not create the ticket");
        }
      },
    },
  },
});
