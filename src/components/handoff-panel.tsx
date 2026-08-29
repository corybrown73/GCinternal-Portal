import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check, Plus, X } from "lucide-react";

import { NoRows, Panel } from "@/components/record";
import {
  acceptHandoffPacket,
  getHandoff,
  returnHandoffPacket,
  saveHandoffPacket,
  submitHandoffPacket,
} from "@/lib/handoff.functions";
import type { HandoffEvent, HandoffPacket, HandoffStatus } from "@/lib/handoff.server";
import type { HandoffCompleteness, HandoffItem } from "@/lib/handoff-completeness";
import { fmtDateTime } from "@/lib/hub-format";
import { cn } from "@/lib/utils";

/**
 * The sales → delivery handoff gate.
 *
 * Two things this deliberately does rather than hides:
 *  - Completeness is shown as a COUNT OF FACTS with every item named and its
 *    reason spelled out — never a percentage, bar or score. The list is the
 *    thing; the count is only its length, so nobody has to trust the number.
 *  - Accepting while items are missing is allowed, so the confirm step names
 *    the missing items. Accepting with gaps has to be a deliberate, informed
 *    act, and it is recorded against the person who made it.
 */

const inputClass =
  "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const areaClass =
  "min-h-[52px] w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
const buttonClass =
  "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50";
const primaryClass =
  "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50";
const labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";

/** Said wherever a return is shown. A returned handoff is not a paused one. */
const CLOCK_RULE =
  "Time in Handoff keeps running while this is returned — a return is not a pause.";

const STATUS_LABEL: Record<HandoffStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  accepted: "Accepted",
  returned: "Returned",
};

const STATUS_CLASS: Record<HandoffStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-status-idle text-status-idle-foreground",
  accepted: "bg-status-ontrack text-status-ontrack-foreground",
  returned: "bg-status-blocked text-status-blocked-foreground",
};

const EVENT_LABEL: Record<HandoffEvent["kind"], string> = {
  submitted: "Submitted",
  accepted: "Accepted",
  returned: "Returned",
  reopened: "Reopened",
};

const TABS = [
  "overview",
  "journey",
  "solution",
  "requirements",
  "decisions",
  "risks",
  "evidence",
  "history",
] as const;
type TabId = (typeof TABS)[number];

const TAB_LABEL: Record<TabId, string> = {
  overview: "Overview",
  journey: "Journey",
  solution: "Solution",
  requirements: "Requirements",
  decisions: "Decisions",
  risks: "Risks & Issues",
  evidence: "Evidence",
  history: "History",
};

/**
 * An item's tab is free text from the completeness rules. A tab this page does
 * not have simply gets no link — a dead deep-link is worse than none.
 */
const asTab = (tab: string | undefined): TabId | null =>
  tab && (TABS as readonly string[]).includes(tab) ? (tab as TabId) : null;

const nullable = (v: string) => (v.trim() === "" ? null : v.trim());

/** Keys are stable; labels live with the rules, so read them back off the items. */
const labelFor = (items: HandoffItem[], key: string) =>
  items.find((i) => i.key === key)?.label ?? key;

/** Newest submission's actor, used only as a fallback for the packet column. */
const submissionActor = (events: HandoffEvent[]) =>
  events.find((e) => e.kind === "submitted")?.actor_name ?? null;

