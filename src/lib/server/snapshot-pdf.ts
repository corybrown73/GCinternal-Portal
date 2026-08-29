import type { SharedPlanSnapshot } from "@/lib/shared-plan";

/**
 * Server-side PDF for a weekly snapshot.
 *
 * Net-new: `src/lib/sow-pdf.ts` is client-side jsPDF imported by a React
 * component and is untouched by this. jsPDF runs in Node for text and vector
 * output — no DOM, no headless browser on Vercel — which is why the layout here
 * is deliberately text and rules only.
 *
 * It renders the FROZEN snapshot content and nothing else, so a PDF can never
 * show a field the plan page would not: there is no second query and no second
 * serializer, only this one layout over an already-projected document.
 *
 * Accepted limitation, stated in the design's risks: a downloaded PDF cannot be
 * revoked.
 */
export async function renderSnapshotPdf(snapshot: SharedPlanSnapshot): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  const margin = 54;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  let y = margin;

  const line = (text: string, size = 10, style: "normal" | "bold" = "normal", gap = 14) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    for (const part of doc.splitTextToSize(text, width) as string[]) {
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(part, margin, y);
      y += gap;
    }
  };

  const rule = () => {
    y += 4;
    doc.setDrawColor(220);
    doc.line(margin, y, margin + width, y);
    y += 14;
  };

  const plan = snapshot.plan;
  line(plan.customer_name, 18, "bold", 22);
  line(`${plan.implementation_name} — week of ${snapshot.week_start}`, 11, "normal", 18);
  line(`Stage: ${plan.stage_label}`, 10, "normal", 16);
  if (plan.target_launch_date) line(`Target launch: ${plan.target_launch_date}`, 10, "normal", 16);
  rule();

  if (snapshot.attention.length) {
    line("Worth a look", 13, "bold", 18);
    for (const a of snapshot.attention) line(`• ${a}`, 10);
    rule();
  }

  line("With you", 13, "bold", 18);
  if (snapshot.you_owe.length === 0) line("Nothing outstanding on your side.", 10);
  for (const t of snapshot.you_owe) {
    line(`• ${t.title}${t.due_date ? ` — due ${t.due_date}` : ""}`, 10);
  }
  rule();

  line("With GoCanvas", 13, "bold", 18);
  if (snapshot.we_owe.length === 0) line("Nothing outstanding on our side.", 10);
  for (const c of snapshot.we_owe) {
    line(`• ${c.description}${c.due_date ? ` — due ${c.due_date}` : ""}`, 10);
  }
  rule();

  if (snapshot.next_milestone) {
    line("Next milestone", 13, "bold", 18);
    line(
      `${snapshot.next_milestone.name}${
        snapshot.next_milestone.target_date ? ` — ${snapshot.next_milestone.target_date}` : ""
      }`,
      10,
    );
    rule();
  }

  if (snapshot.contact) {
    line(
      `Questions: ${snapshot.contact.name}${snapshot.contact.email ? ` · ${snapshot.contact.email}` : ""}`,
      10,
      "normal",
      16,
    );
  }
  line(`Generated ${plan.generated_at.slice(0, 10)} · GoCanvas`, 8, "normal", 12);

  return new Uint8Array(doc.output("arraybuffer"));
}
