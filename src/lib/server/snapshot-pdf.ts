import { BRAND } from "@/lib/brand";
import type { SharedPlanSnapshot } from "@/lib/shared-plan";

import { MARKS, openBrandedPdf } from "@/lib/pdf-kit";

/**
 * Server-side PDF for a weekly snapshot.
 *
 * It renders the FROZEN snapshot content and nothing else, so a PDF can never
 * show a field the plan page would not: there is no second query and no second
 * serializer, only this one layout over an already-projected document.
 *
 * Chrome and type come from `pdf-kit`, so this is set in the same system as
 * the customer's full plan — a customer who has both in their inbox should not
 * be able to tell they were built by different code.
 *
 * `src/lib/sow-pdf.ts` remains separate: it is client-side jsPDF imported by a
 * React component, and this module runs only in Node.
 *
 * Accepted limitation, stated in the design's risks: a downloaded PDF cannot be
 * revoked.
 */
export async function renderSnapshotPdf(snapshot: SharedPlanSnapshot): Promise<Uint8Array> {
  const plan = snapshot.plan;

  const pdf = await openBrandedPdf({
    title: plan.customer_name,
    subtitle: `${plan.implementation_name} — week of ${snapshot.week_start}`,
    meta: `Stage: ${plan.stage_label}${
      plan.target_launch_date ? `   ·   Target launch: ${plan.target_launch_date}` : ""
    }`,
    dateFor: plan.generated_at,
  });

  if (snapshot.attention.length) {
    pdf.section("Worth a look");
    for (const a of snapshot.attention) pdf.line(`•  ${a}`);
  }

  pdf.section("With you");
  if (snapshot.you_owe.length === 0) {
    pdf.line("Nothing outstanding on your side.", { color: BRAND.fg2 });
  }
  for (const t of snapshot.you_owe) {
    pdf.line(`${MARKS.open}  ${t.title}${t.due_date ? ` — due ${t.due_date}` : ""}`);
  }

  pdf.section("With GoCanvas");
  if (snapshot.we_owe.length === 0) {
    pdf.line("Nothing outstanding on our side.", { color: BRAND.fg2 });
  }
  for (const c of snapshot.we_owe) {
    pdf.line(`${MARKS.open}  ${c.description}${c.due_date ? ` — due ${c.due_date}` : ""}`);
  }

  if (snapshot.next_milestone) {
    pdf.section("Next milestone");
    pdf.line(
      `${snapshot.next_milestone.name}${
        snapshot.next_milestone.target_date ? ` — ${snapshot.next_milestone.target_date}` : ""
      }`,
    );
  }

  if (snapshot.contact) {
    pdf.section("Who to ask");
    pdf.line([snapshot.contact.name, snapshot.contact.email].filter(Boolean).join("   ·   "));
  }

  pdf.gap(8);
  pdf.line(`Generated ${plan.generated_at.slice(0, 10)}.`, {
    size: 8.5,
    style: "italic",
    color: BRAND.fg2,
    gap: 11,
  });

  return pdf.finish();
}
