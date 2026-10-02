/**
 * The message of whatever was thrown. Route error boundaries receive
 * `unknown` (anything can be thrown), and a page that prints
 * `error.message` on a thrown string renders "undefined".
 */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** The thrown value as an Error, for reporters that want one. */
export function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(errorMessage(e));
}
