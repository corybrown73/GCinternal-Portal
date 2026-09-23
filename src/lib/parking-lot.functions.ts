import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  requireDealEditor,
  requireInternalAuth,
} from "@/integrations/supabase/internal-middleware";

const item = z.object({
  request: z.string().trim().min(1).max(300),
  why: z.string().trim().max(500).default(""),
  needed_for_launch: z.boolean().default(false),
  owner: z.enum(["gocanvas", "customer", "both"]).default("gocanvas"),
  target: z.string().trim().max(80).default(""),
});

export const getParkingLot = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ dealId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { listParkingLot } = await import("./parking-lot.server");
    return listParkingLot(data.dealId);
  });

export const addParkingItemFn = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) => z.object({ dealId: z.string().uuid(), item }).parse(data))
  .handler(async ({ data, context }) => {
    const { addParkingItem } = await import("./parking-lot.server");
    return addParkingItem(context.userId, data.dealId, data.item);
  });

export const updateParkingItemFn = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        patch: item
          .partial()
          .extend({ status: z.enum(["open", "scheduled", "done", "dropped"]).optional() }),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { updateParkingItem } = await import("./parking-lot.server");
    return updateParkingItem(context.userId, data.id, data.patch);
  });

export const removeParkingItemFn = createServerFn({ method: "POST" })
  .middleware([requireDealEditor])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { removeParkingItem } = await import("./parking-lot.server");
    await removeParkingItem(context.userId, data.id);
    return { ok: true };
  });
