import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";

import { groundOnboarding, type OnboardingReading } from "@/lib/onboarding-grounding";

import { aiConfigured } from "../ai/config";
import { runStructured } from "../ai/client";
import type { PreparedDocument } from "../ai/documents";
import { briefJsonSchema } from "../schemas";

const onboardingSchema = briefJsonSchema.shape.onboarding.unwrap();

const VERIFY_SYSTEM = `You check another model's reading of a GoCanvas deal before it fills the onboarding intake. You are given the signed SOW (when there is one), the call notes, and the reading. Return the corrected reading, same JSON shape, and nothing else.

Check each item against the sources:
- forms: keep only things a person fills in on a phone or tablet (inspections, work orders, timesheets, audits, tickets). Remove every integration, sync, connector, dispatch add-on, dashboard, analytics, reporting, training or PDF-design service, and anything the SOW lists as a paid service. Remove a form neither source names. Keep the customer's own name for it, short, no description after a dash. Keep the order: the most important form first. Add a form only if a source plainly names one the reading missed, with its quote.
- flow: "existing" only when they already run GoCanvas; "dm_conversion" only when they are leaving Device Magic; "field_fusion" only when Field Fusion or FFIQ is the product; otherwise "new_logo" when it is a first rollout. Null when the sources do not settle it.
- training_only, solutions_involved: true or false only when a source says so; the SOW decides what was bought.
- current_process: how the work is done today, from the sources, not a pitch for GoCanvas.
- Every quote is word for word from its source, under 200 characters; source is "SOW" or the call notes' title. Drop anything you cannot quote.`;

/**
 * The second reading. A model checks the first model's onboarding block
 * against the same sources, then the code rules run again on its answer —
 * so the verifier can remove and correct, but cannot add anything the calls
 * do not say. Never throws: a verifier that fails leaves the first reading,
 * already grounded, in place.
 */
export async function verifyOnboarding(args: {
  reading: OnboardingReading | null | undefined;
  callsText: string;
  sow: PreparedDocument | null;
  dealId?: string | null | undefined;
}): Promise<OnboardingReading | null> {
  const grounded = groundOnboarding(args.reading, args.callsText);
  if (!grounded || !aiConfigured()) return grounded;
  try {
    const content: BetaContentBlockParam[] = [];
    if (args.sow?.block) content.push(args.sow.block);
    content.push({
      type: "text",
      text: `CALL NOTES\n\n${args.callsText.slice(0, 120_000)}\n\n---\n\nTHE READING TO CHECK\n\n${JSON.stringify(grounded, null, 2)}`,
    });
    const { data } = await runStructured({
      kind: "verify",
      schema: onboardingSchema,
      system: [{ type: "text", text: VERIFY_SYSTEM }],
      content,
      maxTokens: 16000,
      dealId: args.dealId ?? null,
    });
    return groundOnboarding(data, args.callsText) ?? grounded;
  } catch (e) {
    console.error("[brief] the verifier did not run; the grounded first reading stands", e);
    return grounded;
  }
}
