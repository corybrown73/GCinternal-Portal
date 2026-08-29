import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ------------------------------------------------------------------------- */
/* Customer portal server functions.                                         */
/* Every handler authorizes the caller: customer ids are resolved from       */
/* customer_users (profile_id = authenticated user id) — never from input.   */
/* ------------------------------------------------------------------------- */

export const getPortalHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadPortalHome } = await import("./portal.server");
    return loadPortalHome(context.userId);
  });

export const getPortalTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadPortalTickets } = await import("./portal.server");
    return loadPortalTickets(context.userId);
  });

const submitTicketInput = z.object({
  customerId: z.string().uuid(),
  category: z.enum(["technical", "training", "billing", "data", "integration", "other"]),
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(5).max(8000),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
});

export const submitTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => submitTicketInput.parse(data))
  .handler(async ({ data, context }) => {
    const { submitPortalTicket } = await import("./portal.server");
    const ticket = await submitPortalTicket(context.userId, {
      customerId: data.customerId,
      category: data.category,
      subject: data.subject,
      body: data.body,
      priority: data.priority ?? "normal",
    });
    return { id: ticket.id };
  });

const replyTicketInput = z.object({
  ticketId: z.string().uuid(),
  body: z.string().trim().min(1).max(8000),
});

export const replyTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => replyTicketInput.parse(data))
  .handler(async ({ data, context }) => {
    const { replyPortalTicket } = await import("./portal.server");
    const comment = await replyPortalTicket(context.userId, data.ticketId, data.body);
    return { id: comment.id };
  });
