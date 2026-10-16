import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { addCustomerMeetingNote } from "@/lib/hub.functions";
import { localIso } from "@/lib/onboarding-timeline";
import { cn } from "@/lib/utils";

const FIELD = "mt-1 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-[13px]";

/**
 * Record a customer meeting without a transcript: a date, who was there, and
 * what was discussed. Saving writes one journal entry. It does not create risks,
 * issues, decisions, commitments, date changes or stage movement.
 */
export function CustomerMeetingForm({
  implementationId,
  onSaved,
  onCancel,
  onAnalyseTranscript,
}: {
  implementationId: string;
  onSaved: () => void;
  onCancel: () => void;
  onAnalyseTranscript: () => void;
}) {
  const qc = useQueryClient();
  const save = useServerFn(addCustomerMeetingNote);
  const [meetingDate, setMeetingDate] = useState(() => localIso());
  const [participants, setParticipants] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () =>
      save({
        data: { implementationId, meetingDate, participants, note },
      } as never),
    onMutate: () => setError(null),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["customer360"] });
      onSaved();
    },
    onError: (e) => setError((e as Error).message),
  });

  const ready = meetingDate !== "" && note.trim() !== "";

  return (
    <form
      className="mt-3 rounded-md border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) m.mutate();
      }}
    >
      <p className="text-[13px] font-semibold">Record customer meeting</p>

      <label className="mt-2.5 block text-[12px] font-medium">
        Meeting date
        <input
          type="date"
          required
          value={meetingDate}
          onChange={(e) => setMeetingDate(e.target.value)}
          className={FIELD}
        />
      </label>

      <label className="mt-2.5 block text-[12px] font-medium">
        Participants <span className="font-normal text-muted-foreground">(optional)</span>
        <input
          type="text"
          maxLength={500}
          value={participants}
          onChange={(e) => setParticipants(e.target.value)}
          placeholder="Names as you would say them"
          className={FIELD}
        />
      </label>

      <label className="mt-2.5 block text-[12px] font-medium">
        What was discussed
        <textarea
          required
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={cn(FIELD, "resize-y")}
        />
      </label>

      <p className="mt-2.5 text-[11.5px] text-muted-foreground">
        Saved to implementation history as a customer meeting. It does not create risks, issues,
        decisions, commitments, dates or stage changes.
      </p>

      {error ? (
        <p role="alert" className="mt-2 text-[12px] text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={!ready || m.isPending}
          className="rounded-sm bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
        >
          {m.isPending ? "Saving…" : "Save meeting note"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-sm border border-border px-3 py-1.5 text-[12px] hover:bg-muted"
        >
          Cancel
        </button>
      </div>

      <p className="mt-3 border-t border-border pt-2.5 text-[12px] text-muted-foreground">
        Have a transcript instead?{" "}
        <button
          type="button"
          onClick={onAnalyseTranscript}
          className="font-medium text-primary hover:underline"
        >
          Analyse meeting transcript →
        </button>
      </p>
    </form>
  );
}
