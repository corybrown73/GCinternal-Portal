import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  DEFAULT_BRANDING,
  type OrgBranding,
  type OrgBrandingView,
  schemeFor,
} from "./org-branding";

const db = () => supabaseAdmin as any;

/**
 * Branding lives in portal_app_config under `org_branding`, so changing it
 * needs no migration and no deploy — the same place the feature flags live.
 *
 * The logo goes in the private `attachments` bucket under `branding/`, and the
 * browser only ever gets a short-lived signed URL. A public bucket would have
 * been simpler; it would also mean the mark is fetchable by anyone who guesses
 * the path, and this deployment's own branding is not something to leak by
 * default.
 */

const CONFIG_KEY = "org_branding";
const BUCKET = "attachments";

export async function loadOrgBranding(): Promise<OrgBrandingView> {
  let stored: Partial<OrgBranding> = {};
  try {
    const { data } = await db()
      .from("portal_app_config")
      .select("value")
      .eq("key", CONFIG_KEY)
      .maybeSingle();
    stored = (data?.value ?? {}) as Partial<OrgBranding>;
  } catch (e) {
    // Branding must never be able to take the app down. Falling back to the
    // defaults is always a working state.
    console.error("[branding] could not read org_branding; using defaults", e);
  }

  const merged: OrgBranding = { ...DEFAULT_BRANDING, ...stored };
  // An unknown scheme key (hand-edited config, or one removed in a later
  // release) resolves to the default rather than rendering an unstyled nav.
  const scheme = schemeFor(merged.nav_scheme);

  let logoUrl: string | null = null;
  if (merged.logo_path) {
    try {
      const { data: signed } = await db()
        .storage.from(BUCKET)
        .createSignedUrl(merged.logo_path, 60 * 60);
      logoUrl = signed?.signedUrl ?? null;
    } catch (e) {
      console.error("[branding] could not sign the org logo url", e);
    }
  }

  return { app_name: merged.app_name, nav_scheme: scheme.key, logo_url: logoUrl };
}

/**
 * Write branding. Merged into the existing row, never replacing it, so setting
 * a colour cannot silently drop the logo somebody uploaded last week.
 */
export async function saveOrgBranding(patch: {
  [K in keyof OrgBranding]?: OrgBranding[K] | undefined;
}): Promise<OrgBrandingView> {
  const { data: existing } = await db()
    .from("portal_app_config")
    .select("value")
    .eq("key", CONFIG_KEY)
    .maybeSingle();

  // Undefined keys are stripped: a patch that only sets nav_scheme must not
  // write `app_name: undefined` over the name somebody chose.
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as Partial<OrgBranding>;

  const next: OrgBranding = {
    ...DEFAULT_BRANDING,
    ...((existing?.value ?? {}) as Partial<OrgBranding>),
    ...defined,
  };

  const { error } = await db()
    .from("portal_app_config")
    .upsert({ key: CONFIG_KEY, value: next }, { onConflict: "key" });
  if (error) throw new Error(`Could not save branding: ${error.message}`);

  return loadOrgBranding();
}

/**
 * Store this deployment's logo and point the config at it.
 *
 * Same ordering rule as the customer logo: repoint the config FIRST, delete the
 * old object after. A failed delete leaves one orphaned file; the other order
 * leaves the app pointing at something that is already gone.
 */
export async function storeOrgLogo(args: {
  fileName: string;
  contentType: string;
  dataBase64: string;
}): Promise<OrgBrandingView> {
  const binary = Buffer.from(args.dataBase64, "base64");
  const ext = (args.contentType.split("/")[1] ?? "png").replace(/[^a-z0-9]/g, "");
  const path = `branding/${crypto.randomUUID()}.${ext}`;

  const { data: existing } = await db()
    .from("portal_app_config")
    .select("value")
    .eq("key", CONFIG_KEY)
    .maybeSingle();
  const previous = ((existing?.value ?? {}) as Partial<OrgBranding>).logo_path ?? null;

  const { error: upErr } = await db()
    .storage.from(BUCKET)
    .upload(path, binary, { contentType: args.contentType, upsert: false });
  if (upErr) throw new Error(`Could not upload the logo: ${upErr.message}`);

  const view = await saveOrgBranding({ logo_path: path });

  if (previous && previous !== path) {
    try {
      await db().storage.from(BUCKET).remove([previous]);
    } catch (e) {
      console.error("[branding] replaced the logo but could not remove the old object", e);
    }
  }
  return view;
}
