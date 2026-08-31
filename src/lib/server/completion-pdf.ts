import { BRAND } from "@/lib/brand";
import type { CompletionDocument } from "@/lib/completion-record";

import { openBrandedPdf, PDF_BODY_SOFT } from "@/lib/pdf-kit";

/**
 * The PDF of a completion record.
 *
 * It renders the FROZEN document and nothing else. There is no second query
 * and no second serializer, so a completion record's PDF cannot show a fact
 * the record does not contain, and cannot drift as the underlying rows change.
 *
 * Chrome, type and the cyan rule come from `pdf-kit`, the same system the
 * customer's plan and the weekly snapshot are set in — this file only decides
 * what the document says. A section with nothing in it renders as an ABSENCE
 * panel rather than as body text, because "No risks were recorded" must not
 * read like an answer.
 *
 * Accepted limitation, the same one the snapshot carries: a downloaded PDF
 * cannot be revoked.
 */
export async function renderCompletionPdf(doc: CompletionDocument): Promise<Uint8Array> {
  const pdf = await openBrandedPdf({
    title: doc.customer_name,
    subtitle:
      doc.subject_type === "solution"
        ? `Solution complete — ${doc.title}`
        : `Implementation complete — ${doc.title}`,
    meta: `Recorded ${doc.completed_at.slice(0, 10)}`,
    dateFor: doc.completed_at,
  });

  if (doc.headline.length) {
    pdf.pairs(doc.headline);
  }

  for (const section of doc.sections) {
    pdf.section(section.heading, section.note ?? undefined);

    if (section.entries.length === 0) {
      pdf.absent(section.emptyNote);
      continue;
    }

    for (const entry of section.entries) {
      pdf.line(entry.title, { size: 10.5, style: "bold" });
      if (entry.detail) {
        pdf.line(entry.detail, { size: 9.5, color: PDF_BODY_SOFT, gap: 12, indent: 14 });
      }
      for (const [k, v] of entry.meta ?? []) {
        pdf.line(`${k}: ${v}`, { size: 8.5, color: BRAND.fg2, gap: 11, indent: 14 });
      }
      pdf.gap(4);
    }
  }

  pdf.gap(6);
  pdf.line(
    "This document is frozen: it shows what the work looked like when it finished, not what the record says today.",
    { size: 8.5, style: "italic", color: BRAND.fg2, gap: 11 },
  );

  return pdf.finish();
}
