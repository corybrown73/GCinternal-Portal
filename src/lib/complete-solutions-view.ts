import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getCompleteSolutions } from "./complete-solutions.functions";
import type { PurchaseCheck } from "./complete-solutions-purchase";
import type { SolutionView } from "./complete-solutions.server";

/** The workspace read: the solutions, and whether this person may change them (decided on the server). */
export type WorkspaceView = {
  solutions: SolutionView[];
  canEdit: boolean;
  purchase: PurchaseCheck;
};

/** The one place the Solutions view reads its data; every change refreshes it. */
export function useCompleteSolutions(implementationId: string) {
  const fn = useServerFn(getCompleteSolutions);
  return useQuery({
    queryKey: ["complete-solutions", implementationId],
    queryFn: () => fn({ data: { implementationId } }),
  });
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "That did not save. Nothing has been changed.";
}
