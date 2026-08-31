import PptxGenJS from "pptxgenjs";

import { BRAND, pt } from "@/lib/brand";
import { WORDMARK_NAVY, WORDMARK_WHITE } from "@/lib/brand-assets";
import { RACI_RESPONSIBILITIES, type KickoffDeckData } from "@/lib/kickoff-fields";

/**
 * The Client Kickoff Deck, rendered as the .pptx an AE presents.
 *
 * IT IS THE TEMPLATE. Slide order, copy, layout and colour all come from
 * `Client Kickoff Deck Template.dc.html`; the sizes are the template's own
 * pixels carried across by `pt()` (its canvas is 1920 wide, a slide is 720pt)
 * rather than re-eyeballed. Static copy — the agenda, the About slide, the IT
 * questions, the support tiers — is reproduced verbatim, because it is written
 * copy and paraphrasing it would be an unrequested edit to somebody's deck.
 *
 * THE ONE DELIBERATE DEVIATION. The HTML template leaves its example copy in
 * place for a field nobody filled. Here an unfilled field draws a visible
 * placeholder instead. A designer previewing a layout wants to see "Acme
 * Construction"; an AE presenting to a customer who is not Acme must not.
 *
 * WHAT IT DOES NOT DO. It makes no decisions about content — which fields are
 * filled and from what is `src/lib/kickoff-fields.ts`, which is pure and
 * tested.
 */

/**
 * The template's own speaker notes, verbatim.
 *
 * They are the deck's operating instructions — "every row needs a human name,
 * not a department", "get verbal agreement on the go-live date here" — and
 * they were written by whoever built the template. Dropping them would ship a
 * deck that looks right and presents worse.
 */
const SPEAKER_NOTES: Record<string, string> = {
  welcome:
    "Warm welcome by name. Set the frame: 30 minutes, this is their kickoff, we finish with a written plan.",
  agenda: "Thirty seconds. Flag that the last two items need decisions from them today.",
  introductions:
    "Round the room. Ask each client attendee for one sentence on what they need out of this rollout \u2014 capture it, you'll use it on the goals slide.",
  about:
    "Optional \u2014 skip for clients who already know us well. Ninety seconds max. Land the 12,000 and 97%, then pivot back to them.",
  dividerBusiness: "Transition. Hand the pen to the client for the next three slides.",
  goals:
    "Read these back from the sales notes and confirm. Edit live if they correct you \u2014 that correction is the most valuable minute of the call.",
  success:
    "Targets are pre-filled from the business case. Ask them to change any number they don't own \u2014 an agreed target beats an accurate one.",
  scope:
    "Confirm the phase-one list and, more importantly, what is not in phase one. Scope creep starts here.",
  dividerPlan: "Shift gears. Everything after this has a name and a date attached to it.",
  timeline:
    "Fill real dates before the call. Get verbal agreement on the go-live date here \u2014 it anchors everything else.",
  roles:
    "Every row needs a human name, not a department. A blank cell at the end of this slide becomes an action item.",
  training:
    "The pilot-first approach is the part clients push back on. Explain why one crew for two weeks beats a big-bang launch.",
  integrations:
    "Optional \u2014 drop when IT isn't on the call. Otherwise this is the slide that decides whether week three slips.",
  support:
    "Optional. Keep it to 30 seconds \u2014 the point is that they know the difference between a support ticket and a call to Jordan.",
  risks:
    "Optional but recommended. Ask the room to add one. Anything unresolved here goes straight onto the action plan.",
  actions:
    "The one slide that has to be finished before the call ends. Read each row aloud, get a yes from the named owner.",
  close:
    "Repeat the go-live date and the first action item out loud. Thank them by name and end early if you can.",
};

/**
 * What the presenter has to do before the meeting, on slide one's notes.
 *
 * This is where an AE actually looks — a list in the app is a list they have
 * to remember to open. Two lists, because they need different attention: what
 * is blank, and what was taken out of a call transcript rather than off a
 * record and should be checked before it is read aloud to the customer.
 */
function prepNotes(data: KickoffDeckData): string {
  const lines = [SPEAKER_NOTES["welcome"]!];
  if (data.missing.length) {
    lines.push(
      "",
      `BEFORE THE CALL \u2014 ${data.missing.length} field(s) are blank and show in red on the slides:`,
      data.missing.join(", "),
    );
  }
  if (data.fromCalls.length) {
    lines.push(
      "",
      `CHECK THESE \u2014 ${data.fromCalls.length} value(s) were read out of the call notes, not taken from a record:`,
      data.fromCalls.join(", "),
    );
  }
  return lines.join("\n");
}

const LIGHT = "GC_LIGHT";
const DARK = "GC_DARK";

/** LAYOUT_16x9 is 10 × 5.625 inches. */
const W = 10;
const H = 5.625;
/** The template's 120px page gutter. */
const PAD = pt(120) / 72;
/** Its 110px top padding. */
const TOP = pt(110) / 72;

const inch = (px: number) => pt(px) / 72;

type Pptx = InstanceType<typeof PptxGenJS>;
type Slide = ReturnType<Pptx["addSlide"]>;

const FOOT = "Proprietary & Confidential · Copyright 2026, Canvas Solutions, Inc.";

