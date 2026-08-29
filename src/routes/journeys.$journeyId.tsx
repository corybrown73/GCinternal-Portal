import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Mail, Pencil, Plus, Trash2, UserPlus } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import {
  enrollJourneyContact,
  getJourneyDetail,
  addContentItem,
  removeStep,
  saveStep,
  toggleJourneyActive,
} from "@/lib/journeys.functions";
import { canManage, useProfile } from "@/lib/auth";
import { fmtDateTime, humanize } from "@/lib/hub-format";
import { cn } from "@/lib/utils";
// Type-only imports — erased at build time.
import type { JourneyDetail } from "@/lib/journeys.server";

const detailQuery = (journeyId: string) =>
  queryOptions({
    queryKey: ["journeys", journeyId],
    queryFn: () => getJourneyDetail({ data: { journeyId } }),
  });

export const Route = createFileRoute("/journeys/$journeyId")({
  head: () => ({
    meta: [{ title: "Journey — Implementation Hub" }],
  }),
  loader: ({ context, params }) => {
    context.queryClient.ensureQueryData(detailQuery(params.journeyId));
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load this journey: {error.message}
    </div>
  ),
  component: JourneyDetailPage,
});

const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const areaClass =
  "min-h-[90px] w-full resize-y rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
const primaryClass =
  "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

function useInvalidate(journeyId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["journeys", journeyId] }),
      queryClient.invalidateQueries({ queryKey: ["journeys"] }),
    ]);
}

function JourneyDetailPage() {
  const { journeyId } = Route.useParams();
  const { data } = useSuspenseQuery(detailQuery(journeyId));
  const { profile } = useProfile();
  const canEdit =
    canManage(profile?.role) || profile?.role === "implementation" || profile?.role === "onboarding";
  const invalidate = useInvalidate(journeyId);

  const toggle = useServerFn(toggleJourneyActive);
  const toggleMutation = useMutation({
    mutationFn: () => toggle({ data: { journeyId, active: !data.journey.active } }),
    onSuccess: () => invalidate(),
  });

  return (
    <>
      <PageHeader
        title={data.journey.name}
        description={data.journey.description ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Trigger: {humanize(data.journey.trigger_event)}
            </span>
            {canEdit ? (
              <button
                type="button"
                className={cn(
                  "rounded-sm px-2 py-0.5 text-[11px] font-medium",
                  data.journey.active
                    ? "bg-status-ontrack text-status-ontrack-foreground"
                    : "bg-status-idle text-status-idle-foreground",
                )}
                disabled={toggleMutation.isPending}
                onClick={() => toggleMutation.mutate()}
                title={data.journey.active ? "Pause this journey" : "Activate this journey"}
              >
                {data.journey.active ? "Active — pause" : "Paused — activate"}
              </button>
            ) : (
              <span
                className={cn(
                  "rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                  data.journey.active
                    ? "bg-status-ontrack text-status-ontrack-foreground"
                    : "bg-status-idle text-status-idle-foreground",
                )}
              >
                {data.journey.active ? "Active" : "Paused"}
              </span>
            )}
          </div>
        }
      />
      <PageBody className="space-y-5">
        <Link
          to="/journeys"
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> All journeys
        </Link>

        <StepsPanel data={data} journeyId={journeyId} canEdit={canEdit} />
        <EnrollmentsPanel data={data} journeyId={journeyId} canEdit={canEdit} />
      </PageBody>
    </>
  );
}

/* ------------------------------------------------------------------------- */
/* Steps                                                                     */
/* ------------------------------------------------------------------------- */

type StepDraft = {
  title: string;
  contentItemId: string; // "" none, "__new__" create inline
  newContentTitle: string;
  newContentUrl: string;
  newContentKind: "video" | "doc" | "link";
  emailSubject: string;
  emailBody: string;
  advanceOn: "viewed" | "delay";
  delayHours: string;
};

const emptyStepDraft = (): StepDraft => ({
  title: "",
  contentItemId: "",
  newContentTitle: "",
  newContentUrl: "",
  newContentKind: "video",
  emailSubject: "",
  emailBody: "",
  advanceOn: "viewed",
  delayHours: "48",
});