function StatusBadge({ status }: { status: HandoffStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium",
        STATUS_CLASS[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function ItemRow({
  item,
  customerId,
  implementationId,
}: {
  item: HandoffItem;
  customerId: string;
  implementationId: string;
}) {
  const tab = asTab(item.tab);

  return (
    <li className="px-3 py-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {item.present ? (
          <Check className="h-3 w-3 shrink-0 text-status-ontrack-foreground" strokeWidth={2} />
        ) : (
          <AlertTriangle
            className={cn(
              "h-3 w-3 shrink-0",
              item.optional ? "text-muted-foreground/50" : "text-status-blocked-foreground",
            )}
            strokeWidth={1.75}
          />
        )}

        <span
          className={cn(
            "text-[13px]",
            !item.present && !item.optional && "font-medium text-status-blocked-foreground",
          )}
        >
          {item.label}
        </span>

        {!item.present && !item.optional ? (
          <span className="rounded-sm bg-status-blocked px-1 text-[10px] font-medium text-status-blocked-foreground">
            Missing
          </span>
        ) : null}

        {/* The detail always says WHY, so it is never hidden behind a tick. */}
        <span className="text-[11px] text-muted-foreground">{item.detail}</span>

        {tab ? (
          <Link
            to="/customers/$customerId"
            params={{ customerId }}
            search={{ tab, ...(implementationId ? { impl: implementationId } : {}) }}
            className="ml-auto shrink-0 text-[11px] text-muted-foreground underline decoration-dotted hover:text-foreground"
          >
            {TAB_LABEL[tab]}
          </Link>
        ) : null}
      </div>
    </li>
  );
}

/** The three narrative fields the packet genuinely owns, plus call links. */
function PacketFields({
  implementationId,
  customerId,
  packet,
}: {
  implementationId: string;
  customerId: string;
  packet: HandoffPacket | null;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveHandoffPacket);
  const [open, setOpen] = useState(false);
  const [integration, setIntegration] = useState("");
  const [migration, setMigration] = useState("");
  const [roadmap, setRoadmap] = useState("");
  const [links, setLinks] = useState<Array<{ label: string; url: string }>>([]);

  // Loaded at open time rather than at mount: the packet arrives with the
  // query, and a form seeded from a still-empty packet would silently blank it.
  const seed = () => {
    setIntegration(packet?.integration_dependencies ?? "");
    setMigration(packet?.data_migration_needs ?? "");
    setRoadmap(packet?.roadmap_promises ?? "");
    setLinks(
      (packet?.discovery_call_links ?? []).map((l) => ({ label: l.label ?? "", url: l.url ?? "" })),
    );
  };

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          implementationId,
          integration_dependencies: nullable(integration),
          data_migration_needs: nullable(migration),
          roadmap_promises: nullable(roadmap),
          // A half-typed row is not a link; the server would reject it and
          // lose the rest of the edit with it.
          discovery_call_links: links
            .filter((l) => l.url.trim() !== "")
            .map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["handoff", implementationId] });
      await queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
      setOpen(false);
    },
  });

  const disabled = mutation.isPending;
  const callLinks = packet?.discovery_call_links ?? [];

  if (!open) {
    return (
      <div className="space-y-1.5 px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className={labelClass}>What the packet itself holds</span>
          <button
            type="button"
            className={`${buttonClass} ml-auto`}
            onClick={() => {
              mutation.reset();
              seed();
              setOpen(true);
            }}
          >
            {packet ? "Edit" : "Add"}
          </button>
        </div>
        <dl className="grid gap-x-4 gap-y-1 md:grid-cols-3">
          {(
            [
              ["Integration dependencies", packet?.integration_dependencies],
              ["Data-migration needs", packet?.data_migration_needs],
              ["Product-roadmap promises", packet?.roadmap_promises],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className={labelClass}>{label}</dt>
              <dd
                className={cn(
                  "text-[12px] leading-snug",
                  value ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {value ?? "Not described"}
              </dd>
            </div>
          ))}
        </dl>
        <div>
          <span className={labelClass}>Recorded discovery calls</span>
          {callLinks.length ? (
            <ul className="space-y-0.5">
              {callLinks.map((l, i) => (
                <li key={i} className="text-[12px]">
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-dotted"
                  >
                    {l.label || l.url}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              None linked here. Gong reports on the linked deal count too.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 px-3 py-2">
      <span className={labelClass}>What the packet itself holds</span>
      <div className="grid gap-2 md:grid-cols-3">
        <label className="block space-y-0.5">
          <span className={labelClass}>Integration dependencies</span>
          <textarea
            className={areaClass}
            aria-label="Integration dependencies"
            value={integration}
            disabled={disabled}
            placeholder="Leave blank if there are none"
            onChange={(e) => setIntegration(e.target.value)}
          />
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>Data-migration needs</span>
          <textarea
            className={areaClass}
            aria-label="Data-migration needs"
            value={migration}
            disabled={disabled}
            placeholder="Leave blank if there is none"
            onChange={(e) => setMigration(e.target.value)}
          />
        </label>
        <label className="block space-y-0.5">
          <span className={labelClass}>Product-roadmap promises</span>
          <textarea
            className={areaClass}
            aria-label="Product-roadmap promises"
            value={roadmap}
            disabled={disabled}
            placeholder="Anything promised that does not exist yet"
            onChange={(e) => setRoadmap(e.target.value)}
          />
        </label>
      </div>

      <div className="space-y-1">
        <span className={labelClass}>Recorded discovery calls</span>
        {links.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className={`${inputClass} max-w-[220px]`}
              aria-label={`Call ${i + 1} label`}
              value={l.label}
              disabled={disabled}
              placeholder="e.g. Technical discovery, 12 Mar"
              onChange={(e) =>
                setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
              }
            />
            <input
              className={inputClass}
              aria-label={`Call ${i + 1} link`}
              value={l.url}
              disabled={disabled}
              placeholder="https://…"
              onChange={(e) =>
                setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
              }
            />
            <button
              type="button"
              className={buttonClass}
              aria-label={`Remove call ${i + 1}`}
              disabled={disabled}
              onClick={() => setLinks(links.filter((_, j) => j !== i))}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className={buttonClass}
          disabled={disabled}
          onClick={() => setLinks([...links, { label: "", url: "" }])}
        >
          <Plus className="h-3 w-3" /> Add a call link
        </button>
      </div>

      {mutation.isError ? (
        <p className="text-[11px] text-status-blocked-foreground">
          {(mutation.error as Error).message}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={disabled}
          onClick={() => mutation.mutate()}
        >
          {disabled ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={disabled}
          onClick={() => {
            mutation.reset();
            setOpen(false);
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Actions({
  implementationId,
  customerId,
  completeness,
  status,
}: {
  implementationId: string;
  customerId: string;
  completeness: HandoffCompleteness;
  status: HandoffStatus;
}) {
  const queryClient = useQueryClient();
  const submit = useServerFn(submitHandoffPacket);
  const accept = useServerFn(acceptHandoffPacket);
  const back = useServerFn(returnHandoffPacket);

  const [mode, setMode] = useState<"idle" | "accept" | "return">("idle");
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const [gaps, setGaps] = useState<string[]>([]);

  const required = completeness.items.filter((i) => !i.optional);
  const missing = required.filter((i) => !i.present);
  const missingNames = missing.map((i) => i.label).join(", ");

  const settle = async () => {
    await queryClient.invalidateQueries({ queryKey: ["handoff", implementationId] });
    await queryClient.invalidateQueries({ queryKey: ["customer360", customerId] });
    // A return raises an alert, which Home reads.
    await queryClient.invalidateQueries({ queryKey: ["home"] });
    setMode("idle");
    setConfirming(false);
    setNote("");
    setGaps([]);
  };

  const submitMutation = useMutation({
    mutationFn: () => submit({ data: { implementationId } }),
    onSuccess: settle,
  });
  const acceptMutation = useMutation({
    mutationFn: () => accept({ data: { implementationId, note: nullable(note) } }),
    onSuccess: settle,
  });
  const returnMutation = useMutation({
    mutationFn: () => back({ data: { implementationId, missingKeys: gaps, note: nullable(note) } }),
    onSuccess: settle,
  });

  const busy = submitMutation.isPending || acceptMutation.isPending || returnMutation.isPending;
  const error = (submitMutation.error ?? acceptMutation.error ?? returnMutation.error) as
    Error | undefined;

  // The server now refuses a decision on anything but a submitted packet, so
  // the buttons say the same thing rather than failing after the click.
  const canSubmit = status === "draft" || status === "returned";
  const canDecide = status === "submitted";

  const openMode = (next: "accept" | "return") => {
    submitMutation.reset();
    acceptMutation.reset();
    returnMutation.reset();
    setConfirming(false);
    setNote("");
    // Pre-tick what is actually missing right now: the reviewer edits that
    // list rather than assembling it from memory.
    setGaps(next === "return" ? missing.map((i) => i.key) : []);
    setMode(next);
  };

  return (
    <div className="space-y-2 border-t border-border px-3 py-2">
      {mode === "idle" ? (
        <div className="flex flex-wrap items-center gap-2">
          {canSubmit ? (
            <button
              type="button"
              className={primaryClass}
              disabled={busy}
              onClick={() => {
                submitMutation.reset();
                submitMutation.mutate();
              }}
            >
              {submitMutation.isPending
                ? "Submitting…"
                : status === "returned"
                  ? "Resubmit handoff"
                  : "Submit handoff"}
            </button>
          ) : null}

          {canDecide ? (
            <>
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() => openMode("accept")}
              >
                Accept…
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() => openMode("return")}
              >
                Return…
              </button>
            </>
          ) : null}

          {canSubmit && missing.length > 0 ? (
            <span className="text-[11px] text-muted-foreground">
              Submitting is allowed while incomplete — the {missing.length} missing item
              {missing.length === 1 ? "" : "s"} {missing.length === 1 ? "is" : "are"} recorded with
              the submission.
            </span>
          ) : null}

          {status === "returned" ? (
            <span className="text-[11px] text-muted-foreground">
              Delivery sent this back. It has to be resubmitted before it can be accepted again.
            </span>
          ) : null}

          {status === "accepted" ? (
            <span className="text-[11px] text-muted-foreground">
              Accepted. What was missing at that moment is in the history below.
            </span>
          ) : null}

          {/* Submit is a one-click action, so its failure has to land here. */}
          {submitMutation.isError && error ? (
            <span className="text-[11px] text-status-blocked-foreground">{error.message}</span>
          ) : null}
        </div>
      ) : null}

      {mode === "accept" ? (
        <div className="space-y-2 rounded-sm border border-border bg-background p-2">
          <span className={labelClass}>Accept this handoff</span>
          <label className="block space-y-0.5">
            <span className={labelClass}>Note (optional)</span>
            <textarea
              className={areaClass}
              aria-label="Acceptance note"
              rows={2}
              value={note}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          {confirming ? (
            <div className="rounded-sm border border-dashed border-border bg-muted/40 px-2 py-1.5 text-[11px]">
              {/* Accepting with gaps is allowed, so it must never be a slip:
                  the confirm names every item that is missing. */}
              {missing.length > 0 ? (
                <>
                  Confirm: accept with {missing.length} required item
                  {missing.length === 1 ? "" : "s"} still missing —{" "}
                  <span className="font-medium text-status-blocked-foreground">{missingNames}</span>
                  . That list is recorded against your name as what you accepted.
                </>
              ) : (
                <>
                  Confirm: accept this handoff. All {completeness.required} required items are
                  present, and that is recorded against your name.
                </>
              )}
            </div>
          ) : null}

          {error ? (
            <p className="text-[11px] text-status-blocked-foreground">{error.message}</p>
          ) : null}

          <div className="flex items-center gap-2">
            {confirming ? (
              <button
                type="button"
                className={primaryClass}
                disabled={busy}
                onClick={() => acceptMutation.mutate()}
              >
                {acceptMutation.isPending
                  ? "Accepting…"
                  : missing.length > 0
                    ? `Confirm accept with ${missing.length} missing`
                    : "Confirm accept"}
              </button>
            ) : (
              <button
                type="button"
                className={primaryClass}
                disabled={busy}
                onClick={() => setConfirming(true)}
              >
                {missing.length > 0 ? `Accept with ${missing.length} missing…` : "Accept…"}
              </button>
            )}
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => {
                setMode("idle");
                setConfirming(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {mode === "return" ? (
        <div className="space-y-2 rounded-sm border border-border bg-background p-2">
          <span className={labelClass}>Return this handoff</span>
          <p className="text-[11px] text-muted-foreground">
            Name the gaps you are returning it for. {CLOCK_RULE}
          </p>

          {/* Every REQUIRED item is listed, not only the absent ones. The
              commonest real return is "the success measures are there but they
              are not measurable" — an item that is present and still not good
              enough. Offering only the empty ones would leave a reviewer with
              nothing to name and force them to accept or say nothing. Absent
              items are pre-ticked and marked so the usual case stays one click. */}
          <ul className="space-y-0.5">
            {required.map((item) => (
              <li key={item.key}>
                <label className="flex items-baseline gap-2 text-[12px]">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={gaps.includes(item.key)}
                    disabled={busy}
                    onChange={(e) =>
                      setGaps(
                        e.target.checked ? [...gaps, item.key] : gaps.filter((k) => k !== item.key),
                      )
                    }
                  />
                  <span className={cn(!item.present && "font-medium")}>{item.label}</span>
                  {!item.present ? (
                    <span className="rounded-sm bg-status-blocked px-1 text-[10px] font-medium text-status-blocked-foreground">
                      Missing
                    </span>
                  ) : null}
                  <span className="text-[11px] text-muted-foreground">{item.detail}</span>
                </label>
              </li>
            ))}
          </ul>

          <label className="block space-y-0.5">
            <span className={labelClass}>Note (optional)</span>
            <textarea
              className={areaClass}
              aria-label="Return note"
              rows={2}
              value={note}
              disabled={busy}
              placeholder="What specifically has to change before this comes back"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          {error ? (
            <p className="text-[11px] text-status-blocked-foreground">{error.message}</p>
          ) : null}

          <div className="flex items-center gap-2">
            {/* The server rejects a return with no named gap, so the button is
                not offered until one is ticked. */}
            <button
              type="button"
              className={primaryClass}
              disabled={busy || gaps.length === 0}
              onClick={() => returnMutation.mutate()}
            >
              {returnMutation.isPending
                ? "Returning…"
                : `Return with ${gaps.length} named gap${gaps.length === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => setMode("idle")}
            >
              Cancel
            </button>
            {gaps.length === 0 ? (
              <span className="text-[11px] text-muted-foreground">
                Tick at least one gap — a return has to say what for.
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function HandoffPanel({
  customerId,
  implementationId,
}: {
  customerId: string;
  implementationId: string;
}) {
  const { data, isPending } = useQuery({
    queryKey: ["handoff", implementationId],
    queryFn: () => getHandoff({ data: { implementationId } }),
  });

  if (isPending) {
    return (
      <Panel title="Handoff">
        <NoRows label="Loading the handoff…" />
      </Panel>
    );
  }
  if (!data?.enabled) {
    return (
      <Panel title="Handoff">
        <NoRows label="The handoff gate is not switched on yet." />
      </Panel>
    );
  }
  if (!data.completeness) {
    return (
      <Panel title="Handoff">
        <NoRows label="No implementation record to check a handoff against." />
      </Panel>
    );
  }

  const c = data.completeness;
  const packet = data.packet;
  const status: HandoffStatus = packet?.status ?? "draft";
  const required = c.items.filter((i) => !i.optional);
  const optional = c.items.filter((i) => i.optional);
  const decision = data.events.find((e) => e.kind === "accepted" || e.kind === "returned");
  // Prefer the packet's own actor columns over the newest event: the event row
  // is written in a separate statement, so the packet is the surer record of
  // who did this. Fall back to the event, then to an honest "someone".
  const actorName = (id: string | null, fallback: string | null) =>
    (id ? data.actor_names[id] : null) ?? fallback ?? "someone";
  const submittedBy = actorName(packet?.submitted_by ?? null, submissionActor(data.events));
  const decidedBy = actorName(packet?.decided_by ?? null, decision?.actor_name ?? null);

  return (
    <Panel
      title="Handoff"
      meta="Completeness is a count of the facts on the live records — never a score"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-3 py-2">
        <StatusBadge status={status} />

        {/* The count, and nothing that stands in for judgement about it. */}
        <span className="text-[13px] font-medium">
          {c.present} of {c.required} required items present
        </span>
        {!c.complete ? (
          <span className="text-[11px] text-status-blocked-foreground">
            {c.required - c.present} missing, named below
          </span>
        ) : null}

        <span className="ml-auto text-[11px] text-muted-foreground">
          {status === "draft" ? "Not submitted yet." : null}
          {status === "submitted"
            ? `Submitted by ${submittedBy} · ${fmtDateTime(packet?.submitted_at)}`
            : null}
          {status === "accepted" || status === "returned"
            ? `${STATUS_LABEL[status]} by ${decidedBy} · ${fmtDateTime(packet?.decided_at)}`
            : null}
        </span>
      </div>

      {/* The accountability record: what it was sent back for, in full. */}
      {status === "returned" && packet ? (
        <div className="space-y-1 border-b border-border bg-status-blocked/20 px-3 py-2">
          <p className="text-[12px] font-semibold text-status-blocked-foreground">
            Returned to sales with {packet.return_missing_keys.length} named gap
            {packet.return_missing_keys.length === 1 ? "" : "s"}
          </p>
          {packet.return_missing_keys.length ? (
            <ul className="space-y-0.5">
              {packet.return_missing_keys.map((key) => (
                <li key={key} className="text-[12px] text-foreground">
                  • {labelFor(c.items, key)}
                </li>
              ))}
            </ul>
          ) : null}
          {packet.return_note ? (
            <p className="text-[12px] leading-snug text-foreground">{packet.return_note}</p>
          ) : null}
          <p className="text-[11px] text-muted-foreground">{CLOCK_RULE}</p>
        </div>
      ) : null}

      <div className="border-b border-border">
        <div className="flex items-baseline gap-2 bg-surface px-3 py-1.5">
          <span className="text-[12px] font-medium">Required</span>
          <span className={labelClass}>counted toward {c.required}</span>
        </div>
        <ul className="divide-y divide-border">
          {required.map((item) => (
            <ItemRow
              key={item.key}
              item={item}
              customerId={customerId}
              implementationId={implementationId}
            />
          ))}
        </ul>
      </div>

      {/* Kept apart and never counted: a handoff with no integration work
          genuinely has no integration dependencies, and calling that
          "incomplete" teaches people to type "n/a" into every box. */}
      <div className="border-b border-border">
        <div className="flex items-baseline gap-2 bg-surface px-3 py-1.5">
          <span className="text-[12px] font-medium">Optional</span>
          <span className={labelClass}>not counted — blank is a valid answer</span>
        </div>
        <ul className="divide-y divide-border">
          {optional.map((item) => (
            <ItemRow
              key={item.key}
              item={item}
              customerId={customerId}
              implementationId={implementationId}
            />
          ))}
        </ul>
      </div>

      <div className="border-b border-border">
        <PacketFields implementationId={implementationId} customerId={customerId} packet={packet} />
      </div>

      <Actions
        implementationId={implementationId}
        customerId={customerId}
        completeness={c}
        status={status}
      />

      {/* Every decision stays visible, including returns that were later
          resubmitted and accepted — that history is the point of the gate. */}
      {data.events.length ? (
        <div className="border-t border-border">
          <div className="flex items-baseline gap-2 bg-surface px-3 py-1.5">
            <span className="text-[12px] font-medium">History</span>
            <span className={labelClass}>most recent first</span>
          </div>
          <ul className="divide-y divide-border">
            {data.events.map((e) => (
              <li key={e.id} className="px-3 py-1.5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span
                    className={cn(
                      "text-[12px] font-medium",
                      e.kind === "returned" && "text-status-blocked-foreground",
                    )}
                  >
                    {EVENT_LABEL[e.kind]}
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    by {e.actor_name ?? "someone"}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {fmtDateTime(e.created_at)}
                  </span>
                </div>
                {e.missing_keys.length ? (
                  <p className="text-[11px] text-muted-foreground">
                    {e.kind === "returned" ? "Returned for" : "Missing at the time"}:{" "}
                    {e.missing_keys.map((k) => labelFor(c.items, k)).join(", ")}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Nothing required was missing at the time.
                  </p>
                )}
                {e.note ? <p className="text-[12px] leading-snug">{e.note}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}
