import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireInternalAuth } from "@/integrations/supabase/internal-middleware";
import { NAV_SCHEMES } from "./org-branding";

/**
 * Branding is deployment-wide, so writing it is manage-gated: one person's
 * taste should not be able to recolour the nav for everyone. Reading it is open
 * to any internal user, because every page renders the sidebar.
 *
 * The gate is the same shape templates.functions.ts uses — an explicit check
 * against context.profile, which the middleware populates. Any client-side
 * check only hides dead buttons.
 */

const MANAGE_ROLES = ["admin", "super_admin", "manager"];

function assertCanManage(profile: { role: string }): void {
  if (!MANAGE_ROLES.includes(profile.role)) {
    throw new Error("Forbidden: branding can only be changed by an admin, super admin or manager.");
  }
}

export const getOrgBranding = createServerFn({ method: "GET" })
  .middleware([requireInternalAuth])
  .handler(async () => {
    const { loadOrgBranding } = await import("./org-branding.server");
    return loadOrgBranding();
  });

export const saveBranding = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        app_name: z.string().trim().min(1).max(60).optional(),
        // Validated against the real preset list, so an unknown key cannot be
        // written and then resolved to "default" forever afterwards, leaving
        // someone convinced they picked a colour that never applied.
        nav_scheme: z.enum(NAV_SCHEMES.map((s) => s.key) as [string, ...string[]]).optional(),
      })
      .parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { saveOrgBranding } = await import("./org-branding.server");
    return saveOrgBranding(data);
  });

export const uploadOrgLogo = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        fileName: z.string().trim().min(1).max(200),
        // SVG is excluded for the same reason as the customer logo: it is a
        // document format that can carry script, served from our own origin.
        contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
        dataBase64: z.string().min(1).max(1_400_000),
      })
      .parse(data),
  )
  .middleware([requireInternalAuth])
  .handler(async ({ data, context }) => {
    assertCanManage(context.profile);
    const { storeOrgLogo } = await import("./org-branding.server");
    return storeOrgLogo(data);
  });
