import type { PortalRole } from "@/lib/auth";

/**
 * Who may remove an attachment (issue #79). Pure, so the rule is stated once:
 * the server checks it on every removal, and the Resources card asks the same
 * question before it shows Remove. Hiding the button is never the control.
 *
 * The approved policy:
 *  - The uploader may delete the attachments they uploaded.
 *  - The exact `admin` role may delete attachments across all implementations,
 *    including attachments with no recorded uploader.
 *  - Other internal users may delete only attachments they personally uploaded.
 *  - Implementation ownership alone grants nothing. This rule takes no ownership input.
 *  - Customers cannot delete attachments.
 *  - An unknown, missing or unrecognised role grants nothing.
 *
 * Only the exact `admin` role is treated as administrator. `super_admin` and
 * `manager` are internal roles with uploader-only deletion; the role model does
 * not resolve them to `admin`.
 *
 * Viewing and uploading are not touched by this module.
 */

/** What a role may do with attachments it did not upload. */
type DeletionTier = "admin" | "internal" | "none";

/**
 * Every role the application knows, classified. The type is exhaustive over
 * PortalRole, so a role added to the app fails the build until it is classified.
 */
const DELETION_TIER: Record<PortalRole, DeletionTier> = {
  admin: "admin",
  super_admin: "internal",
  manager: "internal",
  sales: "internal",
  implementation: "internal",
  tam_se: "internal",
  onboarding: "internal",
  am: "internal",
  se: "internal",
  customer: "none",
};

/** The tier for a role string from a session. Anything not in the table, including a missing role, is "none". */
export function deletionTier(role: unknown): DeletionTier {
  if (typeof role !== "string" || !Object.prototype.hasOwnProperty.call(DELETION_TIER, role)) {
    return "none";
  }
  return DELETION_TIER[role as PortalRole];
}

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
    "This attachment has no recorded uploader, so only an administrator can remove it. Nothing was removed.",
  notUploader:
    "Only the person who uploaded this attachment, or an administrator, can remove it. Nothing was removed.",
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
 * Why this actor may not remove this file, or null when they may. Every check
 * that cannot be answered refuses. The checks, in order:
 *  1. the actor has an identity;
 *  2. the actor's role is a known internal role (customers and unknown roles stop here);
 *  3. the file belongs to the account the request names;
 *  4. the stored file sits in that account's storage folder, if it has one;
 *  5. the exact admin may delete any remaining file; any other internal user
 *     may delete only a file they uploaded.
 */
export function removalDenial(
  actor: RemovalActor | null | undefined,
  file: RemovableFile,
  expectedImplementationId: string,
): string | null {
  if (!actor?.id) return REMOVAL_MESSAGES.notIdentified;
  const tier = deletionTier(actor.role);
  if (tier === "none") return REMOVAL_MESSAGES.notPermitted;
  if (file.implementation_id !== expectedImplementationId) return REMOVAL_MESSAGES.wrongAccount;
  if (
    file.storage_path !== null &&
    !storagePathBelongsTo(file.storage_path, file.implementation_id)
  ) {
    return REMOVAL_MESSAGES.badPath;
  }
  if (tier === "admin") return null;
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
