import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";

import { attachmentsQuery } from "@/components/attachments-panel";
import { CARD, TONE } from "@/components/current-implementation-context";
import { StatusChip } from "@/components/record";
import { deriveHealth } from "@/lib/customer360-derive";
import { contactRoleLabel } from "@/lib/customer-contact-input";
import { dealQuery } from "@/lib/deal-query";
import {
  initials,
  internalOwners,
  partnerSnapshot,
  servicesFor,
  splitContacts,
  standardSnapshot,
  type DateTile,
  type Impl,
  type NextLine,
  type SnapshotModel,
  type Tone,
} from "@/lib/customer-overview";
import { fmtDate, fmtMoney } from "@/lib/hub-format";
import type { Customer360 } from "@/lib/hub-types";
import { getPartnerProgress } from "@/lib/hub.functions";
import { isPartnerJourney } from "@/lib/partner-implementation";
import { getParkingLot } from "@/lib/parking-lot.functions";
import { SOLUTION_LABEL } from "@/lib/onboarding-services";
import { localIso } from "@/lib/onboarding-timeline";
import { GRADUATION_BRIEF_TITLE } from "@/lib/stage-flow";
import { getWelcome } from "@/lib/welcome.functions";
import { cn } from "@/lib/utils";

/**
 * The Customer 360 Overview: the account's home base. It shows what the
 * customer is, where the implementation stands, who is involved and what was
 * bought. It is read-only. Every task, stage move and edit lives on Current
 * Implementation (the link on the snapshot) or on Details.
 *
 * The values and rules live in src/lib/customer-overview.ts. This file lays
 * them out, using the Hub's own cards, tones and status chips.
 */

type Health = ReturnType<typeof deriveHealth>;

export function CustomerOverview({
  record,
  customerId,
}: {
  record: Customer360;
  customerId: string;
}) {
  const impl = record.implementation;
  if (!impl) return null;
  return (
    <div className="space-y-3">
      <CustomerProfile record={record} impl={impl} />
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <ImplementationSnapshot record={record} impl={impl} customerId={customerId} />
        <KeyPeople record={record} impl={impl} customerId={customerId} />
      </div>
      <ProductsAndSow impl={impl} />
    </div>
  );
}

/* ---------------------------------------------------------------- Profile */

function CustomerProfile({ record, impl }: { record: Customer360; impl: Impl }) {
  const { customer } = record;
  return (
    <section className={cn(CARD, "px-4 py-3.5")} aria-label="Customer profile">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[16px] font-semibold">Customer profile</h2>
        <p className="text-[12px] text-muted-foreground">
          Applies to every implementation for this customer
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
        <Fact label="Industry" value={customer.industry} />
        <Fact label="Segment" value={customer.segment} />
        <Fact label="Customer ARR" value={customer.arr == null ? null : fmtMoney(customer.arr)} />
        <Fact label="Account sales owner" value={impl.sales_owner} />
      </dl>
    </section>
  );
}

/* --------------------------------------------------------------- Snapshot */

