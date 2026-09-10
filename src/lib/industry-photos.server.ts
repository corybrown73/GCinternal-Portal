import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { INDUSTRIES } from "@/lib/intake-answers";

const db = () => supabaseAdmin as any;

/**
 * Photography, by industry.
 *
 * The one thing a generated page cannot invent is a real crew on a real
 * job, and it is the thing that makes the page look made for them. So the
 * photos are a small licensed library an admin uploads once — two or three
 * per industry — kept in the private attachments bucket under
 * `industry-photos/<slug>/`, signed on demand like every other file here.
 * A deal picks one deterministically from its id, so the page is stable
 * between visits and two customers in the same industry do not always see
 * the same picture.
 */

const BUCKET = "attachments";
const PREFIX = "industry-photos";
const LINK_TTL_S = 60 * 60;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
/** ~6MB of base64. A hero photo should be a compressed JPEG well under that. */
const IMAGE_MAX_BASE64 = 8_000_000;

export function industrySlug(industry: string | null | undefined): string {
  const s = (industry ?? "other").trim().toLowerCase();
  const known = INDUSTRIES.find((i) => i.toLowerCase() === s) ?? "Other";
  return known
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type IndustryPhoto = { path: string; industry: string; name: string; url: string | null };

export async function listIndustryPhotos(): Promise<IndustryPhoto[]> {
  const out: IndustryPhoto[] = [];
  for (const industry of INDUSTRIES) {
    const slug = industrySlug(industry);
    const { data, error } = await db()
      .storage.from(BUCKET)
      .list(`${PREFIX}/${slug}`, { limit: 50, sortBy: { column: "name", order: "asc" } });
    if (error || !data) continue;
    for (const obj of data as Array<{ name: string; id?: string | null }>) {
      // Folders come back without an id; skip anything that is not a file.
      if (!obj.id) continue;
      const path = `${PREFIX}/${slug}/${obj.name}`;
      const { data: signed } = await db().storage.from(BUCKET).createSignedUrl(path, LINK_TTL_S);
      out.push({ path, industry, name: obj.name, url: signed?.signedUrl ?? null });
    }
  }
  return out;
}

/**
 * A photo for this deal's industry, or null when none has been uploaded —
 * the page then falls back to its icon composition, which is designed to
 * stand on its own rather than look like a missing image.
 */
export async function photoForIndustry(
  industry: string | null,
  seed: string,
): Promise<string | null> {
  const slug = industrySlug(industry);
  const { data, error } = await db()
    .storage.from(BUCKET)
    .list(`${PREFIX}/${slug}`, { limit: 50, sortBy: { column: "name", order: "asc" } });
  const files = ((error ? [] : (data ?? [])) as Array<{ name: string; id?: string | null }>).filter(
    (o) => o.id,
  );
  if (files.length === 0) return null;
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pick = files[h % files.length]!;
  const { data: signed } = await db()
    .storage.from(BUCKET)
    .createSignedUrl(`${PREFIX}/${slug}/${pick.name}`, LINK_TTL_S);
  return signed?.signedUrl ?? null;
}

export async function uploadIndustryPhoto(args: {
  industry: string;
  fileName: string;
  contentType: string;
  dataBase64: string;
}): Promise<IndustryPhoto[]> {
  if (!IMAGE_TYPES.has(args.contentType))
    throw new Error("The photo should be a JPEG, PNG or WebP");
  if (args.dataBase64.length > IMAGE_MAX_BASE64) {
    throw new Error("That photo is over 6MB — export it for web first");
  }
  const slug = industrySlug(args.industry);
  const binary = Buffer.from(args.dataBase64, "base64");
  const safe = args.fileName.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-100) || "photo.jpg";
  const path = `${PREFIX}/${slug}/${Date.now()}-${safe}`;
  const { error } = await db()
    .storage.from(BUCKET)
    .upload(path, binary, { contentType: args.contentType, upsert: false });
  if (error) throw new Error(`Could not upload the photo: ${error.message}`);
  return listIndustryPhotos();
}

export async function deleteIndustryPhoto(path: string): Promise<IndustryPhoto[]> {
  if (!path.startsWith(`${PREFIX}/`) || path.includes("..")) {
    throw new Error("That is not an industry photo");
  }
  const { error } = await db().storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`Could not remove the photo: ${error.message}`);
  return listIndustryPhotos();
}
