import type { IntakeAnswers } from "./intake-answers";
import type { ServiceSpec } from "./onboarding-services";
import type { BriefJson } from "./server/schemas";
import { synthesisFromBrief } from "./welcome-synthesis";

/**
 * The AI synthesis of the calls, written into the intake — blanks only.
 *
 * WHY BLANKS ONLY. The intake is what a person typed on a call with the
 * customer; the synthesis is what a model read out of the notes. Where the
 * person has said something, they win, every time. Where they have not,
 * the synthesis gets the field started: how the job runs today, the forms
 * they named, the seat count, the systems to connect. The person sees what
 * was filled and can change any of it — the same fields, the same panel.
 */
export function prefillFromSynthesis(
  intake: IntakeAnswers,
  brief: unknown,
): { patch: Partial<IntakeAnswers>; filled: string[] } {
  const patch: Partial<IntakeAnswers> = {};
  const filled: string[] = [];
  const b = brief as Partial<BriefJson> | null | undefined;
  if (!b || typeof b !== "object") return { patch, filled };
  const synth = synthesisFromBrief(b);

  if (!intake.current_process && synth?.currentProcess) {
    patch.current_process = synth.currentProcess;
    filled.push("the process today");
  }

  const scope = (b.kickoff?.scope ?? []).map((s) => s.workflow?.trim()).filter(Boolean);
  if (!intake.wanted_forms.length && scope.length) {
    patch.wanted_forms = scope.slice(0, 8).map((name, i) => ({
      id: `syn-${i + 1}`,
      name: name.slice(0, 160),
      template_id: null,
    }));
    filled.push(
      `${scope.length === 1 ? "the first form" : `${Math.min(scope.length, 8)} forms to build`}`,
    );
  }

  if (intake.field_users == null && b.kickoff?.licensed_seats) {
    const n = Number(/\d[\d,]*/.exec(b.kickoff.licensed_seats)?.[0]?.replace(/,/g, ""));
    if (Number.isInteger(n) && n > 0) {
      patch.field_users = n;
      filled.push("people in the field");
    }
  }

  const hasServices =
    (intake.timeline.services?.length ?? 0) > 0 || (intake.timeline.integration_tier ?? 0) > 0;
  if (!hasServices) {
    const names = new Set<string>();
    for (const line of b.kickoff?.integrations ?? []) {
      const system = line.split("·")[0]?.trim();
      if (system) names.add(system);
    }
    if (b.expansion?.integration_target) names.add(b.expansion.integration_target.trim());
    if (names.size) {
      const services: ServiceSpec[] = [...names].slice(0, 6).map((name, i) => ({
        id: `syn-int-${i + 1}`,
        kind: "integration",
        name: name.slice(0, 120),
        phase: 2,
        tier: 3,
      }));
      patch.timeline = { ...intake.timeline, services };
      filled.push(
        names.size === 1 ? `the ${[...names][0]} integration` : `${names.size} integrations`,
      );
    }
  }

  return { patch, filled };
}
