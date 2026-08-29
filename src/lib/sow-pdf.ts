import { jsPDF } from "jspdf";

import {
  deliveryWindowLabel,
  EXTRACTION_SECTIONS,
  proposedTimings,
  TIMING_SOURCE_LABEL,
  type ProposedTiming,
  type SowAnalysis,
  type SowProposedStage,
  type TimingOverride,
} from "@/lib/sow-analysis";
import { LIFECYCLE_STAGES, STAGE_ALIASES } from "@/lib/lifecycle";

/** Same grouping the screen uses, so the shared file matches what the TIS reviewed. */
type Entry = { stage: SowProposedStage; timing: ProposedTiming | null };

function groupByStage(entries: Entry[]) {
  const buckets = new Map<string, Entry[]>();
  const unmapped: Entry[] = [];
  for (const entry of entries) {
    const id =
      STAGE_ALIASES[entry.stage.lifecycleStage ?? ""] ?? entry.stage.lifecycleStage ?? "";
    if (LIFECYCLE_STAGES.some((s) => s.id === id)) {
      buckets.set(id, [...(buckets.get(id) ?? []), entry]);
    } else {
      unmapped.push(entry);
    }
  }
  const groups = LIFECYCLE_STAGES.filter((s) => buckets.has(s.id)).map((s) => ({
    label: s.label,
    stages: buckets.get(s.id)!,
  }));
  if (unmapped.length > 0) groups.push({ label: "Not matched to a stage", stages: unmapped });
  return groups;
}

function safeFileName(s: string) {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "sow-analysis";
}

/**
 * Writes the analysis and the stage-grouped journey to a PDF a stakeholder can
 * read without the app. Nothing is sent to a server — the file is built in the
 * browser and downloaded.
 */
