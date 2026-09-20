import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { TOOLS } from "./onboarding-tools";

const db = () => supabaseAdmin as any;

/**
 * Uploaded logos for the systems we connect to.
 *
 * The built-in marks (brand-marks.ts) are a fine default, but a monogram
 * is not a logo. An admin uploads the real one once, per tool, and it
 * replaces the built-in mark everywhere the tool appears: the deal page,
 * the customer record, the pipeline card, the customer's welcome page.
 * Kept in the private attachments bucket under `tool-marks/`, one file
 * per tool, signed on demand like every other file here.
 */
const BUCKET = "attachments";
const PREFIX = "tool-marks";
const LINK_TTL_S = 60 * 60;
const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
/** ~1MB of base64. A logo is a small file; anything bigger is a photo. */
const MAX_BASE64 = 1_400_000;

export type ToolMarkFile = { tool: string; path: string; url: string | null };

async function listFiles(): Promise<Array<{ name: string }>> {
  const { data, error } = await db()
    .storage.from(BUCKET)
    .list(PREFIX, { limit: 200, sortBy: { column: "name", order: "asc" } });
  if (error || !data) return [];
  return (data as Array<{ name: string; id?: string | null }>).filter((o) => o.id);
}

/** Every uploaded logo, with a link that works for an hour. */
export async function listToolMarks(): Promise<ToolMarkFile[]> {
  const out: ToolMarkFile[] = [];
  for (const f of await listFiles()) {
    const tool = f.name.replace(/\.[a-z0-9]+$/i, "");
    if (!TOOLS.some((t) => t.key === tool)) continue;
    const path = `${PREFIX}/${f.name}`;
    const { data } = await db().storage.from(BUCKET).createSignedUrl(path, LINK_TTL_S);
    out.push({ tool, path, url: data?.signedUrl ?? null });
  }
  return out;
}

/** tool key → signed URL, for any page that draws marks. Empty when nothing is uploaded. */
export async function toolMarkUrls(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const m of await listToolMarks()) if (m.url) out[m.tool] = m.url;
  return out;
}

export async function uploadToolMark(args: {
  tool: string;
  contentType: string;
  dataBase64: string;
}): Promise<ToolMarkFile[]> {
  const ext = TYPES[args.contentType];
  if (!ext) throw new Error("The logo should be a PNG, SVG, WebP or JPEG");
  if (args.dataBase64.length > MAX_BASE64)
    throw new Error("That file is over 1MB — a logo should be far smaller");
  if (!TOOLS.some((t) => t.key === args.tool)) throw new Error("That is not a tool the app knows");
  // One file per tool: remove any other extension first so the newest wins.
  const stale = (await listFiles())
    .filter((f) => f.name.replace(/\.[a-z0-9]+$/i, "") === args.tool)
    .map((f) => `${PREFIX}/${f.name}`);
  if (stale.length) await db().storage.from(BUCKET).remove(stale);
  const { error } = await db()
    .storage.from(BUCKET)
    .upload(`${PREFIX}/${args.tool}.${ext}`, Buffer.from(args.dataBase64, "base64"), {
      contentType: args.contentType,
      upsert: true,
    });
  if (error) throw new Error(`Could not upload the logo: ${error.message}`);
  return listToolMarks();
}

export async function deleteToolMark(tool: string): Promise<ToolMarkFile[]> {
  const paths = (await listFiles())
    .filter((f) => f.name.replace(/\.[a-z0-9]+$/i, "") === tool)
    .map((f) => `${PREFIX}/${f.name}`);
  if (paths.length) {
    const { error } = await db().storage.from(BUCKET).remove(paths);
    if (error) throw new Error(`Could not remove the logo: ${error.message}`);
  }
  return listToolMarks();
}
