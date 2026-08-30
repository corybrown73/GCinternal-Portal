import { useState } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Panel } from "@/components/record";
import { getHandover, saveHandoverRecord } from "@/lib/hygiene.functions";
import { fmtDate, humanize } from "@/lib/hub-format";
import type { TeamOption } from "@/components/owner-picker";

const inputClass =
  "w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50";

/**
 * The handover record.
 *
 * `graduations` and `cs_handoffs` modelled the same event twice in 0003, each
 * with one reader and no writer, so the "Ready to hand over" panel above could
 * only ever say "no handover record exists yet". This is the writer.
 *
 * It is a RECORD, not a gate: saving it moves no stage and asserts nothing
 * about whether the handover was a good one. The missing-fields line names what
 * is still empty — the same three fields the readiness view reports on, so the
 * reader and the writer cannot drift apart.
 */
export function HandoverRecordPanel({
  implementationId,
  team,
}: {
  implementationId: string;
  team: TeamOption[];
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveHandoverRecord);

  const view = useQuery(
    queryOptions({
      queryKey: ["handover", implementationId],
      queryFn: () => getHandover({ data: { implementationId } }),
    }),
  );

  const record = view.data?.record ?? null;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{
    handoff_date: string;
    cs_owner_id: string;
    summary: string;
    open_items: string;
    account_context: string;
    health_at_handover: string;
    notes: string;
  } | null>(null);

  const start = () =>
    setForm({
      handoff_date: record?.handoff_date ?? "",
      cs_owner_id: record?.cs_owner_id ?? "",
      summary: record?.summary ?? "",
      open_items: record?.open_items ?? "",
      account_context: record?.account_context ?? "",
      health_at_handover: record?.health_at_handover ?? "",
      notes: record?.notes ?? "",
    });

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          implementationId,
          handoff_date: form?.handoff_date ? form.handoff_date : null,
          cs_owner_id: form?.cs_owner_id ? form.cs_owner_id : null,
          summary: form?.summary.trim() ? form.summary.trim() : null,
          open_items: form?.open_items.trim() ? form.open_items.trim() : null,
          account_context: form?.account_context.trim() ? form.account_context.trim() : null,
          health_at_handover: (form?.health_at_handover || null) as
            "on_track" | "at_risk" | "blocked" | null,
          notes: form?.notes.trim() ? form.notes.trim() : null,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["handover", implementationId] });
      void queryClient.invalidateQueries({ queryKey: ["customer360"] });
      setEditing(false);
      setForm(null);
    },
  });

  // Nothing renders while the flag is off: the panel above already explains
  // that no handover record exists, and a disabled form is noise.
  if (!view.data?.enabled) return null;

  const missing = view.data.missing;

  return (
    <Panel
      title="Handover record"
      level="supporting"
      meta={missing.length === 0 ? "Complete" : `Missing ${missing.join(", ")}`}
      action={
        editing ? null : (
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              start();
              setEditing(true);
            }}
          >
            {record ? "Edit" : "Record handover"}
          </button>
        )
      }
    >
      <p className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
        The single record of this implementation being handed to Customer Success. Writing it moves
        no stage and blocks nothing — the readiness assessment above stays independent of it.
        {view.data.hasLegacyGraduation
          ? " A pre-v2 graduation row exists for this implementation and was folded into this record."
          : ""}
      </p>

      {editing && form ? (
        <div className="space-y-2 px-3 py-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block space-y-0.5">
              <span className={labelClass}>Handover date</span>
              <input
                type="date"
                className={inputClass}
                value={form.handoff_date}
                onChange={(e) => setForm({ ...form, handoff_date: e.target.value })}
              />
            </label>
            <label className="block space-y-0.5">
              <span className={labelClass}>CS owner</span>
              <select
                className={inputClass}
                value={form.cs_owner_id}
                onChange={(e) => setForm({ ...form, cs_owner_id: e.target.value })}
              >
                <option value="">Not chosen</option>
                {team.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {humanize(t.role)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-0.5">
              <span className={labelClass}>Health at handover</span>
              <select
                className={inputClass}
                value={form.health_at_handover}
                onChange={(e) => setForm({ ...form, health_at_handover: e.target.value })}
              >
                <option value="">Not stated</option>
                <option value="on_track">On track</option>
                <option value="at_risk">At risk</option>
                <option value="blocked">Blocked</option>
              </select>
            </label>
          </div>

          {(
            [
              ["summary", "Handover summary"],
              ["open_items", "Open items CS is inheriting"],
              ["account_context", "Account context"],
              ["notes", "Notes"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block space-y-0.5">
              <span className={labelClass}>{label}</span>
              <textarea
                className={inputClass}
                rows={key === "summary" ? 3 : 2}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}

          {mutation.isError ? (
            <p className="text-[11px] text-destructive">{(mutation.error as Error).message}</p>
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Saving…" : "Save handover record"}
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                setEditing(false);
                setForm(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : record ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 px-3 py-2 md:grid-cols-4">
          <Detail label="Handover date" value={fmtDate(record.handoff_date)} />
          <Detail label="CS owner" value={record.cs_owner_name ?? "—"} />
          <Detail label="Health at handover" value={record.health_at_handover ?? "Not stated"} />
          <Detail label="Recorded by" value={record.recorded_by_name ?? "—"} />
          <div className="col-span-2 md:col-span-4">
            <dt className={labelClass}>Summary</dt>
            <dd className="text-[12px] text-muted-foreground">{record.summary ?? "—"}</dd>
          </div>
          {record.open_items ? (
            <div className="col-span-2 md:col-span-4">
              <dt className={labelClass}>Open items</dt>
              <dd className="text-[12px] text-muted-foreground">{record.open_items}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="px-3 py-2 text-[12px] text-muted-foreground">
          No handover record yet. Nothing is assumed on its behalf.
        </p>
      )}
    </Panel>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className={labelClass}>{label}</dt>
      <dd className="text-[12px]">{value}</dd>
    </div>
  );
}
