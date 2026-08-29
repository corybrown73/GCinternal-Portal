import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { recordJourneyView } from "@/lib/journeys.functions";

export const Route = createFileRoute("/view/$token")({
  head: () => ({
    meta: [
      { title: "Opening your content — GoCanvas" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ViewTokenPage,
});

/**
 * PUBLIC tracked-link landing (AuthGate exempts /view). Records the view —
 * which may advance the journey — then forwards the visitor to the real
 * content URL. recordJourneyView never throws: on any failure it returns the
 * app root so the visitor always lands somewhere.
 */
function ViewTokenPage() {
  const { token } = Route.useParams();
  const record = useServerFn(recordJourneyView);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { url } = await record({ data: { token } });
        if (!cancelled) window.location.replace(url);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        {failed ? (
          <>
            <p className="text-[13px] font-medium text-foreground">This link didn&apos;t work</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              It may have expired.{" "}
              <a href="/" className="underline underline-offset-2">
                Go to GoCanvas
              </a>
            </p>
          </>
        ) : (
          <>
            <p className="text-[14px] font-medium text-foreground">Opening your content…</p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              GoCanvas onboarding
            </p>
          </>
        )}
      </div>
    </div>
  );
}
