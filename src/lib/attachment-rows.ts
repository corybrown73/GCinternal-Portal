/**
 * How one row in an implementation's document list behaves. Read from the row
 * as the server returns it; nothing here changes what a row does, it only
 * names it for the screen.
 */
export type AttachmentRow = {
  origin: "file" | "field";
  external_url: string | null;
};

/** A link opens as a link; a stored file is downloaded from the signed URL. */
export function attachmentActionLabel(row: AttachmentRow): "Open" | "Download" {
  return row.external_url ? "Open" : "Download";
}

/**
 * Legacy rows are the SOW and board fields on the implementation record. Their
 * URL is already public to the page, so they open directly rather than through
 * a signed URL.
 */
export function attachmentOpensDirectly(row: AttachmentRow): boolean {
  return row.origin === "field" && Boolean(row.external_url);
}

/**
 * Only stored records can be removed. A legacy row is the implementation field
 * itself, and deleting it from here would blank a value the handoff check reads.
 */
export function attachmentRemovable(row: AttachmentRow): boolean {
  return row.origin === "file";
}
