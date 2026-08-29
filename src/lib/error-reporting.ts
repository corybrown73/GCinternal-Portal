// Local error reporting: log to the console (and therefore to the platform's
// function logs). Swap in Sentry or similar here later — this is the single
// funnel every boundary calls.
export function reportClientError(error: unknown, context?: Record<string, unknown>) {
  console.error('[app-error]', error, context ?? {});
}
