import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

export const getPastImplementationsFn = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        customerId: z.string().uuid(),
        activeImplementationId: z.string().uuid().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { loadPastImplementations } = await import("./past-implementations.server");
    return loadPastImplementations(data.customerId, data.activeImplementationId);
  });
