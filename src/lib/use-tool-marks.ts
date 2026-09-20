import { useQuery } from "@tanstack/react-query";

import { getToolMarkUrlsFn } from "./tool-marks.functions";

/**
 * Uploaded logos, tool key → URL. Cached for half an hour: the library
 * changes when an admin uploads a logo, which is rare, and the strip is on
 * every deal, customer and pipeline card.
 */
export function useToolMarks(): Record<string, string> {
  const q = useQuery({
    queryKey: ["tool-marks"],
    queryFn: () => getToolMarkUrlsFn(),
    staleTime: 30 * 60_000,
  });
  return q.data ?? {};
}
