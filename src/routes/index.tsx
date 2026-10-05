import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, Check, ChevronRight, Clock, TriangleAlert } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { SalesHome } from "@/components/home-sales";
import { useProfile } from "@/lib/auth";
import { homeVariantFor } from "@/lib/roles";
import { useScope } from "@/lib/use-scope";
import { getHome } from "@/lib/hub.functions";
import { getDealInbox } from "@/lib/presale.functions";
import { buildQueue, healthByImplementation } from "@/lib/home-triage";
import { todayFor, type NeedsMeRow, type Today, type Tone } from "@/lib/home-today";
import { localIso } from "@/lib/onboarding-timeline";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// The scope is part of the key: switching whose accounts you are looking at
// has to refetch, and two scopes must never share a cache entry.
const homeQuery = (scope: string | null) =>
  queryOptions({
    queryKey: ["home", scope],
    queryFn: () => getHome({ data: scope ? { scope } : {} }),
  });

const dealInboxQuery = (scope: string | null) =>
  queryOptions({
    queryKey: ["deal-inbox", scope],
    queryFn: () => getDealInbox({ data: scope ? { scope } : {} }),
  });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today — What needs my attention | GoCanvas Handoff Hub" },
      {
        name: "description",
        content:
          "What needs my attention, what I am waiting on, what is coming up, and where every account sits.",
      },
      { property: "og:title", content: "Today — What needs my attention | GoCanvas Handoff Hub" },
      {
        property: "og:description",
        content: "The daily working list for the onboarding and implementation team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { scope?: string } =>
    typeof search["scope"] === "string" ? { scope: search["scope"] as string } : {},
  loaderDeps: ({ search }: { search: { scope?: string } }) => ({ scope: search.scope ?? null }),
  loader: ({ context, deps }) => {
    void context.queryClient.prefetchQuery(dealInboxQuery(deps.scope));
    return context.queryClient.ensureQueryData(homeQuery(deps.scope));
  },
  component: HomePage,
});

/* ------------------------------------------------------------------ tones */

const TONE_TEXT: Record<Tone, string> = {
  critical: "text-[#b42318]",
  warning: "text-[#93500a]",
  info: "text-[#1c5cab]",
  good: "text-[#006300]",
  muted: "text-muted-foreground",
};
const TONE_CHIP: Record<Tone, string> = {
  critical: "bg-[#fde8e6] text-[#b42318]",
  warning: "bg-[#fff1d6] text-[#93500a]",
  info: "bg-[#e3eefc] text-[#1c5cab]",
  good: "bg-[#e3f5e3] text-[#006300]",
  muted: "bg-muted text-muted-foreground",
};
const TONE_BAR: Record<Tone, string> = {
  critical: "bg-[#d03b3b]",
  warning: "bg-[#fab219]",
  info: "bg-[#2a78d6]",
  good: "bg-[#0ca30c]",
  muted: "bg-border",
};

/* ------------------------------------------------------------------- page */

/** The four summary cards — each key names exactly the tile/row population it toggles. */
type CardKey = "need_attention" | "waiting_on" | "upcoming" | "on_track";

function HomePage() {
  const { param } = useScope();
  const { profile } = useProfile();
  const { data } = useSuspenseQuery(homeQuery(param));
  const inbox = useQuery(dealInboxQuery(param));
  // Clicking a summary card filters the account list below; the same card
  // again, or "Clear filter", clears it. Local UI state only — it never
  // changes what a card counts, only which of today's already-computed
  // rows are shown. A scope change (useScope) re-fetches `data` and rebuilds
  // `today` from scratch; this state is untouched by that and simply
  // re-applies to the new, re-scoped rows.
  const [filter, setFilter] = useState<CardKey | null>(null);
  // A seller's Home is their deals and their handoffs, not the
  // implementation day. Same route, same scope; a different page.
  if (homeVariantFor(profile?.role) === "sales") return <SalesHome />;
  const queue = buildQueue(data.implementations, data.triage);
  const health = healthByImplementation(data.implementations, data.triage);
  const today = todayFor({
    queue,
    health,
    dealInbox: inbox.data ?? [],
    commitments: data.commitments,
    today: localIso(),
    viewerName: profile?.full_name ?? null,
  });

  // The exact rows each card's own count is made of — reused, never a
  // second definition of any bucket.
  const cardRows: Record<CardKey, { label: string; rows: NeedsMeRow[] }> = {
    need_attention: { label: "Need attention", rows: today.needsMe },
    waiting_on: { label: "Waiting on someone", rows: today.waitingOnRows },
    upcoming: { label: "Upcoming", rows: today.upcomingRows },
    on_track: { label: "On track", rows: today.onTrackRows },
  };
  const toggleFilter = (key: CardKey) => setFilter((f) => (f === key ? null : key));

  return (
    <>
      <PageHeader
        size="lg"
        title="Today"
        description="What needs my attention, and what's coming up."
        hero={{ tagline: "Progress builds momentum." }}
      />
      <PageBody className="space-y-4">
        <Tiles t={today} active={filter} onToggle={toggleFilter} />
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-4">
            <NeedsMe
              rows={today.needsMe}
              watch={today.watch}
              activeFilter={filter ? cardRows[filter] : null}
              onClearFilter={() => setFilter(null)}
            />
            <ComingUp t={today} />
          </div>
          <div className="space-y-4">
            <MyBook t={today} />
            <Stages t={today} />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {data.scope.mode === "all"
            ? "Showing every account. Use the scope control in the top bar to narrow to one person's."
            : "Showing a subset. Use the scope control in the top bar to see every account."}
        </p>
      </PageBody>
    </>
  );
}

