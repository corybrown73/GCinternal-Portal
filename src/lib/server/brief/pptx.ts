import PptxGenJS from "pptxgenjs";

import { BRAND, copyrightLine } from "@/lib/brand";
import type { DeckPlan, DeckSlide } from "@/lib/kickoff-deck";
import { WORDMARK_NAVY, WORDMARK_WHITE } from "@/lib/brand-assets";

/**
 * The kickoff and handoff deck, drawn in the 2026 GoCanvas template's language.
 *
 * WHAT IT COPIES FROM THE TEMPLATE, and why each one:
 *  - Navy `ink` title and divider slides with the white wordmark top-left. The
 *    template opens each act this way and it is what makes a deck read as
 *    chapters rather than as forty slides.
 *  - White content slides, navy headings, one cyan rule under each. Cyan is the
 *    only bright colour in the system; using it anywhere else makes it stop
 *    meaning anything.
 *  - The `© <year> GoCanvas` footer on every slide.
 *  - Arial, because that is what the template embeds and an AE will open this
 *    in PowerPoint and edit it.
 *
 * WHAT IT DOES NOT DO. It makes no decisions about content — which sections
 * exist and what they say is `src/lib/kickoff-deck.ts`, which is pure and
 * tested. This file is a renderer, and a renderer that starts choosing what to
 * include is a renderer nobody can test.
 */

const MASTER = "GC_CONTENT";
const MASTER_DARK = "GC_DIVIDER";

/** LAYOUT_16x9 is 10 × 5.625 inches. Every coordinate below is in inches. */
const W = 10;
const H = 5.625;
const M = 0.55;

type Pptx = InstanceType<typeof PptxGenJS>;

function defineMasters(pptx: Pptx, year: string) {
  pptx.defineSlideMaster({
    title: MASTER,
    background: { color: BRAND.white },
    objects: [
      // The wordmark lives on the master, not on each slide. pptxgenjs embeds
      // an addImage per call — twenty slides meant twenty copies of the same
      // PNG in the file, and twenty separate pictures for anyone editing it.
      { image: { data: WORDMARK_NAVY, x: M, y: H - 0.5, w: 0.98, h: 0.19 } },
      {
        text: {
          text: year,
          options: {
            x: W - 1.8,
            y: H - 0.36,
            w: 1.3,
            h: 0.24,
            fontSize: 7,
            color: BRAND.fg2,
            align: "right",
            fontFace: BRAND.fontSans,
          },
        },
      },
    ],
  });

  pptx.defineSlideMaster({
    title: MASTER_DARK,
    background: { color: BRAND.navy950 },
    objects: [
      { image: { data: WORDMARK_WHITE, x: M, y: H - 0.5, w: 0.98, h: 0.19 } },
      {
        text: {
          text: year,
          options: {
            x: W - 1.8,
            y: H - 0.36,
            w: 1.3,
            h: 0.24,
            fontSize: 7,
            color: "6E7C92",
            align: "right",
            fontFace: BRAND.fontSans,
          },
        },
      },
    ],
  });
}

/**
 * The customer's logo, top-right on the title slide.
 *
 * Bounded by height and given the full width to breathe in: a wide wordmark and
 * a square badge both have to survive, and a squashed customer logo on slide
 * one reads as carelessness about the customer.
 */
function addCustomerLogo(slide: ReturnType<Pptx["addSlide"]>, data: string) {
  slide.addImage({
    data,
    x: W - M - 1.9,
    y: M,
    w: 1.9,
    h: 0.62,
    sizing: { type: "contain", w: 1.9, h: 0.62 },
  });
}

function heading(slide: ReturnType<Pptx["addSlide"]>, title: string, subtitle?: string | null) {
  slide.addText(title, {
    x: M,
    y: 0.42,
    w: W - M * 2,
    h: 0.42,
    fontSize: 26,
    bold: true,
    color: BRAND.navy900,
    fontFace: BRAND.fontSans,
  });
  // The cyan rule. One per slide, always under the heading, never anywhere else.
  slide.addShape("rect", {
    x: M,
    y: 0.93,
    w: 0.9,
    h: 0.035,
    fill: { color: BRAND.blue500 },
    line: { color: BRAND.blue500, width: 0 },
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: M,
      y: 1.02,
      w: W - M * 2,
      h: 0.3,
      fontSize: 11.5,
      color: BRAND.fg2,
      fontFace: BRAND.fontSans,
    });
  }
}

const BODY_Y = (hasSubtitle: boolean) => (hasSubtitle ? 1.42 : 1.2);

