import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PageBody, PageHeader, EmptyState } from "@/components/page";
import { NoRows, Panel } from "@/components/record";
import { SavedViews } from "@/components/saved-views";
import { search } from "@/lib/search.functions";
import { searchToView } from "@/lib/saved-view-input";

type SearchParams = { q: string };

const searchQuery = (q: string) =>
  queryOptions({
    queryKey: ["global-search", q],
    queryFn: () => search({ data: { q } }),
  });

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search — Implementation Hub" },
      {
        name: "description",
        content:
          "One search across customers, implementations, deals, tickets, technical solutions and people.",
      },
    ],
  }),
  validateSearch: (raw: Record<string, unknown>): SearchParams => ({
    q: typeof raw["q"] === "string" ? (raw["q"] as string) : "",
  }),
  loaderDeps: ({ search: s }) => ({ q: s.q }),
  loader: ({ context, deps }) => {
    void context.queryClient.ensureQueryData(searchQuery(deps.q)).catch(() => {});
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not search: {error.message}
    </div>
  ),
  component: SearchPage,
});

const inputClass =
  "h-8 w-full rounded-sm border border-border bg-background px-2 text-[13px] text-foreground outline-none focus:ring-1 focus:ring-ring";

function SearchPage() {
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runSearch = useServerFn(search);
  const { data } = useSuspenseQuery(searchQuery(q));
  const [draft, setDraft] = useState(q);

  const submit = (value: string) => {
    void navigate({ to: "/search", search: { q: value } });
    void queryClient.prefetchQuery({
      queryKey: ["global-search", value],
      queryFn: () => runSearch({ data: { q: value } }),
    });
  };

  return (
    <>
      <PageHeader
        title="Search"
        description="Customers, implementations, deals, tickets, technical solutions and people. Results are grouped by kind and not ranked — a relevance score across six unrelated tables would be a number standing in for judgement."
      />
      <PageBody className="max-w-3xl space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft.trim());
          }}
          className="flex items-center gap-2"
        >
          <input
            className={inputClass}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Name, subject or title — at least two characters"
            aria-label="Search"
          />
          <button
            type="submit"
            className="shrink-0 rounded-sm border border-border px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground"
          >
            Search
          </button>
        </form>

        <SavedViews
          surface="search"
          current={searchToView({ q })}
          onApply={(view) => submit(String(view["q"] ?? ""))}
        />

        {!data.enabled ? (
          <EmptyState
            title="Search is not switched on yet"
            description="Global search ships behind the global_search flag. Nothing about the surfaces it searches has changed."
            hint="flag: global_search"
          />
        ) : q.trim().length < 2 ? (
          <EmptyState
            title="Type at least two characters"
            description="Search matches on names, subjects and titles. It is not fuzzy: it finds what contains what you typed."
          />
        ) : data.groups.length === 0 ? (
          <NoRows label={`Nothing matches “${q}”.`} />
        ) : (
          <div className="space-y-3">
            {data.groups.map((group) => (
              <Panel
                key={group.id}
                title={group.label}
                level="supporting"
                meta={group.capped ? `${group.hits.length}+ matches` : `${group.hits.length}`}
              >
                <ul className="divide-y divide-border">
                  {group.hits.map((hit) => (
                    <li key={`${group.id}-${hit.id}`} className="px-3 py-2">
                      <Link
                        // The server hands back route + params as data rather
                        // than a URL string, so the router stays the only thing
                        // that builds links.
                        to={hit.to as never}
                        params={hit.params as never}
                        search={hit.search as never}
                        className="text-[13px] font-medium hover:underline"
                      >
                        {hit.title}
                      </Link>
                      {hit.detail ? (
                        <p className="text-[12px] text-muted-foreground">{hit.detail}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {group.capped ? (
                  <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                    More than {group.hits.length} match — narrow the term to see the rest.
                  </p>
                ) : null}
              </Panel>
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