function ImplementationSnapshot({
  record,
  impl,
  customerId,
}: {
  record: Customer360;
  impl: Impl;
  customerId: string;
}) {
  const partner = isPartnerJourney(impl);
  const dealId = impl.deal_id;
  // The same reads Current Implementation makes, under the same keys, so a
  // page already open on that tab serves them from cache.
  const deal = useQuery({ ...dealQuery(dealId ?? ""), enabled: Boolean(dealId) });
  const parking = useQuery({
    queryKey: ["parking-lot", dealId],
    queryFn: () => getParkingLot({ data: { dealId: dealId ?? "" } }),
    enabled: Boolean(dealId) && !partner,
  });
  const welcome = useQuery({
    queryKey: ["welcome", dealId],
    queryFn: () => getWelcome({ data: { dealId: dealId ?? "" } }),
    enabled: Boolean(dealId) && !partner,
  });
  const files = useQuery({ ...attachmentsQuery(impl.id), enabled: Boolean(dealId) && !partner });
  const partnerQ = useQuery({
    queryKey: ["partner-progress", impl.id],
    queryFn: () => getPartnerProgress({ data: { implementationId: impl.id } }),
    enabled: partner,
  });
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(localIso()), []);

  const health = deriveHealth(record, impl);
  const model: SnapshotModel = partner
    ? partnerSnapshot(impl, partnerQ.data ?? null, {
        loading: partnerQ.isPending,
        failed: partnerQ.isError,
      })
    : standardSnapshot({
        impl,
        deal: deal.data ?? null,
        today: today ?? localIso(),
        parkingLot: parking.data ?? [],
        homeworkDone: welcome.data?.homeworkDone ?? {},
        link: welcome.data
          ? { sharedAt: welcome.data.sharedAt ?? null, openedAt: welcome.data.openedAt ?? null }
          : null,
        hasGraduationBrief: (files.data ?? []).some(
          (f) => f.kind === "doc" && f.title === GRADUATION_BRIEF_TITLE,
        ),
      });
  const subtitle = [impl.name, impl.deal_name].filter(Boolean).join(" · ");
  const bar = healthBar(health.level);

  return (
    <section
      className={cn(CARD, "px-4 py-3.5")}
      aria-label="Implementation snapshot"
      style={bar ? { boxShadow: `inset 3px 0 0 0 ${bar}` } : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold">Implementation snapshot</h2>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground" title={subtitle}>
            {subtitle}
          </p>
        </div>
        <Link
          to="/customers/$customerId"
          params={{ customerId }}
          search={{ tab: "implementation", impl: impl.id }}
          className="inline-flex max-w-full items-center gap-1 text-[13px] font-medium text-primary hover:underline"
        >
          Open Current Implementation
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <StageLine model={model} health={health.level} />
      {model.position ? (
        <ProgressTrack
          total={model.position.total}
          index={model.position.index}
          caption={model.caption}
        />
      ) : null}

      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Fact label="Implementation owner" value={model.owner} />
        <Fact label="Ball" value={model.ball ? <BallChip who={model.ball.who} /> : null} />
        <Fact label="Waiting on" value={<WaitingValue model={model} />} />
      </dl>

      {model.next ? <NextActionRow next={model.next} /> : null}
      <DateRow tiles={model.dates} />
    </section>
  );
}

function StageLine({ model, health }: { model: SnapshotModel; health: Health["level"] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <span className={cn("rounded-full px-2 py-px text-[12px] font-semibold", TONE.info.chip)}>
        {model.position
          ? `Stage ${model.position.index} of ${model.position.total}`
          : model.fallback}
      </span>
      {model.stageLabel ? (
        <span className="text-[18px] font-semibold leading-tight text-foreground">
          {model.stageLabel}
        </span>
      ) : null}
      <StatusChip status={health} />
    </div>
  );
}

function WaitingValue({ model }: { model: SnapshotModel }) {
  if (model.waitingText !== null) return <>{model.waitingText}</>;
  const [first, ...rest] = model.waiting;
  if (!first) return <>—</>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <WaitingWho who={first.who} />
      <span className="truncate" title={first.what}>
        {first.what}
      </span>
      {rest.length > 0 ? (
        <span className="shrink-0 text-[12px] font-normal text-muted-foreground">
          +{rest.length}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Segments for the journey, filled up to the current stage: finished stages in
 * the info tone, the current one in the primary tone, the rest muted. Read-only.
 */
function ProgressTrack({
  total,
  index,
  caption,
}: {
  total: number;
  index: number;
  caption: string | null;
}) {
  const after = total - index;
  return (
    <div className="mt-3">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
        role="img"
        aria-label={`Stage ${index} of ${total}`}
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full",
              i < index - 1 && "bg-[#2a78d6]",
              i === index - 1 && "bg-primary",
              i >= index && "bg-muted",
            )}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between gap-3 text-[12px] text-muted-foreground">
        <span>{caption ?? ""}</span>
        {after > 0 ? (
          <span className="shrink-0">
            {after} {after === 1 ? "stage" : "stages"} after this
          </span>
        ) : null}
      </div>
    </div>
  );
}

function NextActionRow({ next }: { next: NextLine }) {
  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-md bg-muted/50 px-3 py-2.5">
      <span
        className={cn(
          "mt-px shrink-0 rounded-full px-2 py-px text-[11px] font-semibold",
          TONE[next.tone].chip,
        )}
      >
        {next.label}
      </span>
      <p className="min-w-0 text-[14px] font-semibold leading-snug text-foreground">{next.text}</p>
    </div>
  );
}

