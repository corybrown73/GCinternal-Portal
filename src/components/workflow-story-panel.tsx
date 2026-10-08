import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Panel } from "@/components/record";
import { canEditDeal, useProfile } from "@/lib/auth";
import { confirmWorkflowStoryFn } from "@/lib/implementation-focus.functions";
import type { IntakeAnswers, WorkflowStory } from "@/lib/intake-answers";
import { shortDay } from "@/lib/onboarding-timeline";
import { saveIntake } from "@/lib/presale.functions";

const LEGS: ReadonlyArray<{ key: "before" | "during" | "after"; label: string; hint: string }> = [
  { key: "before", label: "Before", hint: "What happens before anyone is in the field." },
  { key: "during", label: "During", hint: "What the person in the field does." },
  { key: "after", label: "After", hint: "What happens to the submission." },
];

/**
 * The workflow story in three beats, as Kickoff View and the welcome page
 * tell it. The AI reading drafts it from the calls; here the TIS reads it,
 * retypes a beat in the customer's own words, and confirms it. Until the
 * confirmation the pages show it as "to confirm". Internal only, beside
 * the Implementation Focus it belongs with.
 */
export function WorkflowStoryPanel({ dealId, intake }: { dealId: string; intake: IntakeAnswers }) {
  const { profile } = useProfile();
  const editable = canEditDeal(profile?.role);
  const qc = useQueryClient();
  const confirmFn = useServerFn(confirmWorkflowStoryFn);
  const save = useServerFn(saveIntake);
  const [error, setError] = useState<string | null>(null);

  const story = intake.workflow_story;
  const drafted = Boolean(story.before || story.during || story.after);
  const confirmed = Boolean(story.validated_at);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["deal", dealId] });
    void qc.invalidateQueries({ queryKey: ["welcome", dealId] });
  };

  const write = useMutation({
    mutationFn: (next: WorkflowStory) =>
      save({ data: { dealId, patch: { workflow_story: next } } as never }),
    onMutate: () => setError(null),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof Error ? e.message : "Could not save."),
  });
  const confirmMutation = useMutation({
    mutationFn: () => confirmFn({ data: { dealId } }),
    onMutate: () => setError(null),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof Error ? e.message : "Could not confirm."),
  });

  return (
    <Panel
      title={confirmed ? "Confirmed workflow story" : "Workflow story"}
      level="primary"
      collapsible
      defaultOpen
      collapseKey="customer:implementation:story"
      meta={
        confirmed
          ? `Confirmed ${shortDay(story.validated_at!)}`
          : drafted
            ? "Drafted from the calls · not yet confirmed"
            : "Nothing written yet"
      }
    >
      <div className="space-y-2.5 p-3">
        {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
        <p className="text-[12px] text-muted-foreground">
          {confirmed
            ? "Before, during and after the field work, in the customer's words. Changing a beat clears the confirmation until you confirm the new words."
            : drafted
              ? "Before, during and after the field work, in the customer's words. Retype a beat as they said it, then confirm."
              : "Before, during and after the field work. The AI reading drafts it from the calls; you can write it here."}
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {LEGS.map((leg) => (
            <label key={leg.key} className="space-y-1 text-[12px]">
              <span className="font-medium">{leg.label}</span>
              <textarea
                className="min-h-[72px] w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] outline-none focus:ring-1 focus:ring-ring disabled:opacity-70"
                placeholder={leg.hint}
                defaultValue={story[leg.key] ?? ""}
                disabled={!editable || write.isPending}
                onBlur={(e) => {
                  const next = e.target.value.trim() || null;
                  if (next === story[leg.key]) return;
                  // A confirmation names the words it confirmed: a beat
                  // retyped after it is a new story, to be confirmed again.
                  write.mutate({
                    ...story,
                    [leg.key]: next,
                    validated_at: null,
                    validated_by: null,
                  });
                }}
              />
            </label>
          ))}
        </div>
        {editable && drafted && !confirmed ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={confirmMutation.isPending}
            onClick={() => confirmMutation.mutate()}
            title="You read this with the customer and these are their words"
          >
            {confirmMutation.isPending ? "Confirming…" : "Confirm workflow story"}
          </button>
        ) : null}
      </div>
    </Panel>
  );
}
