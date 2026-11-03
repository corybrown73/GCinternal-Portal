import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";

/**
 * One line for a section whose read failed, with a way to ask again.
 *
 * For a query that is not the page's own (a panel beside the main data): the
 * page still renders, and this section says it could not load instead of
 * showing an empty list or a "Loading…" that never ends. The server already
 * turned the failure into a plain sentence (src/lib/server/db-read.ts), so
 * the message is shown as given.
 */
export function LoadFailed({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("flex flex-wrap items-center gap-2 text-[13px]", className ?? "px-3 py-3")}
    >
      <span className="text-destructive">{errorMessage(error)}</span>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

/**
 * A route's error boundary for a page whose own read failed: the plain sentence
 * the server gave, and a Retry that clears the failed queries (a suspense query
 * re-throws its cached error until it is reset) before asking the route to try
 * again.
 */
export function RouteLoadFailed({
  error,
  reset,
  title,
  className,
}: {
  error: unknown;
  reset: () => void;
  title?: string;
  className?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const retry = () => {
    void queryClient.resetQueries({ predicate: (q) => q.state.status === "error" });
    void router.invalidate();
    reset();
  };
  return (
    <div className={className ?? "p-6 text-[13px]"}>
      {title ? <p className="font-medium">{title}</p> : null}
      <LoadFailed error={error} onRetry={retry} className="px-0 py-1" />
    </div>
  );
}
