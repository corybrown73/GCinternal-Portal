/**
 * Turning a failure into something a person can act on.
 *
 * WHY THIS EXISTS. Ticking an exit criterion put this on the screen:
 *
 *   insert or update on table "work_items" violates foreign key constraint
 *   "work_items_completed_by_fkey"
 *
 * That sentence is perfect for the person fixing the bug and useless to the
 * person hitting it. It names internal tables, it does not say whether to retry
 * or give up, and it makes a working product look broken in a way the reader
 * cannot even describe to support.
 *
 * The rule: the detail goes to the log, a sentence goes to the screen. Never
 * both, and never the reverse.
 *
 * Pure — no imports — so it is safe on both sides of the wire and testable
 * without a database.
 */

/** Patterns that mean the driver is talking, not us. */
const DRIVER_NOISE = [
  /violates foreign key constraint/i,
  /violates check constraint/i,
  /violates not-null constraint/i,
  /duplicate key value violates unique constraint/i,
  /invalid input syntax for type/i,
  /relation ".*" does not exist/i,
  /column ".*" does not exist/i,
  /permission denied for/i,
  /^pgrst\d+/i,
  /JWT|jwt expired/i,
];

export function isDriverError(message: string): boolean {
  return DRIVER_NOISE.some((re) => re.test(message));
}

/**
 * What to show a person when `action` failed.
 *
 * `action` is a verb phrase in the user's terms — "save that task",
 * "attach the file" — because the sentence has to make sense to somebody who
 * has never heard of the table it failed on.
 */
export function userMessage(action: string, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");

  // A message we wrote ourselves is already meant for a person: pass it
  // through. This is what makes deliberate validation errors ("A link must
  // start with http:// or https://") survive the wrapper intact.
  if (raw && !isDriverError(raw) && raw.length < 200 && !raw.includes("\n")) {
    return raw;
  }

  return `Could not ${action}. This has been logged — try again, and tell us if it keeps happening.`;
}

/**
 * Log the detail, return the sentence. One call at the boundary, so no caller
 * has to remember to do both and none of them can do only the second.
 */
export function reportFailure(scope: string, action: string, error: unknown): string {
  const raw = error instanceof Error ? (error.stack ?? error.message) : String(error ?? "");
  console.error(`[${scope}] ${action} failed:`, raw);
  return userMessage(action, error);
}