function defineMasters(pptx: Pptx) {
  pptx.defineSlideMaster({
    title: LIGHT,
    background: { color: BRAND.white },
    objects: [
      // The 24px navy strip down the left edge of every content slide.
      {
        rect: {
          x: 0,
          y: 0,
          w: inch(24),
          h: H,
          fill: { color: BRAND.navy700 },
          line: { color: BRAND.navy700, width: 0 },
        },
      },
      {
        text: {
          text: FOOT,
          options: {
            x: PAD,
            y: H - 0.32,
            w: W - PAD * 2,
            h: 0.22,
            fontSize: 6.5,
            color: BRAND.ink300,
            fontFace: BRAND.fontSans,
          },
        },
      },
    ],
  });

  pptx.defineSlideMaster({
    title: DARK,
    // pptxgenjs cannot paint the template's radial gradient, so the flat
    // deep navy is used and the bright end appears as the accent type on it.
    background: { color: BRAND.navy900 },
    objects: [{ image: { data: WORDMARK_WHITE, x: PAD, y: H - 0.55, w: 1.15, h: 0.22 } }],
  });
}

/* --------------------------------------------------------------- helpers */

/** The uppercase accent line above every content-slide title. */
function eyebrow(slide: Slide, text: string, color = BRAND.blue500) {
  slide.addText(text.toUpperCase(), {
    x: PAD,
    y: TOP,
    w: W - PAD * 2,
    h: 0.24,
    fontSize: pt(24),
    bold: true,
    charSpacing: 1.6,
    color,
    fontFace: BRAND.fontSans,
  });
}

/** The 72px slide title. */
function title(slide: Slide, text: string) {
  slide.addText(text, {
    x: PAD,
    y: TOP + 0.24,
    w: W - PAD * 2,
    h: 0.5,
    fontSize: pt(72),
    bold: true,
    color: BRAND.fg1,
    fontFace: BRAND.fontSans,
  });
}

const BODY_TOP = TOP + 0.95;

export type FieldReader = (key: string) => { text: string; missing: boolean };

/**
 * Reads a field, or reports it unfilled.
 *
 * The placeholder is deliberately conspicuous. A pale, tasteful gap gets
 * presented; something that looks unfinished gets filled in.
 */
function reader(data: KickoffDeckData): FieldReader {
  return (key: string) => {
    const v = data.fields[key];
    // Short, because it also has to sit in a narrow table cell without
    // wrapping to three lines. Slide one's speaker notes carry the full list.
    return v ? { text: v, missing: false } : { text: "[ to complete ]", missing: true };
  };
}

function fieldText(
  slide: Slide,
  get: FieldReader,
  key: string,
  opts: Parameters<Slide["addText"]>[1] & { color?: string },
) {
  const { text, missing } = get(key);
  slide.addText(text, {
    ...opts,
    ...(missing ? { color: BRAND.danger, italic: true } : {}),
    fontFace: BRAND.fontSans,
  });
}

function card(slide: Slide, x: number, y: number, w: number, h: number, dark = false) {
  slide.addShape("roundRect", {
    x,
    y,
    w,
    h,
    rectRadius: 0.06,
    fill: { color: dark ? BRAND.navy900 : BRAND.white },
    line: { color: dark ? BRAND.navy900 : BRAND.ink100, width: dark ? 0 : 0.75 },
  });
}

/* ----------------------------------------------------------- the 17 slides */

function slide01Welcome(pptx: Pptx, get: FieldReader): Slide {
  const s = pptx.addSlide({ masterName: DARK });
  fieldText(s, get, "deck_eyebrow", {
    x: PAD,
    y: 1.55,
    w: W - PAD * 2,
    h: 0.26,
    fontSize: pt(24),
    bold: true,
    charSpacing: 1.6,
    color: BRAND.blue300,
  });
  // The template sets both lines at 128px, which fits "Acme Construction" on
  // its 1920px canvas and nothing longer. A real customer name is whatever it
  // is, so the second line is sized to fit rather than allowed to collide with
  // the first — the failure mode this replaces was the two overlapping.
  const client = get("client_name");
  const nameSize = client.text.length <= 18 ? 128 : client.text.length <= 30 ? 92 : 64;
  s.addText("Welcome,", {
    x: PAD,
    y: 1.9,
    w: W - PAD * 2,
    h: 0.55,
    fontSize: pt(nameSize),
    bold: true,
    color: BRAND.white,
    fontFace: BRAND.fontSans,
  });
  s.addText(client.text, {
    x: PAD,
    y: 1.9 + pt(nameSize) / 72 + 0.06,
    w: W - PAD * 2,
    h: 0.6,
    fontSize: pt(nameSize),
    bold: true,
    italic: client.missing,
    color: client.missing ? BRAND.danger : BRAND.blue300,
    fontFace: BRAND.fontSans,
  });
  s.addText("Field work, digitized. Here's how we get your teams live.", {
    x: PAD,
    y: 3.38,
    w: 5.8,
    h: 0.32,
    fontSize: pt(34),
    color: BRAND.fgOnDark2,
    fontFace: BRAND.fontSans,
  });
  const lead = get("gc_lead_name");
  s.addText(`Prepared by ${lead.text} · Your GoCanvas implementation team`, {
    x: PAD,
    y: 3.78,
    w: W - PAD * 2,
    h: 0.26,
    fontSize: pt(26),
    color: lead.missing ? BRAND.danger : BRAND.fgOnDark3,
    italic: lead.missing,
    fontFace: BRAND.fontSans,
  });
  return s;
}

const AGENDA = [
  "Introductions",
  "Your goals and success measures",
  "Workflows in scope",
  "Timeline and responsibilities",
  "Training, integrations and support",
  "Mutual action plan",
];

