import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = () => supabaseAdmin as any;
const BUCKET = "attachments";

/**
 * Everything attached to one account, from wherever it actually lives.
 *
 * WHY THIS READS FOUR PLACES. `account_files` (0035) is where new attachments
 * go, but a SOW somebody pasted into `implementations.sow_document_url` months
 * ago is still the SOW. Migrating those columns into the table would break
 * every surface that reads them — the handoff completeness check reads
 * sow_document_url directly — so they are read alongside and presented as one
 * list. The list is the feature; the storage is an implementation detail.
 *
 * Legacy entries are marked `origin: "field"` and are not deletable here: the
 * place to change the SOW link is still the SOW field, and offering a delete
 * that silently blanks a field somebody else's checklist depends on would be a
 * trap.
 */
export type AccountFile = {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  storage_path: string | null;
  external_url: string | null;
  content_type: string | null;
  size_bytes: number | null;
  added_by_name: string | null;
  created_at: string;
  /** "file" — a row in account_files. "field" — a legacy URL column. */
  origin: "file" | "field";
};

const KINDS = ["sow", "board", "deck", "doc", "sheet", "recording", "other"] as const;
export type AttachmentKind = (typeof KINDS)[number];
export const ATTACHMENT_KINDS: readonly AttachmentKind[] = KINDS;

export function isAttachmentKind(v: string): v is AttachmentKind {
  return (KINDS as readonly string[]).includes(v);
}

export async function loadAccountFiles(implementationId: string): Promise<AccountFile[]> {
  const [rows, impl, names] = await Promise.all([
    db()
      .from("account_files")
      .select("*")
      .eq("implementation_id", implementationId)
      .order("created_at", { ascending: false }),
    db()
      .from("implementations")
      .select("sow_document_url, sow_document_name, discovery_board_url, discovery_board_image_url")
      .eq("id", implementationId)
      .maybeSingle(),
    db().from("portal_profiles").select("id, full_name, email"),
  ]);

  const nameOf = new Map<string, string>(
    (
      (names.data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>
    ).map((p) => [p.id, p.full_name ?? p.email ?? "—"] as const),
  );

  const out: AccountFile[] = ((rows.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r["id"]),
    kind: String(r["kind"] ?? "other"),
    title: String(r["title"] ?? "Untitled"),
    description: (r["description"] as string | null) ?? null,
    storage_path: (r["storage_path"] as string | null) ?? null,
    external_url: (r["external_url"] as string | null) ?? null,
    content_type: (r["content_type"] as string | null) ?? null,
    size_bytes: (r["size_bytes"] as number | null) ?? null,
    added_by_name: r["added_by"] ? (nameOf.get(String(r["added_by"])) ?? null) : null,
    created_at: String(r["created_at"]),
    origin: "file",
  }));

  // The legacy fields, appended so nothing that exists today disappears from
  // the one list this feature promises.
  const i = (impl.data ?? {}) as Record<string, string | null>;
  const legacy: Array<[string, string | null, AttachmentKind, string]> = [
    ["sow-field", i["sow_document_url"] ?? null, "sow", i["sow_document_name"] || "Signed SOW"],
    ["board-field", i["discovery_board_url"] ?? null, "board", "Discovery board"],
    ["board-image-field", i["discovery_board_image_url"] ?? null, "board", "Discovery board image"],
  ];
  for (const [id, url, kind, title] of legacy) {
    if (!url) continue;
    out.push({
      id,
      kind,
      title,
      description: "Set on the implementation record",
      storage_path: null,
      external_url: url,
      content_type: null,
      size_bytes: null,
      added_by_name: null,
      created_at: "",
      origin: "field",
    });
  }

  return out;
}

