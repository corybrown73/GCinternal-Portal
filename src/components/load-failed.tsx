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