function slide02Agenda(pptx: Pptx): Slide {
  const s = pptx.addSlide({ masterName: LIGHT });
  const cardW = inch(660);
  card(s, PAD, TOP, cardW, H - TOP * 2 + 0.1);
  s.addText("TODAY", {
    x: PAD + 0.3,
    y: TOP + 0.35,
    w: cardW - 0.6,
    h: 0.22,
    fontSize: pt(24),
    bold: true,
    charSpacing: 1.6,
    color: BRAND.blue500,
    fontFace: BRAND.fontSans,
  });
  s.addText("Your\nKickoff.", {
    x: PAD + 0.3,
    y: TOP + 0.62,
    w: cardW - 0.6,
    h: 0.95,
    fontSize: pt(96),
    bold: true,
    color: BRAND.fg1,
    fontFace: BRAND.fontSans,
    lineSpacingMultiple: 0.95,
  });
  s.addText("30 minutes. We leave with a plan you've signed off on.", {
    x: PAD + 0.3,
    y: TOP + 1.68,
    w: cardW - 0.6,
    h: 0.4,
    fontSize: pt(28),
    color: BRAND.fg2,
    fontFace: BRAND.fontSans,
  });
  s.addImage({ data: WORDMARK_NAVY, x: PAD + 0.3, y: H - TOP - 0.15, w: 1.05, h: 0.2 });

  const listX = PAD + cardW + inch(80);
  AGENDA.forEach((item, i) => {
    const y = 1.35 + i * 0.44;
    s.addText(String(i + 1).padStart(2, "0"), {
      x: listX,
      y,
      w: 0.4,
      h: 0.3,
      fontSize: pt(24),
      bold: true,
      color: BRAND.blue500,
      fontFace: BRAND.fontSans,
    });
    s.addText(item, {
      x: listX + 0.42,
      y: y - 0.03,
      w: W - listX - PAD - 0.42,
      h: 0.34,
      fontSize: pt(36),
      bold: true,
      color: BRAND.fg1,
      fontFace: BRAND.fontSans,
    });
  });
  return s;
}

function slide03Introductions(pptx: Pptx, get: FieldReader): Slide {
  const s = pptx.addSlide({ masterName: LIGHT });
  eyebrow(s, "Introductions");
  title(s, "Your Team and Ours");

  const colW = (W - PAD * 2 - inch(56)) / 2;
  const rightX = PAD + colW + inch(56);

  const heading = (x: number, key: string | null, text: string | null, color: string) => {
    if (key) {
      fieldText(s, get, key, {
        x,
        y: BODY_TOP,
        w: colW,
        h: 0.24,
        fontSize: pt(26),
        bold: true,
        charSpacing: 0.8,
        color,
      });
    } else {
      s.addText(text!, {
        x,
        y: BODY_TOP,
        w: colW,
        h: 0.24,
        fontSize: pt(26),
        bold: true,
        charSpacing: 0.8,
        color,
        fontFace: BRAND.fontSans,
      });
    }
  };
  heading(PAD, "client_name_short", null, BRAND.fg2);
  heading(rightX, null, "GOCANVAS", BRAND.blue500);

  const person = (x: number, i: number, nameKey: string, roleKey: string, dark: boolean) => {
    const y = BODY_TOP + 0.4 + i * 0.72;
    card(s, x, y, colW, 0.6, dark);
    fieldText(s, get, nameKey, {
      x: x + 0.16,
      y: y + 0.09,
      w: colW - 0.32,
      h: 0.24,
      fontSize: pt(32),
      bold: true,
      color: dark ? BRAND.white : BRAND.fg1,
    });
    fieldText(s, get, roleKey, {
      x: x + 0.16,
      y: y + 0.33,
      w: colW - 0.32,
      h: 0.2,
      fontSize: pt(24),
      color: dark ? BRAND.fgOnDark3 : BRAND.fg2,
    });
  };

  for (let i = 0; i < 3; i += 1) {
    person(PAD, i, `client_person_${i + 1}_name`, `client_person_${i + 1}_role`, false);
  }
  person(rightX, 0, "gc_lead_name", "gc_lead_role", true);
  person(rightX, 1, "gc_person_2_name", "gc_person_2_role", true);
  person(rightX, 2, "gc_person_3_name", "gc_person_3_role", true);
  return s;
}

const ABOUT_FEATURES: Array<[string, string]> = [
  ["Digital forms", "Built to your workflow, changed in minutes."],
  ["Dispatch", "Assign and track work in real time."],
  ["Offline capture", "No signal needed; syncs when you're back."],
  ["Reporting", "Approvals, alerts and dashboards."],
];

