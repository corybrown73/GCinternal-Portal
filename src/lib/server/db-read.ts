/**
 * Reading a PostgREST result without mistaking a failure for "nothing there".
 *
 * WHY THIS EXISTS. A loader that destructures only `{ data }` reads a failed
 * query as `null`, and `null ?? []` as an empty book. When a merged change
 * filtered implementations on a column production did not have yet, every
 * read errored, and Home, Customers and Pipeline all said "no accounts" —
 * with nothing on the screen and nothing in the log to say otherwise.
 *
 * The rule, the same one errors.ts states for writes: the database's own
 * message goes to the server log, a plain sentence goes to the screen.
 *
 * - `rowsOrThrow` / `rowOrThrow` for a PRIMARY read: the page cannot be
 *   right without it, so a failure stops the page and says so.
 * - `rowsOrLog` for a read that only decorates rows (a badge count, a name):
 *   the page still renders, but the failure is in the log, never silent.
 */

/** The part of a Supabase/PostgREST error this reads. */
export type DbError = { message?: string | null; code?: string | null } | null | undefined;

/** A query result as the Supabase client resolves it. */
export type DbResult<T> = { data: T | null | undefined; error?: DbError };

/** The sentence staff see. No SQL, no table internals, no stack. */
export function couldNotLoad(what: string): string {
  return `Could not load ${what}. Try again in a minute; if it keeps happening, tell an admin.`;
}

function logFailure(what: string, error: NonNullable<DbError>): void {
  console.error(
    `[db] ${what} failed: ${error.message ?? "unknown error"} (${error.code ?? "no code"})`,
  );
}

/**
 * The rows of a primary read. A failed read is logged with the database's
 * message and thrown as a plain sentence; a read with no rows is `[]`.
 */
export function rowsOrThrow<T>(result: DbResult<T[]>, what: string): T[] {
  if (result.error) {
    logFailure(what, result.error);
    throw new Error(couldNotLoad(what));
  }
  return result.data ?? [];
}

/**
 * The one row of a primary `maybeSingle()` read: `null` when there is no such
 * row, a thrown plain sentence when the read itself failed.
 */
export function rowOrThrow<T>(result: DbResult<T>, what: string): T | null {
  if (result.error) {
    logFailure(what, result.error);
    throw new Error(couldNotLoad(what));
  }
  return result.data ?? null;
}

/**
 * The rows of a read that only decorates the page. A failure is logged and
 * read as no rows, so a missing badge never takes the page down.
 */
export function rowsOrLog<T>(result: DbResult<T[]>, what: string): T[] {
  if (result.error) logFailure(what, result.error);
  return result.data ?? [];
}
