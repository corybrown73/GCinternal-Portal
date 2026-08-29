import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, Clock } from "lucide-react";

import { portalTicketsQuery } from "@/components/portal/portal-queries";
import { replyTicket, submitTicket } from "@/lib/portal.functions";
import { fmtDateTime, humanize } from "@/lib/hub-format";
import { cn } from "@/lib/utils";
// Type-only import: erased at build time, never pulls server code client-side.
import type { PortalTicket as Ticket } from "@/lib/portal.server";

export const Route = createFileRoute("/portal/tickets")({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(portalTicketsQuery);
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-md border border-border bg-card p-6 text-[13px]">
      <p className="font-medium">We couldn&apos;t load your requests.</p>
      <p className="mt-1 text-muted-foreground">{error.message}</p>
    </div>
  ),
  component: PortalTicketsPage,
});

const CATEGORIES = ["technical", "training", "billing", "data", "integration", "other"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

const inputClass =
  "w-full rounded-sm border border-border bg-background px-2 py-1.5 text-[13px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const labelClass = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

const STATUS_TONE: Record<string, string> = {
  open: "bg-status-idle text-status-idle-foreground",
  in_progress: "bg-status-ontrack text-status-ontrack-foreground",
  waiting_customer: "bg-status-risk text-status-risk-foreground",
  resolved: "bg-status-ontrack text-status-ontrack-foreground",
  closed: "bg-surface text-muted-foreground",
};

function PortalTicketsPage() {
  const { data } = useSuspenseQuery(portalTicketsQuery);
  const queryClient = useQueryClient();
  const submit = useServerFn(submitTicket);

  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("technical");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("normal");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [customerId, setCustomerId] = useState(data.customers[0]?.id ?? "");
  const [openTicket, setOpenTicket] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      submit({
        data: {
          customerId: customerId || data.customers[0]?.id,
          category,
          subject: subject.trim(),
          body: body.trim(),
          priority,
        },
      }),
    onSuccess: async () => {
      setSubject("");
      setBody("");
      await queryClient.invalidateQueries({ queryKey: ["portal", "tickets"] });
    },
  });

  return (
    <div className="space-y-6">
      {/* Submit form */}
      <section className="rounded-md border border-border bg-card p-5">
        <h1 className="text-[15px] font-semibold tracking-tight">Ask a question / Get help</h1>
        <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          Your GoCanvas team responds within 24 hours.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {data.customers.length > 1 ? (
            <label className="block space-y-1 sm:col-span-2">
              <span className={labelClass}>Company</span>
              <select
                className={inputClass}
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                {data.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="block space-y-1">
            <span className={labelClass}>Category</span>
            <select
              className={inputClass}
              value={category}
              onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Priority</span>
            <select
              className={inputClass}
              value={priority}
              onChange={(e) => setPriority(e.target.value as (typeof PRIORITIES)[number])}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {humanize(p)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className={labelClass}>Subject</span>
            <input
              className={inputClass}
              value={subject}
              placeholder="One line describing what you need"
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className={labelClass}>Description</span>
            <textarea
              className={cn(inputClass, "min-h-[110px] resize-y")}
              value={body}
              placeholder="What happened, what you expected, and anything that helps us reproduce it"
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
        </div>

        {mutation.isError ? (
          <p className="mt-2 text-[12px] text-destructive">
            {mutation.error instanceof Error ? mutation.error.message : "Could not submit"}
          </p>
        ) : null}
        {mutation.isSuccess ? (
          <p className="mt-2 text-[12px] text-status-ontrack-foreground">
            Request received — we&apos;ll get back to you within 24 hours.
          </p>
        ) : null}

        <button
          type="button"
          className="mt-3 inline-flex items-center rounded-sm bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
          disabled={mutation.isPending || subject.trim().length < 3 || body.trim().length < 5}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Sending…" : "Send request"}
        </button>
      </section>

      {/* Ticket list */}
      <section className="rounded-md border border-border bg-card">
        <header className="border-b border-border px-4 py-2.5">
          <h2 className="text-[13px] font-semibold">Your requests</h2>
        </header>
        {data.tickets.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">
            No requests yet — anything you send appears here with its status.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {data.tickets.map((t) => (
              <TicketRow
                key={t.id}
                ticket={t}
                open={openTicket === t.id}
                onToggle={() => setOpenTicket(openTicket === t.id ? null : t.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TicketRow({
  ticket,
  open,
  onToggle,
}: {
  ticket: Ticket;
  open: boolean;
  onToggle: () => void;
}) {
  const queryClient = useQueryClient();
  const reply = useServerFn(replyTicket);
  const [draft, setDraft] = useState("");

  const mutation = useMutation({
    mutationFn: () => reply({ data: { ticketId: ticket.id, body: draft.trim() } }),
    onSuccess: async () => {
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["portal", "tickets"] });
    },
  });

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{ticket.subject}</p>
          <p className="text-[11px] text-muted-foreground">
            {humanize(ticket.category)} · {humanize(ticket.priority)} ·{" "}
            {fmtDateTime(ticket.created_at)}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
            STATUS_TONE[ticket.status] ?? "bg-surface text-muted-foreground",
          )}
        >
          {humanize(ticket.status)}
        </span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border bg-surface px-4 py-3">
          <p className="whitespace-pre-wrap text-[13px]">{ticket.body}</p>

          {ticket.comments.length > 0 ? (
            <ul className="space-y-2">
              {ticket.comments.map((c) => (
                <li
                  key={c.id}
                  className={cn(
                    "rounded-sm border border-border p-2.5",
                    c.author_is_team ? "bg-card" : "bg-background",
                  )}
                >
                  <p className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span>{c.author_is_team ? "GoCanvas team" : c.author_name}</span>
                    <span>{fmtDateTime(c.created_at)}</span>
                  </p>
                  <p className="whitespace-pre-wrap text-[13px]">{c.body}</p>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="space-y-1.5">
            <textarea
              className="min-h-[64px] w-full resize-y rounded-sm border border-border bg-background px-2 py-1.5 text-[13px] outline-none focus:ring-1 focus:ring-ring"
              placeholder="Reply to your GoCanvas team…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            {mutation.isError ? (
              <p className="text-[11px] text-destructive">
                {mutation.error instanceof Error ? mutation.error.message : "Could not reply"}
              </p>
            ) : null}
            <button
              type="button"
              className="rounded-sm bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
              disabled={mutation.isPending || draft.trim().length === 0}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Sending…" : "Send reply"}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