function slide04About(pptx: Pptx): Slide {
  const s = pptx.addSlide({ masterName: LIGHT });
  eyebrow(s, "About GoCanvas");
  title(s, "Your all-in-one digital solution for field work.");
  s.addText(
    "Part of the Nemetschek Group. We replace paper with connected digital workflows — inspections, work orders, dispatch and reporting, linked between the field and the office.",
    {
      x: PAD,
      y: BODY_TOP + 0.15,
      w: W - PAD * 2,
      h: 0.4,
      fontSize: pt(26),
      color: BRAND.fg2,
      fontFace: BRAND.fontSans,
    },
  );
  const colW = (W - PAD * 2 - inch(24) * 3) / 4;
  ABOUT_FEATURES.forEach(([name, blurb], i) => {
    const x = PAD + i * (colW + inch(24));
    card(s, x, BODY_TOP + 0.75, colW, 0.85);
    s.addText(name, {
      x: x + 0.14,
      y: BODY_TOP + 0.87,
      w: colW - 0.28,
      h: 0.22,
      fontSize: pt(28),
      bold: true,
      color: BRAND.fg1,
      fontFace: BRAND.fontSans,
    });
    s.addText(blurb, {
      x: x + 0.14,
      y: BODY_TOP + 1.11,
      w: colW - 0.28,
      h: 0.44,
      fontSize: pt(22),
      color: BRAND.fg2,
      fontFace: BRAND.fontSans,
    });
  });
  s.addText(
    [
      { text: "12,000", options: { bold: true, color: BRAND.blue500, fontSize: pt(60) } },
      {
        text: "  companies digitizing field work with us.        ",
        options: { fontSize: pt(22), color: BRAND.fg2 },
      },
      { text: "97%", options: { bold: true, color: BRAND.blue500, fontSize: pt(60) } },
      { text: "  customer satisfaction.", options: { fontSize: pt(22), color: BRAND.fg2 } },
    ],
    {
      x: PAD,
      y: H - TOP - 0.55,
      w: W - PAD * 2,
      h: 0.5,
      fontFace: BRAND.fontSans,
      valign: "middle",
    },
  );
  return s;
}

function divider(pptx: Pptx, section: string, heading: string): Slide {
  const s = pptx.addSlide({ masterName: DARK });
  s.addText(section.toUpperCase(), {
    x: 0,
    y: 2.15,
    w: W,
    h: 0.24,
    align: "center",
    fontSize: pt(24),
    bold: true,
    charSpacing: 1.6,
    color: BRAND.blue300,
    fontFace: BRAND.fontSans,
  });
  s.addText(heading, {
    x: 0,
    y: 2.45,
    w: W,
    h: 0.75,
    align: "center",
    fontSize: pt(150),
    bold: true,
    color: BRAND.white,
    fontFace: BRAND.fontSans,
  });
  return s;
}

function slide06Goals(pptx: Pptx, get: FieldReader): Slide {
  const s = pptx.addSlide({ masterName: LIGHT });
  eyebrow(s, "Why we're here");
  title(s, "Your Goals for This Rollout");
  s.addText("What you told us matters most — confirm or correct.", {
    x: PAD,
    y: BODY_TOP - 0.08,
    w: W - PAD * 2,
    h: 0.24,
    fontSize: pt(26),
    color: BRAND.fg2,
    italic: true,
    fontFace: BRAND.fontSans,
  });
  for (let i = 0; i < 4; i += 1) {
    const y = BODY_TOP + 0.35 + i * 0.72;
    s.addText(String(i + 1).padStart(2, "0"), {
      x: PAD,
      y,
      w: 0.5,
      h: 0.3,
      fontSize: pt(32),
      bold: true,
      color: BRAND.blue500,
      fontFace: BRAND.fontSans,
    });
    fieldText(s, get, `goal_${i + 1}`, {
      x: PAD + 0.55,
      y,
      w: W - PAD * 2 - 0.55,
      h: 0.28,
      fontSize: pt(34),
      bold: true,
      color: BRAND.fg1,
    });
    const detail = get(`goal_${i + 1}_detail`);
    if (!detail.missing) {
      s.addText(detail.text, {
        x: PAD + 0.55,
        y: y + 0.28,
        w: W - PAD * 2 - 0.55,
        h: 0.24,
        fontSize: pt(24),
        color: BRAND.fg2,
        fontFace: BRAND.fontSans,
      });
    }
  }
  return s;
}

function slide07Success(pptx: Pptx, get: FieldReader): Slide {
  const s = pptx.addSlide({ masterName: LIGHT });
  eyebrow(s, "Success criteria");
  title(s, "How We'll Measure Success");
  const colW = (W - PAD * 2 - inch(28) * 3) / 4;
  for (let i = 0; i < 4; i += 1) {
    const x = PAD + i * (colW + inch(28));
    card(s, x, BODY_TOP + 0.1, colW, 1.4);
    // The metric is the criterion, not a fixed word. See kickoff-fields.
    const metric = get(`kpi_${i + 1}_metric`);
    s.addText(metric.text.toUpperCase(), {
      x: x + 0.14,
      y: BODY_TOP + 0.22,
      w: colW - 0.28,
      h: 0.3,
      fontSize: pt(22),
      bold: true,
      charSpacing: 1,
      italic: metric.missing,
      color: metric.missing ? BRAND.danger : BRAND.blue500,
      fontFace: BRAND.fontSans,
    });
    fieldText(s, get, `kpi_${i + 1}_value`, {
      x: x + 0.14,
      y: BODY_TOP + 0.58,
      w: colW - 0.28,
      h: 0.52,
      fontSize: pt(80),
      bold: true,
      color: BRAND.blue500,
    });
    // The qualifier is left to the presenter, so it is drawn only when it is
    // there — an empty line beats a red one on a slide the customer reads.
    const qualifier = get(`kpi_${i + 1}_label`);
    if (!qualifier.missing) {
      s.addText(qualifier.text, {
        x: x + 0.14,
        y: BODY_TOP + 1.12,
        w: colW - 0.28,
        h: 0.26,
        fontSize: pt(20),
        color: BRAND.fg2,
        fontFace: BRAND.fontSans,
      });
    }
  }

  s.addText("WHAT GOOD LOOKS LIKE AT DAY 90", {
    x: PAD,
    y: BODY_TOP + 1.68,
    w: W - PAD * 2,
    h: 0.2,
    fontSize: pt(24),
    bold: true,
    charSpacing: 1.2,
    color: BRAND.blue500,
    fontFace: BRAND.fontSans,
  });
  fieldText(s, get, "day_90_definition", {
    x: PAD,
    y: BODY_TOP + 1.92,
    w: W - PAD * 2,
    h: 0.4,
    fontSize: pt(26),
    color: BRAND.fg1,
  });
  return s;
}

