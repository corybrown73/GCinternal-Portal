import type { CompletionDocument } from "@/lib/completion-record";

/**
 * The PDF of a completion record.
 *
 * Same shape of thing as `snapshot-pdf.ts` and for the same reason: jsPDF runs
 * in Node for text and vector output — no DOM, no headless browser on Vercel —
 * so the layout is deliberately text and rules only.
 *
 * It renders the FROZEN document and nothing else. There is no second query
 * and no second serializer, so a completion record's PDF cannot show a fact
 * the record does not contain, and cannot drift as the underlying rows change.
 *
 * Accepted limitation, the same one the snapshot carries: a downloaded PDF
 * cannot be revoked.
 */
export async function renderCompletionPdf(doc: CompletionDocument): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "letter" });

  const margin = 54;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  let y = margin;

  const page = () => {
    if (y > pdf.internal.pageSize.getHeight() - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  const line = (
    text: string,
    size = 10,
    style: "normal" | "bold" | "italic" = "normal",
    gap = 13,
    indent = 0,
  ) => {
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
    for (const part of pdf.splitTextToSize(text, width - indent) as string[]) {
      page();
      pdf.text(part, margin + indent, y);
      y += gap;
    }
  };

  const rule = () => {
    y += 4;
    page();
    pdf.setDrawColor(210);
    pdf.line(margin, y, margin + width, y);
    y += 13;
  };

  line(doc.customer_name, 18, "bold", 22);
  line(
    doc.subject_type === "solution"
      ? `Solution complete — ${doc.title}`
      : `Implementation complete — ${doc.title}`,
    12,
    "normal",
    18,
  );
  rule();

  for (const [k, v] of doc.headline) line(`${k}: ${v}`, 9.5, "normal", 12);
  rule();

  for (const section of doc.sections) {
    // Keep a heading with at least its first line rather than stranding it at
    // the foot of a page.
    if (y > pdf.internal.pageSize.getHeight() - margin - 60) {
      pdf.addPage();
      y = margin;
    }
    line(section.heading, 12.5, "bold", 17);
    if (section.note) line(section.note, 9, "italic", 12);
    y += 2;

    if (section.entries.length === 0) {
      line(section.emptyNote, 9.5, "italic", 13, 10);
    } else {
      for (const entry of section.entries) {
        line(entry.title, 10, "bold", 13, 10);
        if (entry.detail) line(entry.detail, 9.5, "normal", 12, 20);
        for (const [k, v] of entry.meta ?? []) line(`${k}: ${v}`, 8.5, "normal", 11, 20);
        y += 4;
      }
    }
    rule();
  }

  line(
    `Recorded ${doc.completed_at.slice(0, 10)}. This document is frozen: it shows what the work looked like when it finished, not what the record says today.`,
    8.5,
    "italic",
    11,
  );

  return new Uint8Array(pdf.output("arraybuffer"));
}
