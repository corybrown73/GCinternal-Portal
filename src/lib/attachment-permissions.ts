/**
 * Who may remove an attachment (issue #79). Pure, so the rule is stated once:
 * the server checks it on every removal, and the Resources card asks the same
 * question before it shows Remove. Hiding the button is never the control.
 *
 * The policy:
 *  - The uploader may remove their own attachment.
 *  - An administrator with the correct scope may remove attachments. NOT ENABLED.
 *    "The correct scope" has no definition for internal roles: the grants that
 *    carry an implementation scope belong to customer contacts (portal.server.ts),
 *    and nothing records which implementations an internal administrator may act
 *    on. No role set is guessed here; this needs a decision first.
 *  - Everyone else may view permitted files and may not remove them.
 *
 * Viewing and uploading are not touched by this module.
 */

/** Who is asking. The id and role come from the server session, never from the request body. */
export type RemovalActor = { id: string; role: string | null | undefined };

/** The fields of an account_files row the rule reads. */
export type RemovableFile = {
  implementation_id: string;
  added_by: string | null;
  storage_path: string | null;
};

export const REMOVAL_MESSAGES = {
  notIdentified: "Your login could not be identified, so nothing was removed.",
  notPermitted: "Your role cannot remove attachments, so nothing was removed.",
  wrongAccount: "That attachment belongs to a different account, so nothing was removed.",
  noUploader:
    "This attachment has no recorded uploader, and only its uploader can remove it, so nothing was removed.",
  notUploader:
    "Only the person who uploaded this attachment can remove it, so nothing was removed.",
  badPath:
    "This attachment's file is not stored where its account's files are kept, so it cannot be removed. Nothing was removed.",
} as const;

/**
 * Uploaded files are named `accounts/<implementation id>/<uuid>-<safe name>` by
 * addAccountUpload. The name after the folder is one segment: no slash, so no
 * path can climb out of the account's folder.
 */
const UPLOADED_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]+$/i;

/** Whether a stored file sits in this implementation's folder, under a name the upload wrote. */
export function storagePathBelongsTo(path: string, implementationId: string): boolean {
  const folder = `accounts/${implementationId}/`;
  if (!path.startsWith(folder)) return false;
  return UPLOADED_NAME.test(path.slice(folder.length));
}

/**
 * Why this actor may not remove this file, or null when they may. The checks run
 * in order, and every one that cannot be answered refuses: a missing identity,
 * a missing uploader, or a storage path outside the account's folder.
 */
export function removalDenial(
  actor: RemovalActor | null | undefined,
  file: RemovableFile,
  expectedImplementationId: string,
): string | null {
  if (!actor?.id) return REMOVAL_MESSAGES.notIdentified;
  // Customers never remove anything. The server's middleware already refuses
  // them; this is the same answer for a call that bypasses it.
  if (!actor.role || actor.role === "customer") return REMOVAL_MESSAGES.notPermitted;
  if (file.implementation_id !== expectedImplementationId) return REMOVAL_MESSAGES.wrongAccount;
  if (
    file.storage_path !== null &&
    !storagePathBelongsTo(file.storage_path, file.implementation_id)
  ) {
    return REMOVAL_MESSAGES.badPath;
  }
  if (!file.added_by) return REMOVAL_MESSAGES.noUploader;
  if (file.added_by !== actor.id) return REMOVAL_MESSAGES.notUploader;
  return null;
}

/** The Resources card's question: may this viewer see Remove on this row? */
export function canRemoveAttachment(
  actor: RemovalActor | null | undefined,
  file: RemovableFile,
  expectedImplementationId: string,
): boolean {
  return actor ? removalDenial(actor, file, expectedImplementationId) === null : false;
}