/**
 * A header-and-rows grid in the template's style: tinted header, hairline
 * rules between rows.
 *
 * Row height FOLLOWS the content. A fixed pitch is what put "Send three real
 * export files from Sage" through the rule under it and split "01" across two
 * lines — real rows are not all one line, and a table that assumes they are
 * fails on the first long action item.
 */
function grid(
  s: Slide,
  y: number,
  cols: number[],
  header: string[],
  rows: Array<Array<{ text: string; missing?: boolean; bold?: boolean; muted?: boolean }>>,
) {
  const total = cols.reduce((a, b) => a + b, 0);
  const scale = (W - PAD * 2) / total;
  const widths = cols.map((c) => c * scale);
  const size = pt(26);
  const lineH = 0.17;
  const headH = 0.32;

  let x = PAD;
  header.forEach((h, i) => {
    s.addShape("rect", {
      x,
      y,
      w: widths[i]!,
      h: headH,
      fill: { color: BRAND.ink050 },
      line: { color: BRAND.ink050, width: 0 },
    });
    s.addText(h, {
      x: x + 0.08,
      y,
      w: widths[i]! - 0.16,
      h: headH,
      fontSize: size,
      bold: true,
      color: BRAND.fg1,
      valign: "middle",
      fontFace: BRAND.fontSans,
    });
    x += widths[i]!;
  });

  let ry = y + headH;
  for (const row of rows) {
    // Rough but reliable: Arial at this size averages a little under half the
    // point size per character, so a column's capacity is its width in points
    // over that. Erring long costs a little whitespace; erring short costs an
    // overlap, which is the bug this replaces.
    const lines = Math.max(
      1,
      ...row.map((c, i) =>
        Math.ceil(c.text.length / Math.max(6, (widths[i]! * 72 - 12) / (size * 0.5))),
      ),
    );
    const rowH = Math.max(0.32, lines * lineH + 0.14);
    let rx = PAD;
    row.forEach((c, i) => {
      s.addText(c.text, {
        x: rx + 0.08,
        y: ry,
        w: widths[i]! - 0.16,
        h: rowH,
        fontSize: size,
        bold: c.bold ?? false,
        italic: c.missing ?? false,
        color: c.missing ? BRAND.danger : c.muted ? BRAND.fg2 : BRAND.fg1,
        valign: "middle",
        fontFace: BRAND.fontSans,
      });
      rx += widths[i]!;
    });
    ry += rowH;
    s.addShape("line", {
      x: PAD,
      y: ry,
      w: W - PAD * 2,
      h: 0,
      line: { color: BRAND.ink100, width: 0.5 },
    });
  }
  return ry;
}

function cell(get: FieldReader, key: string, opts: { bold?: boolean; muted?: boolean } = {}) {
  const { text, missing } = get(key);
  return { text, missing, ...opts };
}

function slide08Scope(pptx: Pptx, get: FieldReader): Slide {
  const s = pptx.addSlide({ masterName: LIGHT });
  eyebrow(s, "Scope");
  title(s, "Workflows in Scope");
  const phase = (i: number) => ({ text: i < 3 ? "Phase 1" : "Phase 2", muted: true });
  grid(
    s,
    BODY_TOP + 0.1,
    [1.2, 3, 2.4, 2, 1.6],
    ["Phase", "Workflow", "Replaces", "Teams", "Build owner"],
    [0, 1, 2, 3, 4].map((i) => [
      phase(i),
      cell(get, `scope_${i + 1}_workflow`, { bold: true }),
      cell(get, `scope_${i + 1}_replaces`, { muted: true }),
      cell(get, `scope_${i + 1}_teams`, { muted: true }),
      i < 3
        ? { text: "GoCanvas", muted: true }
        : cell(get, `scope_${i + 1}_owner`, { muted: true }),
    ]),
  );
  const out = get("out_of_scope");
  s.addText(
    [
      { text: "Out of phase one:  ", options: { bold: true, color: BRAND.fg1 } },
      {
        text: out.text,
        options: { color: out.missing ? BRAND.danger : BRAND.fg2, italic: out.missing },
      },
    ],
    {
      x: PAD,
      y: H - TOP - 0.35,
      w: W - PAD * 2,
      h: 0.3,
      fontSize: pt(26),
      fontFace: BRAND.fontSans,
    },
  );
  return s;
}

