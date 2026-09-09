import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Lock } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { Panel } from "@/components/record";
import { NAV_CATALOGUE } from "@/lib/nav-visibility";
import { getNavVisibility, setNavVisibility } from "@/lib/nav-visibility.functions";
import { cn } from "@/lib/utils";

/**
 * Which sections are on the screen, for everyone.
 *
 * Same shape as the Features screen and gated the same way, but it is a
 * different question. A feature flag decides whether a capability exists;
 * this decides whether a section that exists is worth a place in the nav.
 * Switching one off hides its link and nothing else — the route still
 * answers and still checks the caller's role.
 */

const visibilityQuery = queryOptions({
  queryKey: ["nav-visibility"],
  queryFn: () => getNavVisibility(),
});

export const Route = createFileRoute("/admin/navigation")({
  head: () => ({ meta: [{ title: "Navigation — Admin | GoCanvas Handoff Hub" }] }),
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(visibilityQuery).catch(() => {});
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load the navigation: {error.message}
    </div>
  ),
  component: NavigationPage,
});

function NavigationPage() {
  const { data } = useSuspenseQuery(visibilityQuery);
  const queryClient = useQueryClient();
  const save = useServerFn(setNavVisibility);
  const [error, setError] = useState<string | null>(null);

  const hidden = new Set(data.hidden);

  const mutation = useMutation({
    mutationFn: (next: string[]) => save({ data: { hidden: next } }),
    onMutate: () => setError(null),
    onSuccess: (result) => {
      queryClient.setQueryData(["nav-visibility"], result);
      void queryClient.invalidateQueries({ queryKey: ["nav-visibility"] });
    },
    onError: (e) => setError((e as Error).message),
  });

  const toggle = (to: string, show: boolean) => {
    const next = new Set(hidden);
    if (show) next.delete(to);
    else next.add(to);
    mutation.mutate(Array.from(next));
  };

  const shown = NAV_CATALOGUE.length - hidden.size;

  return (
    <>
      <PageHeader
        title="Navigation"
        description="Which sections are in the sidebar, for everyone. Hiding one removes its link and nothing else — the page still exists and still checks who is asking."
        actions={
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">
              {shown} of {NAV_CATALOGUE.length} shown
            </span>
            <Link
              to="/admin"
              className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" /> Admin
            </Link>
          </div>
        }
      />
      <PageBody className="max-w-3xl space-y-3">
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-border bg-status-blocked px-3 py-2 text-[12px] text-status-blocked-foreground"
          >
            {error}
          </p>
        ) : null}

        <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
          Useful when a team only runs part of the process — or for a demo, where every section that
          is not part of the story is a question. Home and Admin cannot be hidden: one is where the
          app lands, the other is where these switches are. Every change is recorded against your
          name; other people see it on their next page load.
        </p>

        <Panel title="Sections" count={NAV_CATALOGUE.length}>
          <ul className="divide-y divide-border">
            {NAV_CATALOGUE.map((entry) => {
              const isShown = entry.locked || !hidden.has(entry.to);
              return (
                <li key={entry.to} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-foreground">
                      {entry.label}
                      {entry.audience !== "everyone" ? (
                        <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {entry.audience === "managers" ? "managers" : "super admins"}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {entry.hint} · <code className="font-mono">{entry.to}</code>
                    </p>
                  </div>
                  {entry.locked ? (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                      title="Always shown"
                    >
                      <Lock className="h-3 w-3" /> Always
                    </span>
                  ) : (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isShown}
                      disabled={mutation.isPending}
                      onClick={() => toggle(entry.to, !isShown)}
                      className={cn(
                        "relative h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-60",
                        isShown ? "border-primary bg-primary" : "border-border bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-background shadow transition-transform",
                          isShown ? "translate-x-4" : "translate-x-0.5",
                        )}
                      />
                      <span className="sr-only">{isShown ? "Shown" : "Hidden"}</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      </PageBody>
    </>
  );
}
