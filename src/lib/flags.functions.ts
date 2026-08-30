import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";
import { catalogueKeys } from "./feature-flags";

/**
 * Turning a feature on is an ADMIN GRANT, not a database edit.
 *
 * Until this existed the only way to flip a flag was raw SQL against
 * `portal_app_config`, which meant it needed database credentials, left no
 * record of who did it, and was documented in one place by a screen that told
 * the user to go and edit the row themselves.
 *
 * Gated on `requireSuperAdmin` — the same gate as changing somebody's role, and
 * for the same reason: both decide what the whole deployment can do. A manager
 * runs their book; they do not turn features on for everyone.
 *
 * Every flip is audited. "Who turned the customer portal on, and when" is a
 * question that will be asked, and `portal_audit_log` is where it gets
 * answered.
 */

/** Only keys the catalogue describes. An undescribed flag has no screen and no
 *  business being set from one — and this keeps a typo from writing a key that
 *  nothing ever reads. */
const flagKey = z.enum(catalogueKeys() as [string, ...string[]]);

export const getFlags = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async ({ context }) => {
    const { requireSuperAdmin } = await import("./presale.server");
    await requireSuperAdmin(context.userId);
    const { getV2Flags } = await import("./app-config.server");
    return getV2Flags();
  });

export const setFlag = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ flag: flagKey, value: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const { requireSuperAdmin } = await import("./presale.server");
    const actor = await requireSuperAdmin(context.userId);

    const { setV2Flag } = await import("./app-config.server");
    const { audit } = await import("./server/audit");

    const flags = await setV2Flag(data.flag as never, data.value);

    await audit({
      actor_type: "user",
      actor_id: actor.id,
      action: data.value ? "flag.enabled" : "flag.disabled",
      entity_type: "feature_flag",
      entity_id: data.flag,
      payload: { flag: data.flag, value: data.value },
    });

    return flags;
  });