function slide10Timeline(pptx: Pptx, get: FieldReader): Slide {
  const s = pptx.addSlide({ masterName: LIGHT });
  eyebrow(s, "Next 90 days");
  title(s, "Implementation Timeline");

  const colW = (W - PAD * 2) / 5;
  const railY = BODY_TOP + 0.52;
  s.addShape("line", {
    x: PAD + colW / 2,
    y: railY,
    w: W - PAD * 2 - colW,
    h: 0,
    line: { color: BRAND.blue500, width: 1.5 },
  });

  for (let i = 0; i < 5; i += 1) {
    const cx = PAD + colW * i + colW / 2;
    const d = inch(150);
    s.addShape("ellipse", {
      x: cx - d / 2,
      y: railY - d / 2,
      w: d,
      h: d,
      fill: { color: BRAND.white },
      line: { color: BRAND.blue500, width: 1.5 },
    });
    const date = get(`phase_${i + 1}_date`);
    // Sized so "Week 10" and "Jan 12" both sit on one line inside the circle;
    // at the template's own 26px they wrapped to "We / ek 1".
    s.addText(date.text, {
      x: cx - d / 2,
      y: railY - d / 2,
      w: d,
      h: d,
      align: "center",
      valign: "middle",
      margin: 0,
      fontSize: pt(date.missing ? 15 : 22),
      bold: true,
      color: date.missing ? BRAND.danger : BRAND.fg1,
      fontFace: BRAND.fontSans,
    });
    fieldText(s, get, `phase_${i + 1}_name`, {
      x: cx - colW / 2,
      y: railY + 0.45,
      w: colW,
      h: 0.24,
      align: "center",
      fontSize: pt(28),
      bold: true,
      color: BRAND.fg1,
    });
    fieldText(s, get, `phase_${i + 1}_detail`, {
      x: cx - colW / 2 + 0.08,
      y: railY + 0.69,
      w: colW - 0.16,
      h: 0.6,
      align: "center",
      fontSize: pt(24),
      color: BRAND.fg2,
    });
  }

  const noteW = (W - PAD * 2 - 0.3) / 2;
  const noteY = H - TOP - 0.5;
  const note = (x: number, label: string, key: string) => {
    s.addText(label.toUpperCase(), {
      x,
      y: noteY,
      w: noteW,
      h: 0.18,
      fontSize: pt(22),
      bold: true,
      charSpacing: 1.2,
      color: BRAND.blue500,
      fontFace: BRAND.fontSans,
    });
    fieldText(s, get, key, {
      x,
      y: noteY + 0.2,
      w: noteW,
      h: 0.3,
      fontSize: pt(24),
      color: BRAND.fg1,
    });
  };
  note(PAD, "We need from you", "need_from_client");
  note(PAD + noteW + 0.3, "Biggest risk to the date", "timeline_risk");
  return s;
}

function slide11Roles(pptx: Pptx, get: FieldReader): Slide {
  const s = pptx.addSlide({ masterName: LIGHT });
  eyebrow(s, "Ownership");
  title(s, "Roles and Responsibilities");
  grid(
    s,
    BODY_TOP + 0.1,
    [3.4, 2.4, 2.2],
    ["Responsibility", "Owner", "Supported by"],
    RACI_RESPONSIBILITIES.map((r, i) => [
      { text: r, bold: true },
      cell(get, `raci_${i + 1}_owner`),
      cell(get, `raci_${i + 1}_support`, { muted: true }),
    ]),
  );
  return s;
}

const TRAINING_BLURBS = [
  "Your team learns to build and change forms without waiting on us.",
  "Short, on their phones, on a real job. No classroom time.",
  "Reading the dashboard, spotting gaps, exporting for audits.",
];

function slide12Training(pptx: Pptx, get: FieldReader): Slide {
  const s = pptx.addSlide({ masterName: LIGHT });
  eyebrow(s, "Adoption");
  title(s, "Training and Rollout");
  s.addText("Pilot first, then scale crew by crew.", {
    x: PAD,
    y: BODY_TOP - 0.08,
    w: W - PAD * 2,
    h: 0.24,
    fontSize: pt(28),
    italic: true,
    color: BRAND.blue500,
    fontFace: BRAND.fontSans,
  });
  const colW = (W - PAD * 2 - inch(28) * 2) / 3;
  for (let i = 0; i < 3; i += 1) {
    const x = PAD + i * (colW + inch(28));
    card(s, x, BODY_TOP + 0.35, colW, 1.35);
    fieldText(s, get, `training_${i + 1}_title`, {
      x: x + 0.16,
      y: BODY_TOP + 0.5,
      w: colW - 0.32,
      h: 0.26,
      fontSize: pt(32),
      bold: true,
      color: BRAND.fg1,
    });
    fieldText(s, get, `training_${i + 1}_who`, {
      x: x + 0.16,
      y: BODY_TOP + 0.78,
      w: colW - 0.32,
      h: 0.3,
      fontSize: pt(24),
      color: BRAND.blue500,
    });
    s.addText(TRAINING_BLURBS[i]!, {
      x: x + 0.16,
      y: BODY_TOP + 1.1,
      w: colW - 0.32,
      h: 0.5,
      fontSize: pt(24),
      color: BRAND.fg2,
      fontFace: BRAND.fontSans,
    });
  }
  const seats = get("licensed_seats");
  const renewal = get("renewal_date");
  s.addText(
    [
      { text: "Licensed seats: ", options: { bold: true, color: BRAND.fg1 } },
      {
        text: seats.text,
        options: { color: seats.missing ? BRAND.danger : BRAND.fg2, italic: seats.missing },
      },
      { text: "   ·   Renewal ", options: { bold: true, color: BRAND.fg1 } },
      {
        text: renewal.text,
        options: { color: renewal.missing ? BRAND.danger : BRAND.fg2, italic: renewal.missing },
      },
    ],
    {
      x: PAD,
      y: H - TOP - 0.3,
      w: W - PAD * 2,
      h: 0.3,
      fontSize: pt(24),
      fontFace: BRAND.fontSans,
    },
  );
  return s;
}

