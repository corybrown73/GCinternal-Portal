import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth, requireManager } from "@/integrations/supabase/internal-middleware";

/** tool key → logo URL, for the marks on every page. */
export const getToolMarkUrlsFn = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { toolMarkUrls } = await import("./tool-marks.server");
    return toolMarkUrls();
  });

export const listToolMarksFn = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { listToolMarks } = await import("./tool-marks.server");
    return listToolMarks();
  });

export const uploadToolMarkFn = createServerFn({ method: "POST" })
  .middleware([requireManager])
  .inputValidator((data: unknown) =>
    z
      .object({
        tool: z.string().trim().min(1).max(40),
        contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]),
        dataBase64: z.string().min(1).max(1_400_000),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { uploadToolMark } = await import("./tool-marks.server");
    return uploadToolMark(data);
  });

export const deleteToolMarkFn = createServerFn({ method: "POST" })
  .middleware([requireManager])
  .inputValidator((data: unknown) =>
    z.object({ tool: z.string().trim().min(1).max(40) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { deleteToolMark } = await import("./tool-marks.server");
    return deleteToolMark(data.tool);
  });
