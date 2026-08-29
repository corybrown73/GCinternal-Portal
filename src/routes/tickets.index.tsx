import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PageBody } from "@/components/page";
import { NoRows } from "@/components/record";
import { addTicket, getTickets } from "@/lib/tickets.functions";
import { getHome } from "@/lib/hub.functions";
import { useProfile } from "@/lib/auth";
import { fmtDateTime, humanize } from "@/lib/hub-format";
import { cn } from "@/lib/utils";
import {
  BreachBadge,
  PriorityChip,
  SlaChip,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  buttonClass,
  inputClass,
  microLabelClass,
  primaryButtonClass,
  selectClass,
} from "@/components/tickets/ticket-ui";

type QueueSearch = {
  category?: string | undefined;
  assignee?: "mine" | "all" | undefined;
};

export const Route = createFileRoute("/tickets/")({
  head: () => ({
    meta: [
      { title: "Tickets — Implementation Hub" },
      {
        name: "description",
        content: "Support queue with first-response SLA countdowns, routing and breach flags.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): QueueSearch => {
    const out: QueueSearch = {};
    const category = search["category"];
    if (
      typeof category === "string" &&
      (TICKET_CATEGORIES as readonly string[]).includes(category)
    ) {
      out.category = category;
    }
    if (search["assignee"] === "mine") out.assignee = "mine";
    return out;
  },
  component: TicketQueuePage,
});

type TicketRow = Awaited<ReturnType<typeof getTickets>>[number];

const FOURTEEN_DAYS_MS = 14 * 86_400_000;

function TicketQueuePage() {
  const { profile } = useProfile();
  const { category, assignee } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = useQuery({ queryKey: ["tickets"], queryFn: () => getTickets() });

  const setSearch = (patch: Partial<QueueSearch>) =>
    navigate({ search: (prev: QueueSearch) => ({ ...prev, ...patch }) });

  const all = query.data ?? [];
  const filtered = all
    .filter((t) => (category ? t.category === category : true))
    .filter((t) => (assignee === "mine" && profile ? t.assigned_to === profile.id : true));

  const bySla = (a: TicketRow, b: TicketRow) => a.sla_due_at.localeCompare(b.sla_due_at);
  const needsResponse = filtered.filter((t) => t.status === "open").sort(bySla);
  const inProgress = filtered.filter((t) => t.status === "in_progress").sort(bySla);
  const waiting = filtered.filter((t) => t.status === "waiting_customer").sort(bySla);
  const resolved = filtered
    .filter(
      (t) =>
        (t.status === "resolved" || t.status === "closed") &&
        Date.now() - new Date(t.resolved_at ?? t.updated_at).getTime() < FOURTEEN_DAYS_MS,
    )
    .sort((a, b) => (b.resolved_at ?? b.updated_at).localeCompare(a.resolved_at ?? a.updated_at));

  return (
    <PageBody className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Category
            </span>
            <FilterButton
              active={category === undefined}
              label="All"
              onClick={() => setSearch({ category: undefined })}
            />
            {TICKET_CATEGORIES.map((c) => (
              <FilterButton
                key={c}
                active={category === c}
                label={humanize(c)}
                onClick={() => setSearch({ category: category === c ? undefined : c })}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Assignee
            </span>
            <FilterButton
              active={assignee !== "mine"}
              label="All"
              onClick={() => setSearch({ assignee: undefined })}
            />
            <FilterButton
              active={assignee === "mine"}
              label="Mine"
              onClick={() => setSearch({ assignee: assignee === "mine" ? undefined : "mine" })}
            />
          </div>
        </div>
        <NewTicket />
      </div>

      {query.isPending ? (
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Loading tickets…
        </p>
      ) : query.isError ? (
        <p role="alert" className="text-[13px] text-destructive">
          Could not load tickets: {(query.error as Error).message}
        </p>
      ) : (
        <div className="space-y-4">
          <QueueSection
            title="Needs first response"
            rows={needsResponse}
            emptyLabel="Nothing waiting on a first response."
          />
          <QueueSection title="In progress" rows={inProgress} emptyLabel="Nothing in progress." />
          <QueueSection
            title="Waiting on customer"
            rows={waiting}
            emptyLabel="Nothing waiting on a customer."
          />
          <QueueSection
            title="Resolved (last 14 days)"
            rows={resolved}
            emptyLabel="Nothing resolved in the last 14 days."
          />
        </div>
      )}
    </PageBody>
  );
}

function FilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-sm border border-border px-1.5 py-0.5 text-[11px]",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function QueueSection({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: TicketRow[];
  emptyLabel: string;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em]">{title}</h2>
        <span className="font-mono text-[11px] text-muted-foreground">{rows.length}</span>
      </header>
      {rows.length === 0 ? (
        <NoRows label={emptyLabel} />
      ) : (
        <table className="w-full text-left">
          <thead className="border-b border-border bg-surface text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Subject</th>
              <th className="px-3 py-1.5 font-medium">Customer</th>
              <th className="px-3 py-1.5 font-medium">Category</th>
              <th className="px-3 py-1.5 font-medium">Priority</th>
              <th className="px-3 py-1.5 font-medium">Assignee</th>
              <th className="px-3 py-1.5 font-medium">SLA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-muted/60">
                <td className="px-3 py-1.5">
                  <Link
                    to="/tickets/$ticketId"
                    params={{ ticketId: t.id }}
                    className="block text-[13px] font-medium hover:underline"
                  >
                    {t.subject}
                  </Link>
                  <span className="text-[11px] text-muted-foreground">
                    {fmtDateTime(t.created_at)} · {t.submitter_email ?? "unknown"}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-[12px]">{t.customer_name ?? "—"}</td>
                <td className="px-3 py-1.5 font-mono text-[11px]">{t.category}</td>
                <td className="px-3 py-1.5">
                  <PriorityChip value={t.priority} />
                </td>
                <td className="px-3 py-1.5 text-[12px]">
                  {t.assignee_name ?? (
                    <span className="text-muted-foreground">
                      {t.assigned_role ? `${humanize(t.assigned_role)} (pool)` : "Unassigned"}
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <SlaChip
                      slaDueAt={t.sla_due_at}
                      firstResponseAt={t.first_response_at}
                      breached={false}
                    />
                    {t.sla_breached ? <BreachBadge /> : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function NewTicket() {
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [category, setCategory] = useState<(typeof TICKET_CATEGORIES)[number]>("technical");
  const [priority, setPriority] = useState<(typeof TICKET_PRIORITIES)[number]>("normal");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const queryClient = useQueryClient();
  const create = useServerFn(addTicket);

  // Customer options come from the same home dataset other pages already cache.
  const home = useQuery({ queryKey: ["home"], queryFn: () => getHome(), enabled: open });
  const customers = Array.from(
    new Map(
      (home.data?.implementations ?? []).map((i) => [i.customer_id, i.customer_name]),
    ).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          customerId: customerId === "" ? null : customerId,
          category,
          subject: subject.trim(),
          body: body.trim(),
          priority,
        },
      }),
    onSuccess: () => {
      setOpen(false);
      setSubject("");
      setBody("");
      setCustomerId("");
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  if (!open) {
    return (
      <button type="button" className={primaryButtonClass} onClick={() => setOpen(true)}>
        New ticket
      </button>
    );
  }

  return (
    <div className="w-full rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          New ticket
        </span>
        <button type="button" className={buttonClass} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <label className="block space-y-0.5">
          <span className={microLabelClass}>Customer</span>
          <select
            className={cn(selectClass, "w-full")}
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">No customer</option>
            {customers.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-0.5">
          <span className={microLabelClass}>Category</span>
          <select
            className={cn(selectClass, "w-full")}
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
          >
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {humanize(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-0.5">
          <span className={microLabelClass}>Priority</span>
          <select
            className={cn(selectClass, "w-full")}
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
          >
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {humanize(p)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-2 block space-y-0.5">
        <span className={microLabelClass}>Subject</span>
        <input
          className={inputClass}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Short summary"
        />
      </label>
      <label className="mt-2 block space-y-0.5">
        <span className={microLabelClass}>Details</span>
        <textarea
          className={cn(inputClass, "min-h-20")}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What happened, what is needed"
        />
      </label>
      {mutation.isError ? (
        <p role="alert" className="mt-2 text-[12px] text-destructive">
          {(mutation.error as Error).message}
        </p>
      ) : null}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          className={primaryButtonClass}
          disabled={mutation.isPending || subject.trim() === "" || body.trim() === ""}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Creating…" : "Create ticket"}
        </button>
      </div>
    </div>
  );
}