const IT_REQUIREMENTS = [
  "Single sign-on provider and rollout window",
  "Device model and OS version in the field",
  "App distribution method (MDM or store)",
  "Data retention and export requirements",
];

function slide13Integrations(pptx: Pptx, get: FieldReader): Slide {
  const s = pptx.addSlide({ masterName: LIGHT });
  eyebrow(s, "Technical setup");
  title(s, "Integrations and IT Requirements");

  const colW = (W - PAD * 2 - 0.4) / 2;
  s.addText("SYSTEMS WE'RE CONNECTING", {
    x: PAD,
    y: BODY_TOP + 0.1,
    w: colW,
    h: 0.2,
    fontSize: pt(24),
    bold: true,
    charSpacing: 1.2,
    color: BRAND.blue500,
    fontFace: BRAND.fontSans,
  });
  for (let i = 0; i < 3; i += 1) {
    fieldText(s, get, `integration_${i + 1}`, {
      x: PAD,
      y: BODY_TOP + 0.4 + i * 0.34,
      w: colW,
      h: 0.28,
      fontSize: pt(26),
      color: BRAND.fg1,
    });
  }

  const rx = PAD + colW + 0.4;
  s.addText("WHAT IT NEEDS TO CONFIRM", {
    x: rx,
    y: BODY_TOP + 0.1,
    w: colW,
    h: 0.2,
    fontSize: pt(24),
    bold: true,
    charSpacing: 1.2,
    color: BRAND.blue500,
    fontFace: BRAND.fontSans,
  });
  IT_REQUIREMENTS.forEach((r, i) => {
    s.addText(`•  ${r}`, {
      x: rx,
      y: BODY_TOP + 0.4 + i * 0.3,
      w: colW,
      h: 0.26,
      fontSize: pt(24),
      color: BRAND.fg1,
      fontFace: BRAND.fontSans,
    });
  });

  const contact = get("it_contact");
  s.addText(
    [
      { text: "Named IT contact: ", options: { bold: true, color: BRAND.fg1 } },
      {
        text: contact.text,
        options: { color: contact.missing ? BRAND.danger : BRAND.fg2, italic: contact.missing },
      },
    ],
    {
      x: PAD,
      y: H - TOP - 0.3,
      w: W - PAD * 2,
      h: 0.3,
      fontSize: pt(24),
      fontFace: BRAND.fontSans,
    },
  );
  return s;
}

const SUPPORT_TIERS: Array<[string, string]> = [
  ["Day to day", "Support team"],
  ["Through go-live", "Your implementation lead"],
  ["Something urgent", "Escalation path"],
];

function slide14Support(pptx: Pptx, get: FieldReader): Slide {
  const s = pptx.addSlide({ masterName: LIGHT });
  eyebrow(s, "Support");
  title(s, "How to Reach Us");
  const colW = (W - PAD * 2 - inch(28) * 2) / 3;
  SUPPORT_TIERS.forEach(([when, who], i) => {
    const x = PAD + i * (colW + inch(28));
    card(s, x, BODY_TOP + 0.15, colW, 1.2);
    s.addText(when.toUpperCase(), {
      x: x + 0.16,
      y: BODY_TOP + 0.3,
      w: colW - 0.32,
      h: 0.2,
      fontSize: pt(22),
      bold: true,
      charSpacing: 1.2,
      color: BRAND.blue500,
      fontFace: BRAND.fontSans,
    });
    s.addText(who, {
      x: x + 0.16,
      y: BODY_TOP + 0.54,
      w: colW - 0.32,
      h: 0.24,
      fontSize: pt(30),
      bold: true,
      color: BRAND.fg1,
      fontFace: BRAND.fontSans,
    });
    fieldText(s, get, `support_tier_${i + 1}`, {
      x: x + 0.16,
      y: BODY_TOP + 0.82,
      w: colW - 0.32,
      h: 0.5,
      fontSize: pt(24),
      color: BRAND.fg2,
    });
  });
  s.addText("We're here to support your business — not just your account.", {
    x: PAD,
    y: H - TOP - 0.3,
    w: W - PAD * 2,
    h: 0.3,
    fontSize: pt(26),
    italic: true,
    color: BRAND.fg2,
    fontFace: BRAND.fontSans,
  });
  return s;
}

function slide15Risks(pptx: Pptx, get: FieldReader): Slide {
  const s = pptx.addSlide({ masterName: LIGHT });
  eyebrow(s, "Before we start");
  title(s, "Risks and Open Questions");
  for (let i = 0; i < 3; i += 1) {
    const y = BODY_TOP + 0.15 + i * 0.75;
    card(s, PAD, y, W - PAD * 2, 0.62);
    fieldText(s, get, `risk_${i + 1}`, {
      x: PAD + 0.18,
      y: y + 0.09,
      w: W - PAD * 2 - 0.36,
      h: 0.26,
      fontSize: pt(30),
      bold: true,
      color: BRAND.fg1,
    });
    fieldText(s, get, `risk_${i + 1}_mitigation`, {
      x: PAD + 0.18,
      y: y + 0.35,
      w: W - PAD * 2 - 0.36,
      h: 0.22,
      fontSize: pt(24),
      color: BRAND.fg2,
    });
  }
  s.addText("Yours to add — what are we not seeing?", {
    x: PAD,
    y: H - TOP - 0.28,
    w: W - PAD * 2,
    h: 0.28,
    fontSize: pt(26),
    italic: true,
    color: BRAND.blue500,
    fontFace: BRAND.fontSans,
  });
  return s;
}

