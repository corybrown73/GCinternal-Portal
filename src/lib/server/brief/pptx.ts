import PptxGenJS from "pptxgenjs";
import { BRAND } from "./brand";
import type { BriefJson } from "../schemas";

const MASTER = "GC_MASTER";

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out.length ? out : [[]];
}

function addBulletSlide(pptx: PptxGenJS, title: string, bullets: string[]) {
  const slide = pptx.addSlide({ masterName: MASTER });
  slide.addText(title, {
    x: 0.5, y: 0.35, w: 9, h: 0.6,
    fontSize: 24, bold: true, color: BRAND.green, fontFace: BRAND.fontHead,
  });
  slide.addText(
    bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
    { x: 0.6, y: 1.2, w: 8.8, h: 3.9, fontSize: 14, color: BRAND.ink, fontFace: BRAND.fontBody, valign: "top" }
  );
}

function addTableSlide(
  pptx: PptxGenJS,
  title: string,
  header: string[],
  rows: string[][]
) {
  const slide = pptx.addSlide({ masterName: MASTER });
  slide.addText(title, {
    x: 0.5, y: 0.35, w: 9, h: 0.6,
    fontSize: 24, bold: true, color: BRAND.green, fontFace: BRAND.fontHead,
  });
  slide.addTable(
    [
      header.map((h) => ({
        text: h,
        options: { bold: true, color: "FFFFFF", fill: { color: BRAND.green } },
      })),
      ...rows.map((r) => r.map((c) => ({ text: c }))),
    ],
    {
      x: 0.5, y: 1.2, w: 9,
      fontSize: 12, color: BRAND.ink, fontFace: BRAND.fontBody,
      border: { type: "solid", color: BRAND.line, pt: 0.5 },
      autoPage: true, autoPageRepeatHeader: true,
    }
  );
}

export async function buildBriefDeck(brief: BriefJson): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.defineSlideMaster({
    title: MASTER,
    background: { color: "FFFFFF" },
    objects: [
      { rect: { x: 0, y: 5.32, w: "100%", h: 0.31, fill: { color: BRAND.green } } },
      {
        text: {
          text: "GoCanvas Internal — Account Brief",
          options: { x: 0.5, y: 5.32, w: 6, h: 0.3, fontSize: 9, color: "FFFFFF", fontFace: BRAND.fontBody },
        },
      },
    ],
  });

  // 1 — Title
  const title = pptx.addSlide({ masterName: MASTER });
  title.addText("Account Brief", {
    x: 0.5, y: 1.2, w: 9, h: 0.6, fontSize: 20, color: BRAND.slate, fontFace: BRAND.fontHead,
  });
  title.addText(brief.account_name, {
    x: 0.5, y: 1.7, w: 9, h: 1.0, fontSize: 40, bold: true, color: BRAND.green, fontFace: BRAND.fontHead,
  });
  title.addText(brief.one_liner, {
    x: 0.5, y: 2.9, w: 9, h: 1.2, fontSize: 16, color: BRAND.ink, fontFace: BRAND.fontBody,
  });
  title.addText(`Prepared ${new Date().toLocaleDateString("en-US", { dateStyle: "long" })}`, {
    x: 0.5, y: 4.4, w: 9, h: 0.4, fontSize: 12, color: BRAND.slate, fontFace: BRAND.fontBody,
  });

  // 2 — Goals (if any)
  if (brief.goals.length) addBulletSlide(pptx, "Goals & Why They Bought", brief.goals);

  // 3+ — Current process
  for (const section of brief.current_process) {
    addBulletSlide(pptx, `Current Process — ${section.title}`, section.bullets);
  }

  // What we know
  if (brief.what_we_know.length) {
    for (const group of chunk(brief.what_we_know, 6)) {
      addTableSlide(pptx, "What We Know Today", ["Topic", "Detail"], group.map((w) => [w.topic, w.detail]));
    }
  }

  // Stakeholders
  if (brief.stakeholders.length) {
    addTableSlide(
      pptx,
      "Stakeholders",
      ["Name", "Role", "Notes"],
      brief.stakeholders.map((s) => [s.name, s.role, s.notes])
    );
  }

  // Risks
  if (brief.risks_open_items.length) {
    addBulletSlide(pptx, "Risks & Open Items", brief.risks_open_items);
  }

  // Discovery questions
  for (const group of chunk(brief.discovery_questions, 5)) {
    addTableSlide(
      pptx,
      "Discovery Questions for Onboarding",
      ["Question", "Why it matters", "Category"],
      group.map((q) => [q.question, q.why_it_matters, q.category])
    );
  }

  // Process gaps
  if (brief.process_gaps.length) {
    addBulletSlide(pptx, "Process Gaps to Solve", brief.process_gaps);
  }

  const out = await pptx.write({ outputType: "nodebuffer" });
  return out as Buffer;
}
