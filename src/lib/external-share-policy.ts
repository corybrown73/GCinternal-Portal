/**
 * Who may issue, revoke, rotate and generate external plan sharing: customer
 * links, passcodes and plan snapshot shares (issue #83). Pure, so the server and
 * the interface ask the same question.
 *
 * This is the existing list, moved here unchanged. It is not a new permission
 * system: the same five roles were already the rule for customer links. Snapshot
 * generation and sharing now follow it too.
 */
export const EXTERNAL_SHARING_ROLES = [
  "admin",
  "super_admin",
  "manager",
  "implementation",
  "onboarding",
] as const;

/** The action named in the refusal for snapshot generation, sharing and revocation. */
export const SNAPSHOT_SHARING_ACTION = "generate, share or revoke plan snapshots";

export function canManageExternalAccess(role: string | null | undefined): boolean {
  return typeof role === "string" && (EXTERNAL_SHARING_ROLES as readonly string[]).includes(role);
}

/** Throws unless the role may do the external-sharing action named. Unknown and missing roles are refused. */
export function requireManage(
  role: string | null | undefined,
  action = "issue or revoke customer links",
): void {
  if (!canManageExternalAccess(role)) {
    throw new Error(`Forbidden: your role cannot ${action}`);
  }
}
