import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";
import { HANDOFF_ITEM_KEYS } from "./handoff-completeness";

/**
 * Handoff gate server functions.
 *
 * Everything here is internal-only via requireInternalAuth — a handoff packet
 * is an internal accountability artifact and is never customer-visible.
 * Deliberately NOT manage-gated: the whole point is that the implementation
 * owner, not a manager, accepts or returns the work they are taking on.
 */

const implementationId = z.string().uuid();
const note = z.string().trim().max(2000).nullable().optional();

export const getHandoff = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ implementationId }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data }) => {
    const { loadHandoff } = await import("./handoff.server");
    return loadHandoff(data.implementationId);
  });

export const saveHandoffPacket = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        implementationId,
        integration_dependencies: z.string().trim().max(4000).nullable().optional(),
        data_migration_needs: z.string().trim().max(4000).nullable().optional(),
        roadmap_promises: z.string().trim().max(4000).nullable().optional(),
        discovery_call_links: z
          .array(z.object({ label: z.string().trim().max(200), url: z.string().trim().url() }))
          .max(25)
          .optional(),
      })
      .parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data }) => {
    const { savePacketFields } = await import("./handoff.server");
    const { implementationId: id, ...patch } = data;
    return savePacketFields(id, patch);
  });

export const submitHandoffPacket = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ implementationId }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { submitHandoff } = await import("./handoff.server");
    return submitHandoff(data.implementationId, context.profile.id);
  });

export const acceptHandoffPacket = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ implementationId, note }).parse(data))
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { acceptHandoff } = await import("./handoff.server");
    return acceptHandoff(data.implementationId, context.profile.id, data.note ?? null);
  });

export const returnHandoffPacket = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        implementationId,
        // A return must name its gaps: a free-text-only return is how this
        // degrades into "it isn't good enough".
        // Validated against the real key set, not `string`: these keys are
        // stored and later rendered back as the accountability record of what
        // the handoff was returned for, so a typo or a stale key would show up
        // in the history as an unexplained bare string.
        missingKeys: z
          .array(z.enum(HANDOFF_ITEM_KEYS))
          .min(1, "Name at least one gap you are returning it for."),
        note,
      })
      .parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    const { returnHandoff } = await import("./handoff.server");
    return returnHandoff(
      data.implementationId,
      context.profile.id,
      data.missingKeys,
      data.note ?? null,
    );
  });
