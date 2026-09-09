import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

import { hideableKeys } from "./nav-visibility";

/**
 * Reading is open to any internal user, because every page draws the sidebar.
 * Writing is super-admin only — the same gate as feature flags, for the same
 * reason: it changes what the whole deployment sees. Every change is audited.
 */

export const getNavVisibility = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadNavVisibility } = await import("./nav-visibility.server");
    return loadNavVisibility();
  });

export const setNavVisibility = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        // Only keys the catalogue says can be hidden. Home and Admin are not
        // in this list, so a request naming them is refused, not ignored.
        hidden: z.array(z.enum(hideableKeys() as [string, ...string[]])),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { requireSuperAdmin } = await import("./presale.server");
    const actor = await requireSuperAdmin(context.userId);

    const { loadNavVisibility, saveNavVisibility } = await import("./nav-visibility.server");
    const { audit } = await import("./server/audit");

    const before = await loadNavVisibility();
    const after = await saveNavVisibility(data.hidden);

    await audit({
      actor_type: "user",
      actor_id: actor.id,
      action: "navigation.changed",
      entity_type: "app_config",
      entity_key: "nav_visibility",
      payload: {
        hidden_before: before.hidden,
        hidden_after: after.hidden,
      },
    });

    return after;
  });