export function downloadSowAnalysisPdf({
  analysis,
  customerName,
  sowName,
  analysedAt,
  startDate,
  overrides = {},
}: {
  analysis: SowAnalysis;
  customerName: string;
  sowName: string | null;
  analysedAt: Date;
  /** Anchors proposed weeks to calendar dates when the implementation has a start date. */
  startDate?: string | null | undefined;
  /** TIS adjustments to the proposed weeks, keyed by journey index. */
  overrides?: Record<number, TimingOverride>;
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 48;
  const marginTop = 56;
  const bottom = doc.internal.pageSize.getHeight() - 56;
  const width = doc.internal.pageSize.getWidth() - marginX * 2;
  let y = marginTop;

  const space = (needed: number) => {
    if (y + needed > bottom) {
      doc.addPage();
      y = marginTop;
    }
  };

  const text = (
    value: string,
    opts: { size?: number; style?: "normal" | "bold" | "italic"; indent?: number; gap?: number; color?: number } = {},
  ) => {
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 0;
    doc.setFont("helvetica", opts.style ?? "normal");
    doc.setFontSize(size);
    doc.setTextColor(opts.color ?? 30);
    const lines = doc.splitTextToSize(value, width - indent) as string[];
    for (const line of lines) {
      space(size + 4);
      doc.text(line, marginX + indent, y);
      y += size + 3;
    }
    y += opts.gap ?? 0;
  };

  const heading = (value: string) => {
    space(34);
    y += 8;
    text(value, { size: 12, style: "bold", gap: 2 });
    space(8);
    doc.setDrawColor(210);
    doc.line(marginX, y - 4, marginX + width, y - 4);
    y += 4;
  };

  // Cover block
  text("SOW analysis and proposed journey", { size: 17, style: "bold", gap: 4 });
  text(customerName, { size: 12, gap: 2 });
  text(
    `Source document: ${sowName ?? "attached SOW"} · Generated ${analysedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`,
    { size: 9, color: 110, gap: 6 },
  );
  text(
    "Draft for discussion. The extracted section reflects what the SOW says; the journey is a proposal that a TIS must confirm before it becomes the plan.",
    { size: 9, style: "italic", color: 110, gap: 4 },
  );

  if (analysis.summary) {
    heading("Summary");
    text(analysis.summary);
  }

  if (analysis.problem) {
    heading("Problem reading the document");
    text(analysis.problem);
  }

  heading("What the SOW says");
  for (const section of EXTRACTION_SECTIONS) {
    const findings = analysis.extraction[section.key];
    if (findings.length === 0) continue;
    space(30);
    y += 4;
    text(section.label, { size: 10, style: "bold", gap: 1 });
    for (const f of findings) {
      text(`• ${f.text}${f.confidence !== "stated" ? ` (${f.confidence})` : ""}`, { indent: 10 });
      if (f.quote) text(`“${f.quote}”`, { size: 8.5, style: "italic", color: 120, indent: 22 });
    }
  }

  heading("Timeline stated in the SOW");
  const window = deliveryWindowLabel(analysis);
  text(window ? `Overall duration: ${window}.` : "The SOW states no overall delivery duration.");
  if (analysis.deliveryWindow.startCondition)
    text(`Starts on: ${analysis.deliveryWindow.startCondition}`, { indent: 10 });
  for (const d of analysis.deliveryWindow.delayConditions)
    text(`Delay condition: ${d}`, { indent: 10 });
  if (analysis.deliveryWindow.quote)
    text(`“${analysis.deliveryWindow.quote}”`, { size: 8.5, style: "italic", color: 120, indent: 10 });

  heading("AI-proposed planning timeline by stage");
  const timings = proposedTimings(analysis, startDate ?? null, overrides);
  text(
    `${
      startDate
        ? `Proposed dates are counted from the recorded start date (${startDate.slice(0, 10)}).`
        : "Timing is shown in relative weeks; no calendar dates are proposed."
    } Estimated from the scope and dependencies the SOW describes — a planning recommendation, not committed dates and not an even split of the total.`,
    { size: 9, style: "italic", color: 110, gap: 4 },
  );
  const groups = groupByStage(
    analysis.proposedJourney.map((stage, i) => ({ stage, timing: timings[i] ?? null })),
  );
  if (groups.length === 0) text("No journey was proposed from this document.");
  for (const group of groups) {
    space(40);
    y += 6;
    text(group.label.toUpperCase(), { size: 9, style: "bold", color: 110, gap: 1 });
    for (const { stage, timing } of group.stages) {
      text(
        timing
          ? `${timing.weeks}${timing.dates ? ` · ${timing.dates}` : ""} · ${TIMING_SOURCE_LABEL[timing.source]}${
              timing.overlapsWith.length > 0 ? " · overlaps" : ""
            }`
          : "Timing not proposed — insufficient information in the SOW",
        { size: 8.5, color: 110, gap: 0 },
      );
      text(stage.name, { size: 10.5, style: "bold", gap: 1 });
      if (stage.purpose) text(stage.purpose, { indent: 10 });
      if (timing?.statedText)
        text(`SOW timing: ${timing.statedText}`, { size: 9, color: 110, indent: 16 });
      if (timing?.rationale)
        text(`Why this duration: ${timing.rationale}`, { size: 9, color: 110, indent: 16 });
      if (timing?.dependencyDriver)
        text(`Timing depends on: ${timing.dependencyDriver}`, { size: 9, color: 110, indent: 16 });
      if (timing && timing.overlapsWith.length > 0)
        text(`Runs alongside: ${timing.overlapsWith.join("; ")}`, {
          size: 9,
          color: 110,
          indent: 16,
        });
      if (timing?.beyondSowWindow)
        text("Extends past the delivery window the SOW states.", {
          size: 9,
          color: 110,
          indent: 16,
        });

      for (const w of stage.workstreams) text(`• ${w}`, { indent: 16 });
      if (stage.dependencies.length > 0)
        text(`Depends on: ${stage.dependencies.join("; ")}`, { size: 9, color: 110, indent: 16 });
      if (stage.customerResponsibilities.length > 0)
        text(`Customer has to: ${stage.customerResponsibilities.join("; ")}`, {
          size: 9,
          color: 110,
          indent: 16,
        });
      if (stage.acceptanceCriteria.length > 0)
        text(`Accepted when: ${stage.acceptanceCriteria.join("; ")}`, {
          size: 9,
          color: 110,
          indent: 16,
          gap: 4,
        });
      y += 4;
    }
  }

  if (analysis.assumptions.length > 0) {
    heading("Assumptions made");
    for (const a of analysis.assumptions) text(`• ${a}`, { indent: 10 });
  }

  if (analysis.gaps.length > 0) {
    heading("Gaps to confirm with the customer");
    for (const g of analysis.gaps) text(`• ${g}`, { indent: 10 });
  }

  // Page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`${customerName} · SOW analysis · Page ${i} of ${pages}`, marginX, bottom + 28);
  }

  doc.save(`${safeFileName(customerName)}-sow-analysis.pdf`);
}
