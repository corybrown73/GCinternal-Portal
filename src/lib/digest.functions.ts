import { createServerFn } from "@tanstack/react-start";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

/** "Email me my Monday digest now": the same email, to the caller, today. */
export const sendMyDigestFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .handler(async ({ context }) => {
    const { sendDigestTo } = await import("./digest.server");
    const p = context.profile;
    return sendDigestTo(
      { id: p.id, email: p.email, full_name: p.full_name ?? null, role: p.role },
      { force: true },
    );
  });