function StepsPanel({
  data,
  journeyId,
  canEdit,
}: {
  data: JourneyDetail;
  journeyId: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const invalidate = useInvalidate(journeyId);
  const remove = useServerFn(removeStep);
  const removeMutation = useMutation({
    mutationFn: (stepId: string) => remove({ data: { journeyId, stepId } }),
    onSuccess: () => invalidate(),
  });

  return (
    <section className="rounded-md border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div>
          <h2 className="text-[13px] font-semibold">Steps</h2>
          <p className="text-[11px] text-muted-foreground">
            Sent in order. &lsquo;On viewed&rsquo; advances when the tracked link is opened;
            &lsquo;delay&rsquo; advances after the wait.
          </p>
        </div>
        {canEdit && editing !== "new" ? (
          <button type="button" className={buttonClass} onClick={() => setEditing("new")}>
            <Plus className="h-3 w-3" /> Add step
          </button>
        ) : null}
      </header>

      <ol className="divide-y divide-border">
        {data.steps.map((step) => (
          <li key={step.id} className="px-4 py-2.5">
            {editing === step.id ? (
              <StepForm
                journeyId={journeyId}
                stepId={step.id}
                contentItems={data.content_items}
                initial={{
                  title: step.title,
                  contentItemId: step.content_item_id ?? "",
                  newContentTitle: "",
                  newContentUrl: "",
                  newContentKind: "video",
                  emailSubject: step.email_subject,
                  emailBody: step.email_body,
                  advanceOn: step.advance_on,
                  delayHours: String(step.delay_hours ?? 48),
                }}
                onDone={() => setEditing(null)}
              />
            ) : (
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface font-mono text-[10px] font-medium">
                  {step.step_order}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{step.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {step.email_subject}
                    </span>
                    {step.content_item ? (
                      <span>
                        · {humanize(step.content_item.kind)}: {step.content_item.title}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {step.advance_on === "viewed"
                      ? "Advances on viewed"
                      : `Advances after ${step.delay_hours ?? "?"}h`}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => setEditing(step.id)}
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button
                      type="button"
                      className={cn(buttonClass, "hover:text-destructive")}
                      disabled={removeMutation.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete step "${step.title}"?`)) {
                          removeMutation.mutate(step.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </li>
        ))}
        {data.steps.length === 0 && editing !== "new" ? (
          <li className="px-4 py-6 text-center text-[12px] text-muted-foreground">
            No steps yet — add the first email in this sequence.
          </li>
        ) : null}
        {editing === "new" ? (
          <li className="px-4 py-2.5">
            <StepForm
              journeyId={journeyId}
              stepId={null}
              contentItems={data.content_items}
              initial={emptyStepDraft()}
              onDone={() => setEditing(null)}
            />
          </li>
        ) : null}
      </ol>
    </section>
  );
}

function StepForm({
  journeyId,
  stepId,
  contentItems,
  initial,
  onDone,
}: {
  journeyId: string;
  stepId: string | null;
  contentItems: JourneyDetail["content_items"];
  initial: StepDraft;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<StepDraft>(initial);
  const set = (patch: Partial<StepDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const invalidate = useInvalidate(journeyId);
  const save = useServerFn(saveStep);
  const createContent = useServerFn(addContentItem);

  const mutation = useMutation({
    mutationFn: async () => {
      let contentItemId: string | null = draft.contentItemId || null;
      if (draft.contentItemId === "__new__") {
        const created = await createContent({
          data: {
            title: draft.newContentTitle.trim(),
            kind: draft.newContentKind,
            url: draft.newContentUrl.trim(),
          },
        });
        contentItemId = created.id;
      }
      return save({
        data: {
          journeyId,
          stepId,
          title: draft.title.trim(),
          content_item_id: contentItemId,
          email_subject: draft.emailSubject.trim(),
          email_body: draft.emailBody.trim(),
          advance_on: draft.advanceOn,
          delay_hours: draft.advanceOn === "delay" ? Number(draft.delayHours) || null : null,
        },
      });
    },
    onSuccess: async () => {
      await invalidate();
      onDone();
    },
  });

  const creatingContent = draft.contentItemId === "__new__";
  const valid =
    draft.title.trim().length >= 2 &&
    draft.emailSubject.trim().length >= 2 &&
    draft.emailBody.trim().length >= 2 &&
    (!creatingContent || (draft.newContentTitle.trim() && draft.newContentUrl.trim())) &&
    (draft.advanceOn !== "delay" || Number(draft.delayHours) > 0);

  return (
    <div className="space-y-2 rounded-sm border border-border bg-surface p-3">
      <div className="grid gap-2 md:grid-cols-2">
        <label className="block space-y-0.5">
          <span className={labelClass}>Step title</span>
          <input
            className={inputClass}
            value={draft.title}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>Content item</span>
          <select
            className={inputClass}
            value={draft.contentItemId}
            onChange={(e) => set({ contentItemId: e.target.value })}
          >
            <option value="">No linked content</option>
            {contentItems.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.kind})
              </option>
            ))}
            <option value="__new__">+ New content item…</option>
          </select>
        </label>
      </div>

      {creatingContent ? (
        <div className="grid gap-2 rounded-sm border border-dashed border-border p-2 md:grid-cols-3">
          <label className="block space-y-0.5">
            <span className={labelClass}>Content title</span>
            <input
              className={inputClass}
              value={draft.newContentTitle}
              onChange={(e) => set({ newContentTitle: e.target.value })}
            />
          </label>
          <label className="block space-y-0.5">
            <span className={labelClass}>URL</span>
            <input
              className={inputClass}
              placeholder="https://…"
              value={draft.newContentUrl}
              onChange={(e) => set({ newContentUrl: e.target.value })}
            />
          </label>
          <label className="block space-y-0.5">
            <span className={labelClass}>Kind</span>
            <select
              className={inputClass}
              value={draft.newContentKind}
              onChange={(e) =>
                set({ newContentKind: e.target.value as StepDraft["newContentKind"] })
              }
            >
              <option value="video">Video</option>
              <option value="doc">Doc</option>
              <option value="link">Link</option>
            </select>
          </label>
        </div>
      ) : null}

      <label className="block space-y-0.5">
        <span className={labelClass}>Email subject</span>
        <input
          className={inputClass}
          value={draft.emailSubject}
          onChange={(e) => set({ emailSubject: e.target.value })}
        />
      </label>
      <label className="block space-y-0.5">
        <span className={labelClass}>Email body</span>
        <textarea
          className={areaClass}
          value={draft.emailBody}
          onChange={(e) => set({ emailBody: e.target.value })}
        />
      </label>
      <p className="font-mono text-[10px] text-muted-foreground">
        Placeholders: {"{{first_name}}"} and {"{{content_url}}"} (the tracked link) are replaced at
        send time.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block space-y-0.5">
          <span className={labelClass}>Advance</span>
          <select
            className={cn(inputClass, "w-40")}
            value={draft.advanceOn}
            onChange={(e) => set({ advanceOn: e.target.value as StepDraft["advanceOn"] })}
          >
            <option value="viewed">When link is viewed</option>
            <option value="delay">After a delay</option>
          </select>
        </label>
        {draft.advanceOn === "delay" ? (
          <label className="block space-y-0.5">
            <span className={labelClass}>Delay (hours)</span>
            <input
              className={cn(inputClass, "w-24")}
              type="number"
              min={1}
              value={draft.delayHours}
              onChange={(e) => set({ delayHours: e.target.value })}
            />
          </label>
        ) : null}
      </div>

      {mutation.isError ? (
        <p className="text-[11px] text-destructive">
          {mutation.error instanceof Error ? mutation.error.message : "Could not save step"}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={primaryClass}
          disabled={mutation.isPending || !valid}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : stepId ? "Save step" : "Add step"}
        </button>
        <button type="button" className={buttonClass} disabled={mutation.isPending} onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Enrollments                                                               */
/* ------------------------------------------------------------------------- */

const EVENT_TONE: Record<string, string> = {
  sent: "bg-surface text-muted-foreground",
  viewed: "bg-status-ontrack text-status-ontrack-foreground",
  clicked: "bg-status-ontrack text-status-ontrack-foreground",
};

function EnrollmentsPanel({
  data,
  journeyId,
  canEdit,
}: {
  data: JourneyDetail;
  journeyId: string;
  canEdit: boolean;
}) {
  const [enrolling, setEnrolling] = useState(false);
  const stepTitle = new Map(data.steps.map((s) => [s.id, `${s.step_order}. ${s.title}`]));

  return (
    <section className="rounded-md border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div>
          <h2 className="text-[13px] font-semibold">Enrollments</h2>
          <p className="text-[11px] text-muted-foreground">
            Who is in this journey and how far they&apos;ve gotten.
          </p>
        </div>
        {canEdit && !enrolling ? (
          <button type="button" className={buttonClass} onClick={() => setEnrolling(true)}>
            <UserPlus className="h-3 w-3" /> Enroll contact
          </button>
        ) : null}
      </header>

      {enrolling ? (
        <div className="border-b border-border px-4 py-3">
          <EnrollForm
            journeyId={journeyId}
            customers={data.customers}
            onDone={() => setEnrolling(false)}
          />
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-border bg-surface text-[10px] text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium uppercase tracking-[0.1em]">Contact</th>
              <th className="px-3 py-1.5 font-medium uppercase tracking-[0.1em]">Customer</th>
              <th className="px-3 py-1.5 font-medium uppercase tracking-[0.1em]">Step</th>
              <th className="px-3 py-1.5 font-medium uppercase tracking-[0.1em]">Status</th>
              <th className="px-3 py-1.5 font-medium uppercase tracking-[0.1em]">Last sent</th>
              <th className="px-3 py-1.5 font-medium uppercase tracking-[0.1em]">Engagement</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.enrollments.map((e) => (
              <tr key={e.id} className="align-top hover:bg-muted/60">
                <td className="px-3 py-1.5">
                  <p className="text-[12px] font-medium">{e.contact_name ?? e.contact_email}</p>
                  {e.contact_name ? (
                    <p className="text-[10px] text-muted-foreground">{e.contact_email}</p>
                  ) : null}
                </td>
                <td className="px-3 py-1.5 text-[12px]">{e.customer_name}</td>
                <td className="px-3 py-1.5 font-mono text-[12px]">
                  {e.current_step} / {data.steps.length}
                </td>
                <td className="px-3 py-1.5">
                  <span
                    className={cn(
                      "rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                      e.status === "active"
                        ? "bg-status-ontrack text-status-ontrack-foreground"
                        : e.status === "completed"
                          ? "bg-surface text-muted-foreground"
                          : "bg-status-risk text-status-risk-foreground",
                    )}
                  >
                    {e.status}
                  </span>
                </td>
                <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                  {fmtDateTime(e.last_sent_at)}
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex max-w-64 flex-wrap gap-1">
                    {e.events.length === 0 ? (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    ) : (
                      e.events.map((ev) => (
                        <span
                          key={ev.id}
                          className={cn(
                            "rounded-sm px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider",
                            EVENT_TONE[ev.event] ?? "bg-surface text-muted-foreground",
                          )}
                          title={`${ev.event} · ${ev.step_id ? (stepTitle.get(ev.step_id) ?? "") : ""} · ${fmtDateTime(ev.created_at)}`}
                        >
                          {ev.event}
                        </span>
                      ))
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {data.enrollments.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                  No one is enrolled yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EnrollForm({
  journeyId,
  customers,
  onDone,
}: {
  journeyId: string;
  customers: JourneyDetail["customers"];
  onDone: () => void;
}) {
  const [customerId, setCustomerId] = useState("");
  const [contactId, setContactId] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const invalidate = useInvalidate(journeyId);
  const enroll = useServerFn(enrollJourneyContact);

  const customer = customers.find((c) => c.id === customerId);
  const contact = customer?.contacts.find((c) => c.id === contactId);
  const effectiveEmail = contact?.email ?? email;

  const mutation = useMutation({
    mutationFn: () =>
      enroll({
        data: {
          journeyId,
          customerId,
          contactId: contactId || null,
          contactEmail: effectiveEmail.trim(),
          firstName: contact?.name ?? (firstName.trim() || null),
        },
      }),
    onSuccess: async () => {
      await invalidate();
      onDone();
    },
  });

  return (
    <div className="space-y-2 rounded-sm border border-border bg-surface p-3">
      <div className="grid gap-2 md:grid-cols-4">
        <label className="block space-y-0.5">
          <span className={labelClass}>Customer</span>
          <select
            className={inputClass}
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setContactId("");
            }}
          >
            <option value="">Select…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>Contact</span>
          <select
            className={inputClass}
            value={contactId}
            disabled={!customer}
            onChange={(e) => setContactId(e.target.value)}
          >
            <option value="">Free email…</option>
            {(customer?.contacts ?? [])
              .filter((c) => c.email)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email})
                </option>
              ))}
          </select>
        </label>
        {!contactId ? (
          <>
            <label className="block space-y-0.5">
              <span className={labelClass}>Email</span>
              <input
                className={inputClass}
                placeholder="name@customer.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block space-y-0.5">
              <span className={labelClass}>First name</span>
              <input
                className={inputClass}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </label>
          </>
        ) : null}
      </div>
      {mutation.isError ? (
        <p className="text-[11px] text-destructive">
          {mutation.error instanceof Error ? mutation.error.message : "Could not enroll"}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={primaryClass}
          disabled={mutation.isPending || !customerId || !effectiveEmail?.includes("@")}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Enrolling…" : "Enroll & send step 1"}
        </button>
        <button type="button" className={buttonClass} disabled={mutation.isPending} onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
