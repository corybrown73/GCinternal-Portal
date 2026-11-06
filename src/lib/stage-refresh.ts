import type { QueryKey } from "@tanstack/react-query";

/**
 * Which screens show an implementation's stage, and so must re-read after any
 * write that can move it: the Current Implementation header and journey rail
 * (the customer view), the gate panel and its progress (the plan), the partner
 * progress, the deal and its welcome, and the Home list.
 *
 * WHY ONE LIST. A milestone, a booking, a ticked task and a held kickoff can all
 * move the stage. Each writer used to refresh a different subset, so the header
 * or the gate panel stayed on the old stage until a browser reload. Every such
 * writer now refreshes the same set, through the query client the app already
 * uses. There is no separate state to keep in step.
 *
 * Where an id is not in scope at a call site, the fallback is the key's prefix:
 * every plan, or every customer view. Only queries that are on screen refetch,
 * so the cost is one read, not a sweep.
 */
export type StageRefreshScope = {
  implementationId?: string | null | undefined;
  customerId?: string | null | undefined;
  dealId?: string | null | undefined;
};

export function stageRefreshKeys(scope: StageRefreshScope): QueryKey[] {
  const keys: QueryKey[] = [];
  keys.push(
    scope.implementationId ? ["plan", scope.implementationId] : ["plan"],
    scope.implementationId ? ["partner-progress", scope.implementationId] : ["partner-progress"],
  );
  keys.push(scope.customerId ? ["customer360", scope.customerId] : ["customer360"]);
  if (scope.dealId) keys.push(["deal", scope.dealId], ["welcome", scope.dealId]);
  keys.push(["home"]);
  return keys;
}

/** Re-read every view that shows the stage. Resolves once all have been asked. */
export function refreshStageViews(
  qc: { invalidateQueries: (filters: { queryKey: QueryKey }) => unknown },
  scope: StageRefreshScope,
): Promise<void> {
  return Promise.all(
    stageRefreshKeys(scope).map((queryKey) => Promise.resolve(qc.invalidateQueries({ queryKey }))),
  ).then(() => undefined);
}
