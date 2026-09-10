import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";
import { canManage, type PortalRole } from "@/lib/auth";

function assertCanManage(profile: { role: string }): void {
  if (!canManage(profile.role as PortalRole)) {
    throw new Error("Only an admin can change the photo library");
  }
}

export const listIndustryPhotosFn = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { listIndustryPhotos } = await import("./industry-photos.server");
    return listIndustryPhotos();
  });

export const uploadIndustryPhotoFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        industry: z.string().trim().min(1).max(80),
        fileName: z.string().trim().min(1).max(200),
        contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
        dataBase64: z.string().min(1).max(8_000_000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { uploadIndustryPhoto } = await import("./industry-photos.server");
    return uploadIndustryPhoto(data);
  });

export const deleteIndustryPhotoFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) => z.object({ path: z.string().min(1).max(400) }).parse(data))
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { deleteIndustryPhoto } = await import("./industry-photos.server");
    return deleteIndustryPhoto(data.path);
  });
