import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

const MANAGE_ROLES = ["admin", "super_admin", "manager"];

export const getKickoffCadence = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadKickoffCadence } = await import("./kickoff-cadence.server");
    return loadKickoffCadence();
  });

export const setKickoffCadence = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().max(120),
        url: z
          .string()
          .trim()
          .max(500)
          .refine((s) => s === "" || /^https:\/\//.test(s), "The link has to start with https://")
          .nullable(),
      })
      .parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    if (!MANAGE_ROLES.includes(context.profile.role)) {
      throw new Error("Forbidden: the cadence is named by an admin or manager.");
    }
    const { saveKickoffCadence } = await import("./kickoff-cadence.server");
    return saveKickoffCadence({ name: data.name, url: data.url || null });
  });
