import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy } from "lucide-react";

import type { DealData } from "@/lib/deal-query";
import type { IntakeAnswers } from "@/lib/intake-answers";
import { getParkingLot } from "@/lib/parking-lot.functions";
import { saveIntake } from "@/lib/presale.functions";

/**
 * The close of a core meeting, written down: what was done, what is open and
 * whose, what each side prepares, the next objective. Saved on the deal and
 * turned into the email that goes out the same day, with the parking lot's
 * open items in it — the playbook's post-meeting recap.
 */
export function MeetingRecap({
  deal,
  intake,
  meetingKey,
  meetingLabel,
  next,
  editable,
}: {
  deal: DealData;
  intake: IntakeAnswers;
  meetingKey: string;
  meetingLabel: string;
  /** The next core meeting, when there is one: label, date and time. */
  next: { label: string; when: string | null } | null;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveIntake);
  const saved = intake.recaps[meetingKey];
  const [r, setR] = useState({
    completed: saved?.completed ?? "",
    open_items: saved?.open_items ?? "",
    customer_prep: saved?.customer_prep ?? "",
    gocanvas_prep: saved?.gocanvas_prep ?? "",
    next_objective:
      saved?.next_objective ?? (next ? next.label : "Close out: parking lot and handoff"),
  });
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lot = useQuery({
    queryKey: ["parking-lot", deal.account.id],
    queryFn: () => getParkingLot({ data: { dealId: deal.account.id } }),
  });
  const m = useMutation({
    mutationFn: () =>
      save({
        data: {
          dealId: deal.account.id,
          patch: { recaps: { [meetingKey]: { ...r, at: new Date().toISOString() } } },
        } as never,
      }),
    onMutate: () => setError(null),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["deal", deal.account.id] }),
    onError: (e) => setError((e as Error).message),
  });
  const parked = (lot.data ?? []).filter((i) => i.status === "open" || i.status === "scheduled");
  const first = deal.account.primary_contact_name?.trim().split(/\s+/)[0] ?? "there";
  const lines = (s: string) =>
    s
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => `• ${x.replace(/^[•\-*]\s*/, "")}`);
  const email = [
    `Subject: ${deal.account.name} × GoCanvas — ${meetingLabel} recap`,
    "",
    `Hi ${first},`,
    "",
    `Thanks for today. Here is where we landed.`,
    "",
    "Today we completed:",
    ...lines(r.completed),
    ...(r.open_items.trim() ? ["", "Still open (owner, date):", ...lines(r.open_items)] : []),
    ...(r.customer_prep.trim()
      ? ["", "Before the next meeting, your side:", ...lines(r.customer_prep)]
      : []),
    ...(r.gocanvas_prep.trim()
      ? ["", "Before the next meeting, our side:", ...lines(r.gocanvas_prep)]
      : []),
    ...(parked.length
      ? [
          "",
          "Parking lot — not no, just when:",
          ...parked.map((i) => `• ${i.request}${i.target ? ` (${i.target})` : ""}`),
        ]
      : []),
    "",
    next
      ? `Next: ${next.label}${next.when ? `, ${next.when}` : ""} — ${r.next_objective}`
      : `Next: ${r.next_objective}`,
    "",
    "Thanks,",
  ].join("\n");

  const area =
    "mt-0.5 block min-h-[48px] w-full rounded-sm border border-border bg-background px-2 py-1 text-[12px] text-foreground";
  const field = (key: keyof typeof r, label: string, placeholder: string) => (
    <label className="block text-[11px] text-muted-foreground">
      {label}
      <textarea
        className={area}
        placeholder={placeholder}
        value={r[key]}
        disabled={!editable}
        onChange={(e) => setR((p) => ({ ...p, [key]: e.target.value }))}
      />
    </label>
  );
  return (
    <div className="mt-2 space-y-2 rounded-md border border-border bg-background px-3 py-2.5">
      <p className="text-[12px] font-medium">
        {meetingLabel} — recap
        {saved ? (
          <span className="font-normal text-muted-foreground">
            {" "}
            · saved {saved.at.slice(0, 10)}
          </span>
        ) : null}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {field("completed", "Today we completed", "One per line")}
        {field("open_items", "Still open — with owner and date", "Pricing list — customer — Oct 2")}
        {field("customer_prep", "Their prep before next time", "Test on two real jobs")}
        {field("gocanvas_prep", "Our prep before next time", "Load the parts list")}
      </div>
      <label className="block text-[11px] text-muted-foreground">
        Next meeting's objective
        <input
          className="mt-0.5 block h-8 w-full rounded-sm border border-border bg-background px-2 text-[12px] text-foreground"
          value={r.next_objective}
          disabled={!editable}
          onChange={(e) => setR((p) => ({ ...p, next_objective: e.target.value }))}
        />
      </label>
      {parked.length ? (
        <p className="text-[11px] text-muted-foreground">
          The email includes the {parked.length} open parking-lot item
          {parked.length === 1 ? "" : "s"}.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          disabled={!editable || m.isPending || !r.completed.trim()}
          onClick={() => {
            m.mutate();
            void navigator.clipboard.writeText(email).then(() => setCopied(true));
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? "Saved and copied" : "Save and copy the recap email"}
        </button>
        {!r.completed.trim() ? (
          <span className="text-[11px] text-muted-foreground">Write what was completed first.</span>
        ) : null}
      </div>
      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}
