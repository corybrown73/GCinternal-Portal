import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PageBody } from "@/components/page";
import {
  addTicketComment,
  getInternalProfiles,
  getTicket,
  setTicketAssignee,
  setTicketStatus,
} from "@/lib/tickets.functions";
import { fmtDateTime, humanize } from "@/lib/hub-format";
import { cn } from "@/lib/utils";
import {
  BreachBadge,
  PriorityChip,
  SlaChip,
  TICKET_STATUSES,
  TicketStatusChip,
  inputClass,
  microLabelClass,
  primaryButtonClass,
  selectClass,
} from "@/components/tickets/ticket-ui";

export const Route = createFileRoute("/tickets/$ticketId")({
  head: () => ({
    meta: [{ title: "Ticket — Implementation Hub" }],
  }),
  component: TicketDetailPage,
});

function TicketDetailPage() {
  const { ticketId } = Route.useParams();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: () => getTicket({ data: { ticketId } }),
  });
  const teamQuery = useQuery({
    queryKey: ["internal-profiles"],
    queryFn: () => getInternalProfiles(),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
    void queryClient.invalidateQueries({ queryKey: ["tickets"] });
  };

  const assignFn = useServerFn(setTicketAssignee);
  const statusFn = useServerFn(setTicketStatus);
  const assignMutation = useMutation({
    mutationFn: (assigneeId: string | null) => assignFn({ data: { ticketId, assigneeId } }),
    onSuccess: invalidate,
  });
  const statusMutation = useMutation({
    mutationFn: (status: (typeof TICKET_STATUSES)[number]) =>
      statusFn({ data: { ticketId, status } }),
    onSuccess: invalidate,
  });

  if (query.isPending) {
    return (
      <PageBody>
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Loading ticket…
        </p>
      </PageBody>
    );
  }
  if (query.isError || !query.data) {
    return (
      <PageBody>
        <p role="alert" className="text-[13px] text-destructive">
          Could not load this ticket: {(query.error as Error | undefined)?.message ?? "not found"}
        </p>
      </PageBody>
    );
  }

  const { ticket, comments } = query.data;
  const team = teamQuery.data ?? [];

  return (
    <PageBody className="space-y-4">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Link to="/tickets" className="hover:text-foreground hover:underline">
          Queue
        </Link>
        <span>/</span>
        <span className="truncate font-mono text-[10px] uppercase tracking-wider">{ticket.id}</span>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Thread */}
        <div className="min-w-0 flex-1 space-y-3">
          <div className="rounded-md border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[15px] font-semibold tracking-tight">{ticket.subject}</h2>
              <span className="inline-flex shrink-0 items-center gap-1.5">
                <SlaChip
                  slaDueAt={ticket.sla_due_at}
                  firstResponseAt={ticket.first_response_at}
                  breached={false}
                />
                {ticket.sla_breached ? <BreachBadge /> : null}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {ticket.submitter_email ?? "Unknown submitter"} · {fmtDateTime(ticket.created_at)}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-[13px]">{ticket.body}</p>
          </div>

          <div className="space-y-2">
            {comments.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "rounded-md border border-border p-3",
                  c.internal ? "bg-surface" : "bg-card",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-medium">
                    {c.author_name ?? c.author_email ?? "Unknown"}
                  </p>
                  <span className="flex items-center gap-2">
                    {c.internal ? (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        internal
                      </span>
                    ) : null}
                    <span className="text-[11px] text-muted-foreground">
                      {fmtDateTime(c.created_at)}
                    </span>
                  </span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[13px]">{c.body}</p>
              </div>
            ))}
            {comments.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No replies yet.</p>
            ) : null}
          </div>

          <ReplyBox ticketId={ticketId} onDone={invalidate} />
        </div>

        {/* Meta panel */}
        <aside className="w-full shrink-0 space-y-3 lg:w-64">
          <div className="rounded-md border border-border bg-card p-3">
            <dl className="space-y-3">
              <MetaField label="Customer">
                {ticket.customer_id ? (
                  <Link
                    to="/customers/$customerId"
                    params={{ customerId: ticket.customer_id }}
                    search={ticket.implementation_id ? { impl: ticket.implementation_id } : {}}
                    className="hover:underline"
                  >
                    {ticket.customer_name ?? "Customer"}
                  </Link>
                ) : (
                  "—"
                )}
              </MetaField>
              <MetaField label="Category">
                <span className="font-mono text-[11px]">{ticket.category}</span>
              </MetaField>
              <MetaField label="Priority">
                <PriorityChip value={ticket.priority} />
              </MetaField>
              <MetaField label="Status">
                <div className="space-y-1">
                  <TicketStatusChip value={ticket.status} />
                  <select
                    className={cn(selectClass, "w-full")}
                    aria-label="Change status"
                    value={ticket.status}
                    disabled={statusMutation.isPending}
                    onChange={(e) =>
                      statusMutation.mutate(e.target.value as (typeof TICKET_STATUSES)[number])
                    }
                  >
                    {TICKET_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {humanize(s)}
                      </option>
                    ))}
                  </select>
                </div>
              </MetaField>
              <MetaField label="Assignee">
                <select
                  className={cn(selectClass, "w-full")}
                  aria-label="Assignee"
                  value={ticket.assigned_to ?? ""}
                  disabled={assignMutation.isPending || teamQuery.isPending}
                  onChange={(e) =>
                    assignMutation.mutate(e.target.value === "" ? null : e.target.value)
                  }
                >
                  <option value="">
                    {ticket.assigned_role
                      ? `Unassigned (${humanize(ticket.assigned_role)} pool)`
                      : "Unassigned"}
                  </option>
                  {team.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name ?? p.email}
                    </option>
                  ))}
                </select>
              </MetaField>
              <MetaField label="SLA">
                <div className="space-y-1 text-[11px] text-muted-foreground">
                  <p>First response due {fmtDateTime(ticket.sla_due_at)}</p>
                  <p>
                    {ticket.first_response_at
                      ? `First response ${fmtDateTime(ticket.first_response_at)}`
                      : ticket.sla_breached
                        ? "Breached — no first response inside the window"
                        : "No first response yet"}
                  </p>
                  {ticket.resolved_at ? <p>Resolved {fmtDateTime(ticket.resolved_at)}</p> : null}
                </div>
              </MetaField>
            </dl>
            {assignMutation.isError || statusMutation.isError ? (
              <p role="alert" className="mt-2 text-[12px] text-destructive">
                {((assignMutation.error ?? statusMutation.error) as Error).message}
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </PageBody>
  );
}

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-[13px]">{children}</dd>
    </div>
  );
}

