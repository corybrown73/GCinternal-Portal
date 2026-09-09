import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { requireSalesEditor } from "./presale.server";

/**
 * The form library: pictures of forms, by industry.
 *
 * Images live in the private attachments bucket, like every other artefact,
 * and are opened through short-lived signed links. A library card is not a
 * customer document, but the bucket is private and one rule for every file
 * beats a second bucket with a second policy that somebody has to remember.
 */

const db = () => supabaseAdmin as any;
const BUCKET = "attachments";
const LINK_TTL_S = 60 * 60;
/** ~8 MB of base64 is ~6 MB of image — plenty for a screenshot, too small to be a mistake. */
const IMAGE_MAX_BASE64 = 8_000_000;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export type FormTemplateCard = {
  id: string;
  name: string;
  industry: string;
  description: string | null;
  tags: string[];
  /** Signed, short-lived. null when the card has no picture yet. */
  imageUrl: string | null;
  createdAt: string;
};

export async function listFormTemplates(
  options: {
    industry?: string | null;
  } = {},
): Promise<FormTemplateCard[]> {
  let q = db()
    .from("form_templates")
    .select("id,name,industry,description,tags,image_path,created_at")
    .order("industry", { ascending: true })
    .order("created_at", { ascending: false });
  if (options.industry) q = q.ilike("industry", options.industry);
  const { data, error } = await q;
  if (error) throw new Error(`Could not read the form library: ${error.message}`);

  const rows = (data ?? []) as Array<Record<string, any>>;
  return Promise.all(
    rows.map(async (r) => ({
      id: String(r["id"]),
      name: String(r["name"]),
      industry: String(r["industry"]),
      description: (r["description"] as string | null) ?? null,
      tags: (r["tags"] as string[] | null) ?? [],
      imageUrl: await signedImage(r["image_path"] as string | null),
      createdAt: String(r["created_at"]),
    })),
  );
}

/**
 * The suggestions for a customer with no forms: their industry first, then
 * everything else, so an empty industry never means an empty screen. The
 * split is returned rather than merged — the panel shows "for your industry"
 * and "others" as two groups, which is more honest than one ranked list.
 */
export async function suggestFormTemplates(industry: string | null): Promise<{
  forIndustry: FormTemplateCard[];
  others: FormTemplateCard[];
}> {
  const all = await listFormTemplates();
  if (!industry) return { forIndustry: [], others: all };
  const key = industry.trim().toLowerCase();
  return {
    forIndustry: all.filter((t) => t.industry.trim().toLowerCase() === key),
    others: all.filter((t) => t.industry.trim().toLowerCase() !== key),
  };
}

export async function createFormTemplate(
  userId: string,
  args: {
    name: string;
    industry: string;
    description: string | null;
    tags: string[];
    image: { fileName: string; contentType: string; dataBase64: string } | null;
  },
): Promise<FormTemplateCard> {
  const actor = await requireSalesEditor(userId);

  const name = args.name.trim();
  const industry = args.industry.trim();
  if (!name) throw new Error("Give the template a name");
  if (!industry) throw new Error("Pick an industry — that is how the library is organised");

  let imagePath: string | null = null;
  if (args.image) {
    if (!IMAGE_TYPES.has(args.image.contentType)) {
      throw new Error("The picture should be a PNG, JPEG, WebP or GIF");
    }
    if (args.image.dataBase64.length > IMAGE_MAX_BASE64) {
      throw new Error("That picture is over 6MB — a screenshot should be far smaller");
    }
    const binary = Buffer.from(args.image.dataBase64, "base64");
    const safe = args.image.fileName.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-120) || "form.png";
    imagePath = `form-templates/${crypto.randomUUID()}-${safe}`;
    const { error: upErr } = await db()
      .storage.from(BUCKET)
      .upload(imagePath, binary, { contentType: args.image.contentType, upsert: false });
    if (upErr) throw new Error(`Could not upload the picture: ${upErr.message}`);
  }

  const { data, error } = await db()
    .from("form_templates")
    .insert({
      name,
      industry,
      description: args.description?.trim() || null,
      tags: args.tags.map((t) => t.trim()).filter(Boolean),
      image_path: imagePath,
      created_by: actor.id,
    })
    .select("id,name,industry,description,tags,image_path,created_at")
    .single();
  if (error || !data) {
    // The row failed, so nothing points at the object. Remove it rather than
    // leaving an orphan in the bucket.
    if (imagePath) {
      try {
        await db().storage.from(BUCKET).remove([imagePath]);
      } catch {
        /* the row is what matters */
      }
    }
    throw new Error(error?.message ?? "Could not save the template");
  }

  const { audit } = await import("./server/audit");
  await audit({
    actor_type: "user",
    actor_id: actor.id,
    action: "form_template.created",
    entity_type: "form_template",
    entity_id: String(data["id"]),
    payload: { name, industry, has_image: Boolean(imagePath) },
  });

  return {
    id: String(data["id"]),
    name: String(data["name"]),
    industry: String(data["industry"]),
    description: (data["description"] as string | null) ?? null,
    tags: (data["tags"] as string[] | null) ?? [],
    imageUrl: await signedImage(imagePath),
    createdAt: String(data["created_at"]),
  };
}

export async function deleteFormTemplate(userId: string, id: string): Promise<void> {
  const actor = await requireSalesEditor(userId);
  const { data: row } = await db()
    .from("form_templates")
    .select("id,name,image_path")
    .eq("id", id)
    .maybeSingle();
  if (!row) throw new Error("That template is already gone");

  const { error } = await db().from("form_templates").delete().eq("id", id);
  if (error) throw new Error(`Could not delete the template: ${error.message}`);

  // The card is gone, so its picture has nothing pointing at it.
  if (row["image_path"]) {
    try {
      await db()
        .storage.from(BUCKET)
        .remove([row["image_path"] as string]);
    } catch {
      /* an orphaned image costs pennies; the row is what matters */
    }
  }

  const { audit } = await import("./server/audit");
  await audit({
    actor_type: "user",
    actor_id: actor.id,
    action: "form_template.deleted",
    entity_type: "form_template",
    entity_id: id,
    payload: { name: row["name"] },
  });
}

async function signedImage(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const { data } = await db().storage.from(BUCKET).createSignedUrl(path, LINK_TTL_S);
    return (data?.signedUrl as string | undefined) ?? null;
  } catch (e) {
    console.error("[form-templates] could not sign an image url", e);
    return null;
  }
}