/** Attach something that lives elsewhere: a Miro board, a Drive doc, a deck. */
export async function addAccountLink(args: {
  implementationId: string;
  title: string;
  kind: AttachmentKind;
  url: string;
  description?: string | null;
  actorProfileId: string | null;
}) {
  const url = args.url.trim();
  // Refused rather than coerced. Prefixing "https://" onto whatever was pasted
  // turns a typo into a link that looks real and goes nowhere.
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("A link must start with http:// or https://");
  }
  if (args.title.trim() === "") throw new Error("Give it a name somebody will recognise");

  const { data, error } = await db()
    .from("account_files")
    .insert({
      implementation_id: args.implementationId,
      title: args.title.trim(),
      kind: args.kind,
      external_url: url,
      description: args.description?.trim() || null,
      added_by: args.actorProfileId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { ok: true, id: data.id as string };
}

/**
 * Store an uploaded file and record it.
 *
 * The object goes up FIRST and the row second. The other order would let a
 * failed upload leave a row promising a file that is not there — an attachment
 * that appears in the list and 404s on click. This order can leave an orphaned
 * object in the bucket, which nobody ever sees.
 */
export async function addAccountUpload(args: {
  implementationId: string;
  title: string;
  kind: AttachmentKind;
  fileName: string;
  contentType: string;
  dataBase64: string;
  actorProfileId: string | null;
}) {
  if (args.title.trim() === "") throw new Error("Give it a name somebody will recognise");

  const binary = Buffer.from(args.dataBase64, "base64");
  const safe = args.fileName.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-120);
  const path = `accounts/${args.implementationId}/${crypto.randomUUID()}-${safe}`;

  const { error: upErr } = await db()
    .storage.from(BUCKET)
    .upload(path, binary, { contentType: args.contentType, upsert: false });
  if (upErr) throw new Error(`Could not upload the file: ${upErr.message}`);

  const { data, error } = await db()
    .from("account_files")
    .insert({
      implementation_id: args.implementationId,
      title: args.title.trim(),
      kind: args.kind,
      storage_path: path,
      content_type: args.contentType,
      size_bytes: binary.byteLength,
      added_by: args.actorProfileId,
    })
    .select("id")
    .single();
  if (error) {
    // The row failed, so the object has nothing pointing at it. Remove it
    // rather than leaving a file in the bucket nobody can reach.
    try {
      await db().storage.from(BUCKET).remove([path]);
    } catch {
      /* the row is what matters; a stray object is harmless */
    }
    throw new Error(error.message);
  }
  return { ok: true, id: data.id as string };
}

/**
 * A short-lived link to an attachment.
 *
 * The bucket is private and stays private: a signed URL that leaks expires
 * rather than exposing a customer's SOW indefinitely.
 */
export async function accountFileLink(id: string): Promise<{ url: string }> {
  const { data: row } = await db()
    .from("account_files")
    .select("storage_path, external_url")
    .eq("id", id)
    .maybeSingle();
  if (!row) throw new Error("That attachment no longer exists");

  const external = (row as Record<string, string | null>)["external_url"];
  if (external) return { url: external };

  const path = (row as Record<string, string | null>)["storage_path"];
  if (!path) throw new Error("That attachment has no file");

  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    throw new Error(`Could not open the file: ${error?.message ?? "no link returned"}`);
  }
  return { url: data.signedUrl as string };
}

/**
 * Remove an attachment.
 *
 * The row goes first, the object second — the mirror of the upload order and
 * for the same reason. If the storage delete fails afterwards we are left with
 * an unreferenced object; if it went first, a failure would leave a row
 * pointing at a file that is gone.
 */
export async function removeAccountFile(id: string) {
  const { data: row } = await db()
    .from("account_files")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: true, removed: false };

  const { error } = await db().from("account_files").delete().eq("id", id);
  if (error) throw new Error(error.message);

  const path = (row as Record<string, string | null>)["storage_path"];
  if (path) {
    try {
      await db().storage.from(BUCKET).remove([path]);
    } catch (e) {
      console.error("[attachments] row removed but the object remains", e);
    }
  }
  return { ok: true, removed: true };
}