function slide16ActionPlan(pptx: Pptx, get: FieldReader): Slide {
  const s = pptx.addSlide({ masterName: LIGHT });
  eyebrow(s, "Next 30 days");
  title(s, "Mutual Action Plan");
  grid(
    s,
    BODY_TOP + 0.1,
    [0.8, 3.2, 2.6, 2.1, 1.3],
    ["#", "Action", "Why it matters", "Owner", "Due"],
    [0, 1, 2, 3].map((i) => [
      { text: String(i + 1).padStart(2, "0"), bold: true },
      cell(get, `action_${i + 1}`, { bold: true }),
      cell(get, `action_${i + 1}_why`, { muted: true }),
      cell(get, `action_${i + 1}_owner`),
      cell(get, `action_${i + 1}_due`),
    ]),
  );
  s.addText("Recap and calendar holds in your inbox within 24 hours.", {
    x: PAD,
    y: H - TOP - 0.3,
    w: W - PAD * 2,
    h: 0.3,
    fontSize: pt(26),
    italic: true,
    color: BRAND.fg2,
    fontFace: BRAND.fontSans,
  });
  return s;
}

function slide17Close(pptx: Pptx, get: FieldReader): Slide {
  const s = pptx.addSlide({ masterName: DARK });
  s.addText("Thank you", {
    x: PAD,
    y: 1.7,
    w: W - PAD * 2,
    h: 0.7,
    fontSize: pt(128),
    bold: true,
    color: BRAND.white,
    fontFace: BRAND.fontSans,
  });
  s.addText("Next time we meet, your crews will be filing from the app.", {
    x: PAD,
    y: 2.5,
    w: W - PAD * 2,
    h: 0.32,
    fontSize: pt(34),
    color: BRAND.fgOnDark2,
    fontFace: BRAND.fontSans,
  });
  const items: Array<[string, string]> = [
    ["Go-live", "kpi_4_value_repeat"],
    ["Next touchpoint", "next_meeting"],
    ["Your lead", "gc_lead_name"],
  ];
  const colW = (W - PAD * 2) / 3;
  items.forEach(([label, key], i) => {
    const x = PAD + i * colW;
    s.addText(label.toUpperCase(), {
      x,
      y: 3.35,
      w: colW,
      h: 0.2,
      fontSize: pt(22),
      bold: true,
      charSpacing: 1.2,
      color: BRAND.blue300,
      fontFace: BRAND.fontSans,
    });
    const v = get(key);
    s.addText(v.text, {
      x,
      y: 3.58,
      w: colW - 0.2,
      h: 0.32,
      fontSize: pt(40),
      bold: true,
      italic: v.missing,
      color: v.missing ? BRAND.warning : BRAND.white,
      fontFace: BRAND.fontSans,
    });
  });
  return s;
}

/* -------------------------------------------------------------------- entry */

export async function buildKickoffDeckFile(
  data: KickoffDeckData,
  clientLogo?: string | null,
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "GoCanvas";
  pptx.company = "GoCanvas";
  pptx.title = `Client kickoff — ${data.fields["client_name"] ?? "GoCanvas"}`;
  defineMasters(pptx);

  const get = reader(data);

  const welcome = slide01Welcome(pptx, get);
  if (clientLogo) {
    // Top-right of the title slide, bounded so a wide wordmark and a square
    // badge both survive. A squashed customer logo on slide one reads as
    // carelessness about the customer.
    welcome.addImage({
      data: clientLogo,
      x: W - PAD - 1.9,
      y: 0.5,
      w: 1.9,
      h: 0.62,
      sizing: { type: "contain", w: 1.9, h: 0.62 },
    });
  }
  welcome.addNotes(prepNotes(data));
  slide02Agenda(pptx).addNotes(SPEAKER_NOTES["agenda"]!);
  slide03Introductions(pptx, get).addNotes(SPEAKER_NOTES["introductions"]!);
  if (data.optionalSlides.about) slide04About(pptx).addNotes(SPEAKER_NOTES["about"]!);
  divider(pptx, "Section 01", "Your Business").addNotes(SPEAKER_NOTES["dividerBusiness"]!);
  slide06Goals(pptx, get).addNotes(SPEAKER_NOTES["goals"]!);
  slide07Success(pptx, get).addNotes(SPEAKER_NOTES["success"]!);
  slide08Scope(pptx, get).addNotes(SPEAKER_NOTES["scope"]!);
  divider(pptx, "Section 02", "The Plan").addNotes(SPEAKER_NOTES["dividerPlan"]!);
  slide10Timeline(pptx, get).addNotes(SPEAKER_NOTES["timeline"]!);
  slide11Roles(pptx, get).addNotes(SPEAKER_NOTES["roles"]!);
  slide12Training(pptx, get).addNotes(SPEAKER_NOTES["training"]!);
  if (data.optionalSlides.integrations) {
    slide13Integrations(pptx, get).addNotes(SPEAKER_NOTES["integrations"]!);
  }
  if (data.optionalSlides.support) slide14Support(pptx, get).addNotes(SPEAKER_NOTES["support"]!);
  if (data.optionalSlides.risks) slide15Risks(pptx, get).addNotes(SPEAKER_NOTES["risks"]!);
  slide16ActionPlan(pptx, get).addNotes(SPEAKER_NOTES["actions"]!);
  slide17Close(pptx, get).addNotes(SPEAKER_NOTES["close"]!);

  const out = await pptx.write({ outputType: "nodebuffer" });
  return out as Buffer;
}