function DateRow({ tiles }: { tiles: DateTile[] }) {
  return (
    <div
      className={cn(
        "mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2",
        tiles.length >= 4
          ? "lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]"
          : tiles.length === 3
            ? "lg:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))]"
            : "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]",
      )}
      aria-label="Important dates"
    >
      {tiles.map((t) => (
        <DateTileView key={t.key} tile={t} />
      ))}
    </div>
  );
}

function DateTileView({ tile }: { tile: DateTile }) {
  const tint =
    tile.tint === "unset"
      ? "border border-dashed border-border bg-transparent text-muted-foreground"
      : tile.tint === "soft"
        ? "bg-muted text-foreground"
        : TONE[tile.tint].chip;
  return (
    <div
      className={cn(
        "min-w-0 rounded-md px-3 py-2.5",
        tint,
        tile.featured && "col-span-2 lg:col-span-1",
      )}
    >
      <p className="text-[12px] font-semibold">{tile.label}</p>
      <p
        className={cn(
          "mt-0.5 break-words font-semibold tabular-nums",
          tile.featured ? "text-[16px]" : "text-[14px]",
          tile.tint === "unset" && "text-[13px] font-medium",
        )}
        title={tile.value}
      >
        {tile.value}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug opacity-80">{tile.hint}</p>
    </div>
  );
}

function BallChip({ who }: { who: "customer" | "us" }) {
  return (
    <span
      className={cn(
        "rounded-sm px-1.5 py-px text-[12px] font-medium",
        who === "customer" ? TONE.warning.chip : TONE.info.chip,
      )}
    >
      {who === "customer" ? "With the customer" : "With us"}
    </span>
  );
}

function WaitingWho({ who }: { who: "customer" | "gocanvas" }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-sm px-1.5 py-px text-[12px] font-medium",
        who === "customer" ? TONE.warning.chip : TONE.info.chip,
      )}
    >
      {who === "customer" ? "Customer" : "GoCanvas"}
    </span>
  );
}

/** The health bar on the card's left edge, drawn the way Current Implementation draws it. */
function healthBar(level: Health["level"]): string | null {
  if (level === "blocked") return TONE.critical.bar;
  if (level === "at_risk") return TONE.warning.bar;
  if (level === "on_track") return TONE.good.bar;
  return null;
}

/* ------------------------------------------------------------ Key people */

type Person = { key: string; name: string; sub: string; tone: Tone | "muted" };

function KeyPeople({
  record,
  impl,
  customerId,
}: {
  record: Customer360;
  impl: Impl;
  customerId: string;
}) {
  const { decision, working } = splitContacts(record.contacts ?? []);
  const team = internalOwners(
    impl,
    record.technical_solutions as Array<{ owner_name?: string | null }>,
  );
  const total = decision.length + working.length + team.length;

  const contactPerson = (c: (typeof decision)[number]): Person => ({
    key: c.id,
    name: c.name,
    sub: [contactRoleLabel(c.role) ?? c.role, c.email].filter(Boolean).join(" · "),
    tone: c.role === "exec_sponsor" ? "good" : c.role === "decision_maker" ? "info" : "muted",
  });

  return (
    <section className={cn(CARD, "px-4 py-3.5")} aria-label="Key people">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[16px] font-semibold">Key people</h2>
        {total > 0 ? (
          <span className={cn("rounded-full px-2 py-px text-[12px] font-semibold", TONE.info.chip)}>
            {total}
          </span>
        ) : null}
      </div>

      {decision.length + working.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">
          No contacts on file.{" "}
          <Link
            to="/customers/$customerId"
            params={{ customerId }}
            search={{ tab: "details", impl: impl.id }}
            className="font-medium text-primary hover:underline"
          >
            Add contacts in Details
          </Link>
        </p>
      ) : (
        <>
          <PeopleGroup label="Decision-makers" people={decision.map(contactPerson)} shown={2} />
          <PeopleGroup label="Working contacts" people={working.map(contactPerson)} shown={1} />
        </>
      )}

      {team.length > 0 ? (
        <div className="mt-4">
          <GroupLabel>Our team</GroupLabel>
          <PeopleList
            people={team.map((t) => ({ ...t, tone: t.key === "owner" ? "info" : "muted" }))}
          />
        </div>
      ) : null}
    </section>
  );
}

