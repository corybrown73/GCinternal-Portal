import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page";
import { NoRows } from "@/components/record";
import { addJourney, getJourneys } from "@/lib/journeys.functions";
import { canManage, useProfile } from "@/lib/auth";
import { humanize } from "@/lib/hub-format";
import { cn } from "@/lib/utils";

const journeysQuery = queryOptions({
  queryKey: ["journeys"],
  queryFn: () => getJourneys(),
});

export const Route = createFileRoute("/journeys/")({
  head: () => ({
    meta: [
      { title: "Journeys — Implementation Hub" },
      {
        name: "description",
        content:
          "Automated customer email journeys: welcome sequences, training tracks and engagement.",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(journeysQuery);
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-[13px] text-destructive">
      Could not load journeys: {error.message}
    </div>
  ),
  component: JourneysPage,
});

const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground";
const primaryClass =
  "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

function JourneysPage() {
  const { data } = useSuspenseQuery(journeysQuery);
  const { profile } = useProfile();
  const canEdit =
    canManage(profile?.role) ||
    profile?.role === "implementation" ||
    profile?.role === "onboarding";

  return (
    <>
      <PageHeader
        title="Journeys"
        description="Automated email sequences that walk customer contacts through onboarding content."
        actions={canEdit ? <NewJourney /> : undefined}
      />
      <PageBody className="space-y-3">
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <table className="w-full text-left">
            <thead className="border-b border-border bg-surface text-[10px] text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 font-medium uppercase tracking-[0.1em]">Journey</th>
                <th className="px-3 py-1.5 font-medium uppercase tracking-[0.1em]">Trigger</th>
                <th className="px-3 py-1.5 font-medium uppercase tracking-[0.1em]">Steps</th>
                <th className="px-3 py-1.5 font-medium uppercase tracking-[0.1em]">Enrolled</th>
                <th className="px-3 py-1.5 font-medium uppercase tracking-[0.1em]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((j) => (
                <tr key={j.id} className="hover:bg-muted/60">
                  <td className="px-3 py-1.5">
                    <Link
                      to="/journeys/$journeyId"
                      params={{ journeyId: j.id }}
                      className="block text-[13px] font-medium hover:underline"
                    >
                      {j.name}
                      {j.description ? (
                        <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                          {j.description}
                        </span>
                      ) : null}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                    {humanize(j.trigger_event)}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[12px]">{j.step_count}</td>
                  <td className="px-3 py-1.5 font-mono text-[12px]">{j.enrolled_count}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={cn(
                        "rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                        j.active
                          ? "bg-status-ontrack text-status-ontrack-foreground"
                          : "bg-status-idle text-status-idle-foreground",
                      )}
                    >
                      {j.active ? "Active" : "Paused"}
                    </span>
                  </td>
                </tr>
              ))}
              {data.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <NoRows label="No journeys yet." />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </PageBody>
    </>
  );
}

function NewJourney() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState<"manual" | "customer_created" | "stage_entered">("manual");
  const queryClient = useQueryClient();
  const create = useServerFn(addJourney);

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          name: name.trim(),
          description: description.trim() || null,
          trigger_event: trigger,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["journeys"] });
      setOpen(false);
      setName("");
      setDescription("");
    },
  });

  if (!open) {
    return (
      <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
        <Plus className="h-3 w-3" /> New journey
      </button>
    );
  }

  return (
    <div className="w-72 space-y-2 rounded-sm border border-border bg-surface p-2">
      <label className="block space-y-0.5">
        <span className={labelClass}>Name</span>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block space-y-0.5">
        <span className={labelClass}>Description</span>
        <input
          className={inputClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label className="block space-y-0.5">
        <span className={labelClass}>Trigger</span>
        <select
          className={inputClass}
          value={trigger}
          onChange={(e) => setTrigger(e.target.value as typeof trigger)}
        >
          <option value="manual">Manual</option>
          <option value="customer_created">Customer created</option>
          <option value="stage_entered">Stage entered</option>
        </select>
      </label>
      {mutation.isError ? (
        <p className="text-[11px] text-destructive">
          {mutation.error instanceof Error ? mutation.error.message : "Could not create"}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={primaryClass}
          disabled={mutation.isPending || name.trim().length < 2}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Creating…" : "Create"}
        </button>
        <button type="button" className={buttonClass} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
