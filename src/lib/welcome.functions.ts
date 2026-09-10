import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";
import { HOMEWORK_KEYS } from "@/lib/welcome";

/* ---------- internal ---------- */

export const getWelcome = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ dealId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { loadWelcome } = await import("./welcome.server");
    return loadWelcome(data.dealId);
  });

export const issueWelcomeLinkFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ dealId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { issueWelcomeLink } = await import("./welcome.server");
    return issueWelcomeLink(context.profile.id, data.dealId);
  });

export const revokeWelcomeLinkFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ dealId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { revokeWelcomeLink } = await import("./welcome.server");
    await revokeWelcomeLink(context.profile.id, data.dealId);
    return { ok: true };
  });

/* ---------- public: the customer's link ---------- */

export const openWelcome = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ token: z.string().trim().min(8).max(200) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { openWelcome: open } = await import("./welcome.server");
    return open(data.token);
  });

export const tickWelcomeHomework = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        token: z.string().trim().min(8).max(200),
        key: z.enum(HOMEWORK_KEYS),
        done: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { tickWelcomeHomework: tick } = await import("./welcome.server");
    return { homeworkDone: await tick(data.token, data.key, data.done) };
  });
