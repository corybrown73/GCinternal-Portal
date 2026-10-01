import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, Check, Clock, TriangleAlert } from "lucide-react";

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

function HomePage() {
  const { param } = useScope();
  const { profile } = useProfile();
  const { data } = useSuspenseQuery(homeQuery(param));
  const inbox = useQuery(dealInboxQuery(param));
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
  });

  return (
    <>
      <PageHeader
        size="lg"
        title="Today"
        description="What needs my attention, and what's coming up."
        hero={{ tagline: "Progress builds momentum." }}
      />
      <PageBody className="space-y-4">
        <Tiles t={today} />
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-4">
            <NeedsMe rows={today.needsMe} watch={today.watch} />
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

function Tiles({ t }: { t: Today }) {
  const tiles: Array<{
    label: string;
    sub: string;
    value: number;
    tone: Tone;
    icon: typeof TriangleAlert;
  }> = [
    {
      label: "Need attention",
      sub: "Action required",
      value: t.tiles.needAttention,
      tone: "critical",
      icon: TriangleAlert,
    },
    {
      label: "Waiting on",
      sub: "Customer or internal",
      value: t.tiles.waitingOn,
      tone: "warning",
      icon: Clock,
    },
    {
      label: "Upcoming",
      sub: "Next 7 days",
      value: t.tiles.upcoming,
      tone: "info",
      icon: CalendarDays,
    },
    {
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
        return (
          <div
            key={tile.label}
            className={cn("flex items-center gap-3 rounded-lg px-4 py-3.5", wash[tile.tone])}
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
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- needs me */

function NeedsMe({ rows, watch }: { rows: NeedsMeRow[]; watch: NeedsMeRow[] }) {
  return (
    <section className="rounded-lg border border-border bg-card" aria-label="What needs me">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3.5">
        <div>
          <h2 className="flex items-center gap-2 text-[16px] font-semibold">
            What needs me
            <span className="rounded-full bg-[#fde8e6] px-2 py-px text-[11px] font-semibold text-[#b42318]">
              {rows.length}
            </span>
          </h2>
          <p className="text-[12px] text-muted-foreground">
            Accounts that need my attention right now.
          </p>
        </div>
        <Link
          to="/customers"
          search={{ sort: "days", dir: "desc" }}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12px] hover:bg-muted"
        >
          View all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 pt-4 text-[13px] text-muted-foreground">
          Nothing needs action right now.
        </p>
      ) : (
        <Rows rows={rows} />
      )}
      {watch.length ? (
        <>
          <div className="flex items-baseline gap-2 border-t border-border px-4 pt-3">
            <h3 className="text-[13px] font-semibold">Keep an eye on</h3>
            <span className="rounded-full bg-[#fff1d6] px-2 py-px text-[11px] font-semibold text-[#93500a]">
              {watch.length}
            </span>
            <span className="text-[12px] text-muted-foreground">
              Nothing to do today; worth a look this week.
            </span>
          </div>
          <Rows rows={watch} />
        </>
      ) : null}
    </section>
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

function MyBook({ t }: { t: Today }) {
  const parts: Array<{ label: string; value: number; color: string }> = [
    { label: "Need attention", value: t.book.needAttention, color: "#d03b3b" },
    { label: "Waiting on", value: t.book.waitingOn, color: "#fab219" },
    { label: "Moving", value: t.book.moving, color: "#2a78d6" },
    { label: "Launching", value: t.book.launching, color: "#4a3aa7" },
  ];
  return (
    <section className="rounded-lg border border-border bg-card px-4 py-3.5" aria-label="My book">
      <div className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold">
          My book
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
      <div className="mt-3 flex items-center gap-4">
        <Donut parts={parts} total={t.book.total} />
        <ul className="min-w-0 flex-1 space-y-1.5">
          {parts.map((p) => (
            <li key={p.label} className="flex items-center gap-2 text-[12px]">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              <span className="w-5 text-right font-semibold tabular-nums">{p.value}</span>
              <span className="text-muted-foreground">{p.label}</span>
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
  const size = 132;
  const r = 50;
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
        strokeWidth={14}
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
                  strokeWidth={14}
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
