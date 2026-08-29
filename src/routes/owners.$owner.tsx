import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, X } from "lucide-react";

import { AccountRowList } from "@/components/account-rows";
import { PageBody, PageHeader } from "@/components/page";
import { NoRows, Panel } from "@/components/record";
import { getLeadership } from "@/lib/hub.functions";
import { fmtMoney } from "@/lib/hub-format";
import { ownerPortfolio, type OwnerAccountRow } from "@/lib/leadership";
import { cn } from "@/lib/utils";

const leadershipQuery = queryOptions({
  queryKey: ["leadership"],
  queryFn: () => getLeadership(),
});

export const Route = createFileRoute("/owners/$owner")({
  head: ({ params }) => {
    const owner = decodeURIComponent(params.owner);
    const title = `${owner} — Owner portfolio | Implementation Hub`;
    const description = `What ${owner} is carrying: active implementations, ARR represented, accounts needing intervention, blocked and at-risk work.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(leadershipQuery);
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load this owner portfolio: {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-6 text-[13px] text-muted-foreground">Owner not found.</div>
  ),
  component: OwnerPortfolioPage,
});

type OwnerFilterId = "intervention" | "blocked" | "at_risk" | "on_track";

const OWNER_FILTER_LABEL: Record<OwnerFilterId, string> = {
  intervention: "Needs intervention",
  blocked: "Blocked",
  at_risk: "At risk",
  on_track: "On track",
};

const matchesOwnerFilter = (account: OwnerAccountRow, filter: OwnerFilterId) =>
  filter === "intervention" ? !!account.intervention : account.health === filter;

function Metric({
  label,
  value,
  tone,
  active,
  onSelect,
}: {
  label: string;
  value: string | number;
  tone?: "bad" | "warn" | "good" | "muted";
  active?: boolean;
  onSelect?: () => void;
}) {
  const body = (
    <>
      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 font-mono text-[18px] font-semibold leading-none",
          tone === "bad" && "text-status-blocked-foreground",
          tone === "warn" && "text-status-risk-foreground",
          tone === "good" && "text-status-on-track-foreground",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </p>
    </>
  );
  const base = "min-w-0 rounded-md border border-border bg-card px-3 py-2 text-left";

  if (!onSelect) return <div className={base}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={!!active}
      className={cn(
        base,
        "transition-colors hover:border-foreground/30 hover:bg-muted/50",
        active && "border-foreground/60 bg-secondary ring-1 ring-foreground/20",
      )}
    >
      {body}
    </button>
  );
}

function OwnerPortfolioPage() {
  const { owner: ownerParam } = Route.useParams();
  const owner = decodeURIComponent(ownerParam);
  const { data } = useSuspenseQuery(leadershipQuery);
  const portfolio = ownerPortfolio(data, owner);
  const [filter, setFilter] = useState<OwnerFilterId | null>(null);

  if (!portfolio) {
    return (
      <>
        <PageHeader
          title={owner}
          description="No implementations are recorded against this person."
        />
        <PageBody>
          <Panel title="What this person is carrying">
            <NoRows label="Nothing is currently assigned to this person." />
          </Panel>
        </PageBody>
      </>
    );
  }

  const accounts = filter
    ? portfolio.accounts.filter((a) => matchesOwnerFilter(a, filter))
    : portfolio.accounts;

  const toggle = (id: OwnerFilterId) => setFilter((cur) => (cur === id ? null : id));

  return (
    <>
      <PageHeader
        title={portfolio.owner}
        description="What this person is carrying and where they need help. Open a row for the full record."
        actions={
          <Link
            to="/portfolio"
            className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={2} />
            Leadership
          </Link>
        }
      />
      <PageBody className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Active implementations" value={portfolio.implementations} />
          <Metric
            label="ARR they cover"
            value={portfolio.arr != null ? fmtMoney(portfolio.arr) : "—"}
            tone="muted"
          />
          <Metric
            label="Needs intervention"
            value={portfolio.intervention_count}
            tone={portfolio.intervention_count ? "bad" : "good"}
            active={filter === "intervention"}
            onSelect={() => toggle("intervention")}
          />
          <Metric
            label="Blocked"
            value={portfolio.blocked}
            tone={portfolio.blocked ? "bad" : "muted"}
            active={filter === "blocked"}
            onSelect={() => toggle("blocked")}
          />
          <Metric
            label="At risk"
            value={portfolio.at_risk}
            tone={portfolio.at_risk ? "warn" : "muted"}
            active={filter === "at_risk"}
            onSelect={() => toggle("at_risk")}
          />
          <Metric
            label="On track"
            value={portfolio.on_track}
            tone="good"
            active={filter === "on_track"}
            onSelect={() => toggle("on_track")}
          />
        </div>

        <Panel
          title={filter ? `Accounts · ${OWNER_FILTER_LABEL[filter]}` : "Accounts"}
          count={accounts.length}
          meta={
            filter ? (
              <span className="flex items-center gap-2">
                <span>
                  Filtered to {OWNER_FILTER_LABEL[filter].toLowerCase()} — same derivation that
                  produced the card count
                </span>
                <button
                  type="button"
                  onClick={() => setFilter(null)}
                  className="flex shrink-0 items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] hover:border-foreground/40 hover:text-foreground"
                >
                  <X className="h-3 w-3" strokeWidth={2} />
                  Clear filter
                </button>
              </span>
            ) : (
              "Accounts needing help first · every figure comes from the saved record"
            )
          }
        >
          <AccountRowList
            accounts={accounts}
            emptyLabel={
              filter
                ? `No ${OWNER_FILTER_LABEL[filter].toLowerCase()} accounts for this owner.`
                : "No accounts recorded for this owner."
            }
          />
        </Panel>
      </PageBody>
    </>
  );
}