/** A group of people. The first `shown` are listed; the rest sit behind a disclosure. */
function PeopleGroup({ label, people, shown }: { label: string; people: Person[]; shown: number }) {
  if (people.length === 0) return null;
  const rest = people.slice(shown);
  return (
    <div className="mt-4 first:mt-3">
      <GroupLabel>{label}</GroupLabel>
      <PeopleList people={people.slice(0, shown)} />
      {rest.length > 0 ? (
        <details className="group mt-1.5">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium text-primary hover:underline">
            <ChevronRight
              className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90"
              aria-hidden
            />
            View all {people.length} {label.toLowerCase()}
          </summary>
          <div className="mt-2">
            <PeopleList people={rest} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function PeopleList({ people }: { people: Person[] }) {
  return (
    <ul className="mt-2 space-y-2.5">
      {people.map((p) => (
        <li key={p.key} className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
              p.tone === "muted" ? "bg-muted text-muted-foreground" : TONE[p.tone].chip,
            )}
          >
            {initials(p.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold" title={p.name}>
              {p.name}
            </p>
            <p className="truncate text-[12px] text-muted-foreground" title={p.sub}>
              {p.sub}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
      {children}
    </p>
  );
}

/* ----------------------------------------------- Products, services and SOW */

function ProductsAndSow({ impl }: { impl: Impl }) {
  const dealId = impl.deal_id;
  const deal = useQuery({ ...dealQuery(dealId ?? ""), enabled: Boolean(dealId) });
  const services = servicesFor(deal.data ?? null);
  const sowRef = impl.sow_reference?.trim() || null;
  const sowName = impl.sow_document_name || null;
  const sowUrl = impl.sow_document_url || null;
  const hasSow = Boolean(
    sowRef || sowName || sowUrl || impl.sow_signed_date || impl.sow_value != null,
  );

  return (
    <section className={cn(CARD, "px-4 py-3.5")} aria-label="Products, services and SOW">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[16px] font-semibold">Products, services and SOW</h2>
        {services.length > 0 ? (
          <span className={cn("rounded-full px-2 py-px text-[12px] font-semibold", TONE.info.chip)}>
            {services.length}
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <GroupLabel>Purchased services</GroupLabel>
          {services.length === 0 ? (
            <p className="mt-2 text-[13px] text-muted-foreground">
              {dealId
                ? "No services recorded on the deal."
                : "No deal linked, so no services are shown."}
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {services.map((s) => (
                <li
                  key={s.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md bg-muted/50 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-[13px] font-semibold" title={s.name}>
                    {s.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-[12px] text-muted-foreground">
                    <span className={cn("rounded-sm px-1.5 py-px font-medium", TONE.info.chip)}>
                      {SOLUTION_LABEL[s.kind]}
                    </span>
                    {s.phase ? <span>Phase {s.phase}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0">
          <GroupLabel>Statement of work</GroupLabel>
          {hasSow ? (
            <dl className="mt-2 space-y-1.5">
              <SowRow label="SOW" value={sowRef ?? sowName} />
              <SowRow
                label="Signed"
                value={impl.sow_signed_date ? fmtDate(impl.sow_signed_date) : null}
              />
              <SowRow
                label="Value"
                value={impl.sow_value != null ? fmtMoney(impl.sow_value) : null}
              />
              {sowUrl ? (
                <a
                  href={sowUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block px-3 text-[13px] font-medium text-primary hover:underline"
                >
                  View SOW document
                </a>
              ) : null}
            </dl>
          ) : (
            <p className="mt-2 text-[13px] text-muted-foreground">No SOW on file.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function SowRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
      <dt className="shrink-0 text-[12px] text-muted-foreground">{label}</dt>
      <dd
        className="min-w-0 truncate text-right text-[13px] font-semibold tabular-nums"
        title={value ?? undefined}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------ Shared bits */

function Fact({ label, value }: { label: string; value: ReactNode }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className="mt-0.5 truncate text-[13px] font-semibold tabular-nums"
        title={typeof value === "string" ? value : undefined}
      >
        {empty ? "—" : value}
      </dd>
    </div>
  );
}