function ReplyBox({ ticketId, onDone }: { ticketId: string; onDone: () => void }) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const reply = useServerFn(addTicketComment);
  const mutation = useMutation({
    mutationFn: () => reply({ data: { ticketId, body: body.trim(), internal } }),
    onSuccess: () => {
      setBody("");
      setInternal(false);
      onDone();
    },
  });

  return (
    <div className={cn("rounded-md border border-border p-3", internal ? "bg-surface" : "bg-card")}>
      <div className="flex items-center justify-between">
        <span className={microLabelClass}>{internal ? "Internal note" : "Reply to submitter"}</span>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={internal}
            onChange={(e) => setInternal(e.target.checked)}
            className="h-3 w-3 accent-current"
          />
          Internal note
        </label>
      </div>
      <textarea
        className={cn(inputClass, "mt-2 min-h-20")}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          internal
            ? "Visible to the team only"
            : "Sent to the submitter by email — this counts as the first response"
        }
      />
      {mutation.isError ? (
        <p role="alert" className="mt-2 text-[12px] text-destructive">
          {(mutation.error as Error).message}
        </p>
      ) : null}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          className={primaryButtonClass}
          disabled={mutation.isPending || body.trim() === ""}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Posting…" : internal ? "Add note" : "Send reply"}
        </button>
      </div>
    </div>
  );
}
