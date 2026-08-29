import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MailPlus, Trash2, UserX } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import {
  getAccessOverview,
  inviteContact,
  removeCustomerAccess,
  revokeCustomerInvite,
} from "@/lib/access.functions";
import { fmtDate } from "@/lib/hub-format";
import { cn } from "@/lib/utils";
// Type-only import — erased at build time.
import type { AccessCustomer } from "@/lib/access.server";

const accessQuery = queryOptions({
  queryKey: ["access"],
  queryFn: () => getAccessOverview(),
});

export const Route = createFileRoute("/access")({
  head: () => ({
    meta: [
      { title: "Customer access — Implementation Hub" },
      {
        name: "description",
        content: "Which customer contacts can sign in to the customer portal, and pending invites.",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(accessQuery);
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load customer access: {error.message}
    </div>
  ),
  component: AccessPage,
});

const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
const primaryClass =
  "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

function AccessPage() {
  const { data } = useSuspenseQuery(accessQuery);

  return (
    <>
      <PageHeader
        title="Customer access"
        description="Portal logins per customer: active users, pending invites, and inviting new contacts."
      />
      <PageBody className="space-y-3">
        {data.map((customer) => (
          <CustomerCard key={customer.id} customer={customer} />
        ))}
        {data.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-card px-6 py-8 text-center text-[12px] text-muted-foreground">
            No customers yet.
          </p>
        ) : null}
      </PageBody>
    </>
  );
}

function CustomerCard({ customer }: { customer: AccessCustomer }) {
  const [inviting, setInviting] = useState(false);
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["access"] });

  const revoke = useServerFn(revokeCustomerInvite);
  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => revoke({ data: { inviteId } }),
    onSuccess: invalidate,
  });

  const removeLink = useServerFn(removeCustomerAccess);
  const removeMutation = useMutation({
    mutationFn: (linkId: string) => removeLink({ data: { linkId } }),
    onSuccess: invalidate,
  });

  const empty = customer.users.length === 0 && customer.invites.length === 0;

  return (
    <section className="rounded-md border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-[13px] font-semibold">{customer.name}</h2>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {customer.users.length} user{customer.users.length === 1 ? "" : "s"} ·{" "}
            {customer.invites.length} pending
          </span>
          {!inviting ? (
            <button type="button" className={buttonClass} onClick={() => setInviting(true)}>
              <MailPlus className="h-3 w-3" /> Invite contact
            </button>
          ) : null}
        </div>
      </header>

      {inviting ? (
        <div className="border-b border-border px-4 py-3">
          <InviteForm customer={customer} onDone={() => setInviting(false)} />
        </div>
      ) : null}

      {empty ? (
        <p className="px-4 py-4 text-[12px] text-muted-foreground">
          No portal access yet — invite a contact to give them a live view of their onboarding.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {customer.users.map((u) => (
            <li key={u.link_id} className="flex items-center gap-3 px-4 py-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-ontrack-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium">{u.full_name || u.email}</p>
                <p className="text-[10px] text-muted-foreground">
                  {u.email}
                  {u.contact_name ? ` · linked to ${u.contact_name}` : ""} · joined{" "}
                  {fmtDate(u.created_at)}
                </p>
              </div>
              <button
                type="button"
                className={cn(buttonClass, "hover:text-destructive")}
                disabled={removeMutation.isPending}
                onClick={() => {
                  if (window.confirm(`Remove ${u.email}'s access to ${customer.name}?`)) {
                    removeMutation.mutate(u.link_id);
                  }
                }}
              >
                <UserX className="h-3 w-3" /> Remove
              </button>
            </li>
          ))}
          {customer.invites.map((i) => (
            <li key={i.id} className="flex items-center gap-3 bg-surface/60 px-4 py-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-idle-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px]">{i.email}</p>
                <p className="text-[10px] text-muted-foreground">
                  Invited {fmtDate(i.created_at)}
                  {i.invited_by_name ? ` by ${i.invited_by_name}` : ""}
                  {i.contact_name ? ` · for ${i.contact_name}` : ""} · pending
                </p>
              </div>
              <button
                type="button"
                className={cn(buttonClass, "hover:text-destructive")}
                disabled={revokeMutation.isPending}
                onClick={() => revokeMutation.mutate(i.id)}
              >
                <Trash2 className="h-3 w-3" /> Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function InviteForm({ customer, onDone }: { customer: AccessCustomer; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [contactId, setContactId] = useState("");
  const queryClient = useQueryClient();
  const invite = useServerFn(inviteContact);

  const mutation = useMutation({
    mutationFn: () =>
      invite({
        data: {
          customerId: customer.id,
          email: email.trim(),
          contactId: contactId || null,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["access"] });
      onDone();
    },
  });

  return (
    <div className="space-y-2 rounded-sm border border-border bg-surface p-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block space-y-0.5">
          <span className={labelClass}>Email</span>
          <input
            className={inputClass}
            placeholder="name@customer.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>Link to contact (optional)</span>
          <select
            className={inputClass}
            value={contactId}
            onChange={(e) => {
              setContactId(e.target.value);
              const contact = customer.contacts.find((c) => c.id === e.target.value);
              if (contact?.email) setEmail(contact.email);
            }}
          >
            <option value="">No linked contact</option>
            {customer.contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.email ? ` (${c.email})` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        They&apos;ll get a sign-in link by email; future sign-ins use the same email address at
        /login. Their login only sees this customer&apos;s onboarding.
      </p>
      {mutation.isError ? (
        <p className="text-[11px] text-destructive">
          {mutation.error instanceof Error ? mutation.error.message : "Could not send invite"}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={primaryClass}
          disabled={mutation.isPending || !email.includes("@")}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Sending…" : "Send invite"}
        </button>
        <button type="button" className={buttonClass} disabled={mutation.isPending} onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