/* ------------------------------------------------------------------ tiles */

function Tiles({
  t,
  active,
  onToggle,
}: {
  t: Today;
  active: CardKey | null;
  onToggle: (key: CardKey) => void;
}) {
  const tiles: Array<{
    key: CardKey;
    label: string;
    sub: string;
    value: number;
    tone: Tone;
    icon: typeof TriangleAlert;
  }> = [
    {
      key: "need_attention",
      label: "Need attention",
      sub: "Action required",
      value: t.tiles.needAttention,
      tone: "critical",
      icon: TriangleAlert,
    },
    {
      key: "waiting_on",
      label: "Waiting on someone",
      sub: "Customer or internal",
      value: t.tiles.waitingOn,
      tone: "warning",
      icon: Clock,
    },
    {
      key: "upcoming",
      label: "Upcoming",
      sub: "Next 7 days",
      value: t.tiles.upcoming,
      tone: "info",
      icon: CalendarDays,
    },
    {
      key: "on_track",
      label: "On track",
      sub: "No immediate action",
      value: t.tiles.onTrack,
      tone: "good",
      icon: Check,
    },
  ];
  const wash: Record<Tone, string> = {
    critical: "bg-[#fdeceb]",
    warning: "bg-[#fff6e5]",
    info: "bg-[#eaf2fc]",
    good: "bg-[#f1f7f1]",
    muted: "bg-muted",
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        const isActive = active === tile.key;
        return (
          <button
            key={tile.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(tile.key)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-4 py-3.5 text-left transition-shadow",
              wash[tile.tone],
              isActive ? "ring-2 ring-offset-1 ring-foreground/30" : "ring-1 ring-transparent",
            )}
          >
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/80",
                TONE_TEXT[tile.tone],
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[26px] font-semibold leading-none tracking-tight">{tile.value}</p>
              <p className="mt-1 text-[13px] font-medium leading-tight">{tile.label}</p>
              <p className="text-[11px] text-muted-foreground">{tile.sub}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- needs me */

function NeedsMe({
  rows,
  watch,
  activeFilter,
  onClearFilter,
}: {
  rows: NeedsMeRow[];
  watch: NeedsMeRow[];
  /** Set when a summary card is selected — shown inside the same "Needs
   * attention" section, in place of its default rows. */
  activeFilter: { label: string; rows: NeedsMeRow[] } | null;
  onClearFilter: () => void;
}) {
  // Default expanded; a filter always forces it open (results must stay
  // immediately visible), overriding a prior manual collapse. The toggle
  // itself is hidden while filtered so clicking it can't silently flip the
  // underlying state and surprise-collapse the section once the filter clears.
  const [needsAttentionOpen, setNeedsAttentionOpen] = useState(true);
  const [watchOpen, setWatchOpen] = useState(false);
  const isOpen = activeFilter ? true : needsAttentionOpen;

  const heading = activeFilter ? activeFilter.label : "Needs attention";
  const count = activeFilter ? activeFilter.rows.length : rows.length;
  const bodyRows = activeFilter ? activeFilter.rows : rows;
  const emptyMessage = activeFilter
    ? "No accounts match this filter."
    : "Nothing needs action right now.";

  return (
    <section
      className="rounded-lg border border-border bg-card"
      aria-label={activeFilter ? "Filtered accounts" : "What needs me"}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3.5">
        {activeFilter ? (
          <h2 className="flex items-center gap-2 text-[16px] font-semibold">
            {heading}
            <span className="rounded-full bg-muted px-2 py-px text-[11px] font-semibold text-muted-foreground">
              {count}
            </span>
          </h2>
        ) : (
          <button
            type="button"
            onClick={() => setNeedsAttentionOpen((o) => !o)}
            aria-expanded={isOpen}
            aria-controls="needs-attention-panel"
            className="flex items-center gap-2 text-left text-[16px] font-semibold"
          >
            <ChevronRight
              className={cn("h-4 w-4 shrink-0 text-muted-foreground", isOpen && "rotate-90")}
            />
            {heading}
            <span className="rounded-full bg-[#fde8e6] px-2 py-px text-[11px] font-semibold text-[#b42318]">
              {count}
            </span>
          </button>
        )}
        {activeFilter ? (
          <button
            type="button"
            onClick={onClearFilter}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12px] hover:bg-muted"
          >
            Clear filter
          </button>
        ) : (
          <Link
            to="/customers"
            search={{ sort: "days", dir: "desc" }}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12px] hover:bg-muted"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      {!activeFilter ? (
        <p className="px-4 pb-1 text-[12px] text-muted-foreground">
          Things that need intervention across the accounts you're viewing.
        </p>
      ) : (
        <p className="px-4 pb-1 text-[12px] text-muted-foreground">
          Filtered from the summary cards above.
        </p>
      )}
      {isOpen ? (
        <div id="needs-attention-panel">
          {bodyRows.length === 0 ? (
            <p className="px-4 pb-3.5 pt-3 text-[13px] text-muted-foreground">{emptyMessage}</p>
          ) : activeFilter ? (
            // Keyed by the active filter's label (unique per card) so
            // switching cards — or clearing back to the unfiltered view,
            // which unmounts this entirely — always starts from the
            // collapsed, first-5 state. Same ranked/filtered `rows` either
            // way; this only caps how many are shown at once.
            <FilteredRows key={activeFilter.label} rows={bodyRows} />
          ) : (
            <Rows rows={bodyRows} />
          )}
        </div>
      ) : null}
      {!activeFilter && watch.length ? (
        <div className="border-t border-border">
          <button
            type="button"
            onClick={() => setWatchOpen((o) => !o)}
            aria-expanded={watchOpen}
            aria-controls="keep-an-eye-on-panel"
            className="flex w-full items-baseline gap-2 px-4 py-3 text-left"
          >
            <ChevronRight
              className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", watchOpen && "rotate-90")}
            />
            <h3 className="text-[13px] font-semibold">Keep an eye on</h3>
            <span className="rounded-full bg-[#fff1d6] px-2 py-px text-[11px] font-semibold text-[#93500a]">
              {watch.length}
            </span>
            <span className="text-[12px] text-muted-foreground">
              Nothing to do today; worth a look this week.
            </span>
          </button>
          {watchOpen ? (
            <div id="keep-an-eye-on-panel">
              <Rows rows={watch} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const MAX_INITIAL_FILTERED_ROWS = 5;

/**
 * Caps a filtered result at 5 rows with a "Show N more" / "Show less"
 * toggle. The caller remounts this (via `key`) whenever the active filter
 * changes or clears, which is what resets `expanded` back to its initial
 * state — no effect needed. Never reorders `rows`: the first 5 are simply
 * the first 5 of the already-ranked, already-filtered list.
 */
function FilteredRows({ rows }: { rows: NeedsMeRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, MAX_INITIAL_FILTERED_ROWS);
  const hiddenCount = rows.length - visible.length;
  return (
    <>
      <Rows rows={visible} />
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="block w-full px-4 py-2 text-left text-[12px] font-medium text-primary hover:underline"
        >
          Show {hiddenCount} more
        </button>
      ) : expanded && rows.length > MAX_INITIAL_FILTERED_ROWS ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="block w-full px-4 py-2 text-left text-[12px] font-medium text-muted-foreground hover:underline"
        >
          Show less
        </button>
      ) : null}
    </>
  );
}

function Rows({ rows }: { rows: NeedsMeRow[] }) {
  return (
    <ul className="space-y-2 p-3">
      {rows.map((r) => (
        <li
          key={`${r.kind}:${r.id}`}
          className="grid grid-cols-1 items-center gap-x-4 gap-y-2 rounded-md border border-border px-3 py-2.5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto_auto]"
          style={{
            boxShadow: `inset 3px 0 0 0 ${r.chip.tone === "critical" ? "#d03b3b" : r.chip.tone === "warning" ? "#fab219" : "#2a78d6"}`,
          }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
                TONE_CHIP[r.chip.tone],
              )}
            >
              {r.initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold">{r.name}</p>
              <p className="truncate text-[12px] text-muted-foreground">{r.sub}</p>
              {r.meta ? (
                <p className="truncate text-[11px] text-muted-foreground">{r.meta}</p>
              ) : null}
            </div>
          </div>
          <div className="min-w-0">
            <span
              className={cn(
                "inline-block rounded-sm px-1.5 py-px text-[11px] font-medium",
                TONE_CHIP[r.chip.tone],
              )}
            >
              {r.chip.label}
            </span>
            <p className="mt-1 text-[13px]">{r.reason}</p>
            {r.detail ? <p className="text-[12px] text-muted-foreground">{r.detail}</p> : null}
          </div>
          <div className="min-w-0 md:border-l md:border-border md:pl-4">
            <p className="text-[11px] text-muted-foreground">Next step</p>
            <p className="text-[13px]">{r.nextStep ?? "—"}</p>
          </div>
          <div className="md:border-l md:border-border md:pl-4">
            <p className="text-[11px] text-muted-foreground">Due</p>
            {r.due ? (
              <span
                className={cn(
                  "inline-block rounded-sm px-1.5 py-px text-[12px] font-medium",
                  TONE_CHIP[r.due.tone],
                )}
              >
                {r.due.label}
              </span>
            ) : (
              <span className="text-[12px] text-muted-foreground">—</span>
            )}
          </div>
          {"customerId" in r.link ? (
            <Link
              to="/customers/$customerId"
              params={{ customerId: r.link.customerId }}
              search={r.link.implementationId ? { impl: r.link.implementationId } : {}}
              className="inline-flex items-center gap-1 justify-self-end rounded-md border border-border px-3 py-1.5 text-[12px] font-medium hover:bg-muted"
            >
              Open <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <Link
              to="/deals/$dealId"
              params={{ dealId: r.link.dealId }}
              className="inline-flex items-center gap-1 justify-self-end rounded-md border border-border px-3 py-1.5 text-[12px] font-medium hover:bg-muted"
            >
              Open <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------- coming up */

const KIND_DOT: Record<"meeting" | "commitment" | "launch", string> = {
  meeting: "bg-[#2a78d6]",
  commitment: "bg-[#eda100]",
  launch: "bg-[#4a3aa7]",
};

function ComingUp({ t }: { t: Today }) {
  const total = t.comingUp.reduce((n, g) => n + g.events.length, 0);
  return (
    <section className="rounded-lg border border-border bg-card" aria-label="Coming up">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3.5">
        <div>
          <h2 className="flex items-center gap-2 text-[16px] font-semibold">
            Coming up
            <span className="rounded-full bg-muted px-2 py-px text-[11px] font-semibold text-muted-foreground">
              {total}
            </span>
          </h2>
          <p className="text-[12px] text-muted-foreground">Key dates this week and next.</p>
        </div>
        <Link
          to="/calendar"
          className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
        >
          View full calendar <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {t.comingUp.map((g) => (
          <div key={g.key} className="min-h-[120px] rounded-md border border-border px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <p className="text-[13px] font-semibold">{g.title}</p>
                {g.sub ? <p className="text-[11px] text-muted-foreground">{g.sub}</p> : null}
              </div>
              <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
                {g.events.length}
              </span>
            </div>
            <ul className="mt-2 space-y-2">
              {g.events.slice(0, 3).map((e) => (
                <li key={e.key} className="flex items-start gap-2 text-[12px]">
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", KIND_DOT[e.kind])} />
                  <span className="min-w-0">
                    {"customerId" in e.link ? (
                      <Link
                        to="/customers/$customerId"
                        params={{ customerId: e.link.customerId }}
                        search={e.link.implementationId ? { impl: e.link.implementationId } : {}}
                        className="block truncate font-medium hover:underline"
                      >
                        {e.label}
                      </Link>
                    ) : (
                      <span className="block truncate font-medium">{e.label}</span>
                    )}
                    <span className="block truncate text-muted-foreground">
                      {e.account}
                      {e.time ? ` · ${e.time}` : ""}
                      {g.key === "next-week"
                        ? ` · ${new Date(`${e.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}`
                        : ""}
                    </span>
                  </span>
                </li>
              ))}
              {g.events.length > 3 ? (
                <li className="text-[11px] text-primary">+{g.events.length - 3} more</li>
              ) : null}
              {g.events.length === 0 ? (
                <li className="text-[11px] text-muted-foreground">Nothing scheduled</li>
              ) : null}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- my book */

/** Plain-language label + a one-line definition, display only — no bucket, count or data-source change. */
const MY_BOOK_HELP = "Your book includes the implementations you own or are actively involved in.";

function MyBook({ t }: { t: Today }) {
  const parts: Array<{ label: string; value: number; color: string; help: string }> = [
    {
      label: "Needs attention",
      value: t.book.needAttention,
      color: "#d03b3b",
      help: "Something needs action or is off track.",
    },
    {
      label: "Waiting on someone",
      value: t.book.waitingOn,
      color: "#fab219",
      help: "Someone else needs to do something before work can move forward.",
    },
    {
      label: "On track",
      value: t.book.moving,
      color: "#2a78d6",
      help: "Nothing needs attention right now.",
    },
    {
      label: "Going live",
      value: t.book.launching,
      color: "#4a3aa7",
      help: "The customer is at or approaching go-live.",
    },
  ];
  return (
    <section className="rounded-lg border border-border bg-card px-4 py-3.5" aria-label="My book">
      <div className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold">
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="underline-offset-2 hover:underline">
                My book
              </button>
            </TooltipTrigger>
            <TooltipContent>{MY_BOOK_HELP}</TooltipContent>
          </Tooltip>
          <span className="rounded-full bg-muted px-2 py-px text-[11px] font-semibold text-muted-foreground">
            {t.book.total}
          </span>
        </h2>
        <Link
          to="/customers"
          search={{ sort: "days", dir: "desc" }}
          className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
        >
          View all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Donut parts={parts} total={t.book.total} />
        <ul className="min-w-0 flex-1 space-y-1.5">
          {parts.map((p) => (
            <li key={p.label} className="flex items-center gap-1.5 text-[12px]">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              <span className="w-5 text-right font-semibold tabular-nums">{p.value}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="whitespace-nowrap text-muted-foreground underline-offset-2 hover:underline"
                  >
                    {p.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{p.help}</TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * A donut: one ring, a 2px surface gap between segments, the total in the
 * middle. The legend beside it carries the counts, so the colour never
 * carries the meaning alone.
 */
function Donut({
  parts,
  total,
}: {
  parts: Array<{ label: string; value: number; color: string }>;
  total: number;
}) {
  const size = 108;
  const r = 41;
  const c = 2 * Math.PI * r;
  const gap = total > 1 ? 3 : 0;
  let offset = 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${total} accounts`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-muted)"
        strokeWidth={12}
      />
      {total > 0
        ? parts
            .filter((p) => p.value > 0)
            .map((p) => {
              const len = (p.value / total) * c;
              const el = (
                <circle
                  key={p.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={12}
                  strokeDasharray={`${Math.max(0, len - gap)} ${c - Math.max(0, len - gap)}`}
                  strokeDashoffset={-offset}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                >
                  <title>
                    {p.label}: {p.value}
                  </title>
                </circle>
              );
              offset += len;
              return el;
            })
        : null}
      <text
        x="50%"
        y="47%"
        textAnchor="middle"
        className="fill-foreground"
        fontSize="26"
        fontWeight="600"
      >
        {total}
      </text>
      <text x="50%" y="62%" textAnchor="middle" className="fill-muted-foreground" fontSize="11">
        Accounts
      </text>
    </svg>
  );
}

/* ----------------------------------------------------------------- stages */

const STAGE_TONE: Record<string, Tone> = {
  negotiate: "muted",
  closed_won: "muted",
  field_fusion_setup: "info",
  onboarding_kickoff: "info",
  get_it_working: "warning",
  make_it_yours: "warning",
  make_it_run: "warning",
  onboarding_complete: "good",
};

function Stages({ t }: { t: Today }) {
  return (
    <section
      className="rounded-lg border border-border bg-card px-4 py-3.5"
      aria-label="Implementation stages"
    >
      <h2 className="text-[16px] font-semibold">Implementation stages</h2>
      <ul className="mt-3 space-y-2.5">
        {t.stages.map((s) => (
          <li
            key={s.key}
            className="grid grid-cols-[92px_minmax(0,1fr)_28px_36px] items-center gap-2 text-[12px]"
          >
            <span className="truncate">{s.label}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-muted">
              <span
                className={cn("block h-full rounded-full", TONE_BAR[STAGE_TONE[s.key] ?? "info"])}
                style={{ width: `${Math.max(s.pct, s.count ? 4 : 0)}%` }}
              />
            </span>
            <span className="text-right font-semibold tabular-nums">{s.count}</span>
            <span className="text-right text-muted-foreground tabular-nums">{s.pct}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