function renderSlide(pptx: Pptx, s: DeckSlide) {
  if (s.divider) {
    const slide = pptx.addSlide({ masterName: MASTER_DARK });
    slide.addShape("rect", {
      x: M,
      y: 2.2,
      w: 1.1,
      h: 0.05,
      fill: { color: BRAND.blue500 },
      line: { color: BRAND.blue500, width: 0 },
    });
    slide.addText(s.title, {
      x: M,
      y: 2.45,
      w: W - M * 2,
      h: 0.8,
      fontSize: 34,
      bold: true,
      color: BRAND.white,
      fontFace: BRAND.fontSans,
    });
    if (s.subtitle) {
      slide.addText(s.subtitle, {
        x: M,
        y: 3.3,
        w: W - M * 2,
        h: 0.4,
        fontSize: 13,
        color: "A9B6C7",
        fontFace: BRAND.fontSans,
      });
    }
    return;
  }

  const slide = pptx.addSlide({ masterName: MASTER });
  heading(slide, s.title, s.subtitle);
  const y = BODY_Y(Boolean(s.subtitle));
  const h = H - y - 0.7;
  const body = s.body;
  if (!body) return;

  if (body.kind === "absent") {
    // Not a bullet and not styled like content: this is the deck telling the
    // room something is missing, and it should not look like an answer.
    slide.addShape("rect", {
      x: M,
      y,
      w: W - M * 2,
      h: 0.9,
      fill: { color: "F2F5F8" },
      line: { color: BRAND.border, width: 0.75 },
    });
    slide.addText(body.note, {
      x: M + 0.22,
      y: y + 0.14,
      w: W - M * 2 - 0.44,
      h: 0.62,
      fontSize: 12,
      italic: true,
      color: BRAND.navy900,
      fontFace: BRAND.fontSans,
      valign: "top",
    });
    return;
  }

  if (body.kind === "prose") {
    slide.addText(body.text, {
      x: M,
      y,
      w: W - M * 2,
      h,
      fontSize: 17,
      color: "1B2534",
      fontFace: BRAND.fontSans,
      valign: "top",
      lineSpacingMultiple: 1.25,
    });
    return;
  }

  if (body.kind === "bullets") {
    slide.addText(
      body.items.map((b) => ({ text: b, options: { bullet: { code: "2022" }, breakLine: true } })),
      {
        x: M,
        y,
        w: W - M * 2,
        h,
        fontSize: 13.5,
        color: "1B2534",
        fontFace: BRAND.fontSans,
        valign: "top",
        lineSpacingMultiple: 1.3,
      },
    );
    return;
  }

  if (body.kind === "pairs") {
    // Two columns of label/value. A table would put a grid around eight facts
    // that are not a grid; the template renders "at a glance" as a plain list.
    slide.addTable(
      body.items.map(([k, v]) => [
        {
          text: k,
          options: { color: BRAND.fg2, bold: false, fontSize: 10.5, valign: "top" as const },
        },
        { text: v, options: { color: "1B2534", fontSize: 12.5, valign: "top" as const } },
      ]),
      {
        x: M,
        y,
        w: W - M * 2,
        colW: [2.4, W - M * 2 - 2.4],
        fontFace: BRAND.fontSans,
        border: [
          { type: "none" },
          { type: "none" },
          { type: "solid", color: BRAND.border, pt: 0.5 },
          { type: "none" },
        ],
        rowH: 0.3,
        autoPage: true,
        autoPageRepeatHeader: false,
      },
    );
    return;
  }

  slide.addTable(
    [
      body.header.map((cell) => ({
        text: cell,
        options: {
          bold: true,
          color: BRAND.white,
          fill: { color: BRAND.navy900 },
          fontSize: 10.5,
        },
      })),
      ...body.rows.map((r) =>
        r.map((cell) => ({ text: cell, options: { color: "1B2534", fontSize: 10.5 } })),
      ),
    ],
    {
      x: M,
      y,
      w: W - M * 2,
      fontFace: BRAND.fontSans,
      border: { type: "solid", color: BRAND.border, pt: 0.5 },
      valign: "top",
      autoPage: true,
      autoPageRepeatHeader: true,
      autoPageSlideStartY: 1.2,
    },
  );
}

export async function buildKickoffDeckFile(
  plan: DeckPlan,
  customerLogo?: string | null,
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "GoCanvas";
  pptx.company = "GoCanvas";
  pptx.title = `Kickoff and handoff — ${plan.accountName}`;
  defineMasters(pptx, copyrightLine(plan.preparedAt));

  /* 1 — Title. The template's opener: navy field, wordmark, big white title. */
  const title = pptx.addSlide({ masterName: MASTER_DARK });
  if (customerLogo) addCustomerLogo(title, customerLogo);
  title.addText("Kickoff & Handoff", {
    x: M,
    y: 1.9,
    w: W - M * 2,
    h: 0.44,
    fontSize: 15,
    color: BRAND.blue500,
    fontFace: BRAND.fontSans,
    charSpacing: 2,
  });
  title.addText(plan.accountName, {
    x: M,
    y: 2.35,
    w: W - M * 2,
    h: 1.1,
    fontSize: 40,
    bold: true,
    color: BRAND.white,
    fontFace: BRAND.fontSans,
  });
  title.addText("Sales to implementation — what we heard, what we sold, what happens next", {
    x: M,
    y: 3.45,
    w: W - M * 2,
    h: 0.4,
    fontSize: 13,
    color: "A9B6C7",
    fontFace: BRAND.fontSans,
  });
  title.addText(new Date(plan.preparedAt).toLocaleDateString("en-US", { dateStyle: "long" }), {
    x: M,
    y: 4.05,
    w: W - M * 2,
    h: 0.3,
    fontSize: 11,
    color: "6E7C92",
    fontFace: BRAND.fontSans,
  });

  /* 2 — Agenda, listing only the acts that are actually in this deck. */
  const agenda = pptx.addSlide({ masterName: MASTER });
  heading(agenda, "Agenda");
  agenda.addText(
    plan.agenda.map((a, i) => ({
      text: `${String(i + 1).padStart(2, "0")}   ${a}`,
      options: { breakLine: true },
    })),
    {
      x: M,
      y: 1.35,
      w: W - M * 2,
      h: H - 2.1,
      fontSize: 16,
      color: "1B2534",
      fontFace: BRAND.fontSans,
      valign: "top",
      lineSpacingMultiple: 1.6,
    },
  );

  for (const slide of plan.slides) renderSlide(pptx, slide);

  /* Closing. */
  const end = pptx.addSlide({ masterName: MASTER_DARK });
  end.addText("Thank you", {
    x: M,
    y: 2.4,
    w: W - M * 2,
    h: 0.8,
    fontSize: 34,
    bold: true,
    color: BRAND.white,
    fontFace: BRAND.fontSans,
  });

  const out = await pptx.write({ outputType: "nodebuffer" });
  return out as Buffer;
}
