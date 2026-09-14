import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";

const IMAGE = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  dataBase64: z.string().min(1).max(6_000_000),
});

export const getTeamCardFn = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z.object({ profileId: z.string().uuid().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { loadTeamCard } = await import("./team-profile.server");
    return loadTeamCard(data.profileId ?? context.profile.id);
  });

export const saveTeamProfileFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        profileId: z.string().uuid().optional(),
        title: z.string().trim().max(80).nullable(),
        bookingUrl: z.string().trim().max(400).nullable(),
        bio: z.string().trim().max(400).nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { saveTeamProfile } = await import("./team-profile.server");
    return saveTeamProfile(context.profile.id, {
      profileId: data.profileId ?? context.profile.id,
      title: data.title,
      bookingUrl: data.bookingUrl,
      bio: data.bio,
    });
  });

export const uploadTeamPhotoFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z.object({ profileId: z.string().uuid().optional(), image: IMAGE }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { uploadTeamPhoto } = await import("./team-profile.server");
    return uploadTeamPhoto(context.profile.id, {
      profileId: data.profileId ?? context.profile.id,
      ...data.image,
    });
  });

export const removeTeamPhotoFn = createServerFn({ method: "POST" })
  .middleware([requireInternalAuth])
  .inputValidator((data: unknown) =>
    z.object({ profileId: z.string().uuid().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { removeTeamPhoto } = await import("./team-profile.server");
    return removeTeamPhoto(context.profile.id, data.profileId ?? context.profile.id);
  });
