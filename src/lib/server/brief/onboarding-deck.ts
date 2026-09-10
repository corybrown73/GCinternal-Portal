import PptxGenJS from "pptxgenjs";

import { BRAND, pt } from "@/lib/brand";
import { WORDMARK_NAVY, WORDMARK_WHITE } from "@/lib/brand-assets";
import { industryIcon } from "@/lib/industry-icons";
import { daysToValue, INTEGRATION_TIERS, shortDay, type Timeline } from "@/lib/onboarding-timeline";

import { iconSvgDataUri } from "../icon-svg";
import { fitSize } from "./pptx";

/**
 * The onboarding deck: six slides, the first seven days, with dates.
 *
 * WHAT IT IS FOR. The kickoff call. The seventeen-slide kickoff deck is the
 * whole handoff — team, goals, KPIs, RACI, risks — and it is right for a
 * ninety-minute enterprise kickoff. This is the other meeting: a customer
 * who closed yesterday, a form that will be in the field by next week, and
 * a page that says what happens on which day and who does it. Six slides,
 * because the plan fits on six and a customer reads all of a short deck.
 *
 * THE DESIGN comes from three decks the team already presents with —
 * light slides, a navy title, the blue icon-in-a-circle, numbered steps,
 * and a callout band at the foot of each slide with the one thing to
 * remember. The tokens are the design system's; the industry icon is the
 * one thing that changes per customer, so a roofer's deck does not open
 * with a pipeline operator's picture.
 *
 * WHAT VARIES PER ACCOUNT: the dates (from the close), the industry icon,
 * the first form (the library card they pointed at, or what they uploaded),
 * the homework, the field tester's name, and the last slide — an
 * integration plan when there is one, the next use cases when there is not.
 *
 * Every text box is sized to its content and anchored top, for the reason
 * ./pptx learned the hard way: PowerPoint does not clip, it overflows, and
 * a centred box overflows upward into whatever sits above.
 */

export type OnboardingDeckInput = {
  clientName: string;
  industry: string | null;
  timeline: Timeline;
  /** The GoCanvas implementation lead, for "prepared by". */
  lead: string | null;
  /** Who at the customer runs the form on real jobs. */
  fieldTester: string | null;
  /** Who is on it, both sides. The deck names them on the team slide. */
  team?: {
    lead: string | null;
    accountManager: string | null;
    solutionsEngineer: string | null;
    champion: { name: string; role: string | null } | null;
  };
  firstForm: {
    name: string;
    objective: string | null;
    source: "library" | "uploaded" | "tbd";
  } | null;
  /** From the library, for their industry, when there is no integration. */
  nextUseCases: Array<{ name: string; objective: string | null }>;
  /** Data URI, when the customer's logo is on file. */
  clientLogo?: string | null;
};

type Pptx = InstanceType<typeof PptxGenJS>;
type Slide = ReturnType<Pptx["addSlide"]>;

const W = 10;
const H = 5.625;
const PAD = 0.55;
const FOOT = "Proprietary & Confidential · Copyright 2026, Canvas Solutions, Inc.";
const FONT = BRAND.fontSans;

/* ------------------------------------------------------------ primitives */

function eyebrow(s: Slide, text: string, y = 0.42, color: string = BRAND.blue500) {
  s.addText(text.toUpperCase(), {
    x: PAD,
    y,
    w: W - PAD * 2,
    h: 0.22,
    valign: "top",
    margin: 0,
    fontSize: pt(22),
    bold: true,
    charSpacing: 1.6,
    color,
    fontFace: FONT,
  });
}

function title(s: Slide, text: string, y = 0.66, color: string = BRAND.fg1) {
  s.addText(text, {
    x: PAD,
    y,
    w: W - PAD * 2,
    h: 0.55,
    valign: "top",
    margin: 0,
    fontSize: pt(fitSize(text, W - PAD * 2 - 1.35, 64, 40, 1, 0.66)),
    bold: true,
    color,
    fontFace: FONT,
  });
}

function sub(s: Slide, text: string, y = 1.2, w = W - PAD * 2, color: string = BRAND.fg2) {
  s.addText(text, {
    x: PAD,
    y,
    w,
    h: 0.4,
    valign: "top",
    margin: 0,
    fontSize: pt(fitSize(text, w, 28, 22, 2)),
    color,
    fontFace: FONT,
  });
}

/** The blue icon-in-a-circle every reference deck uses. */
function chip(
  s: Slide,
  icon: string,
  x: number,
  y: number,
  d: number,
  fill: string = BRAND.blue500,
) {
  s.addShape("ellipse", {
    x,
    y,
    w: d,
    h: d,
    fill: { color: fill },
    line: { color: fill, width: 0 },
  });
  const inset = d * 0.26;
  s.addImage({
    data: iconSvgDataUri(icon, BRAND.white),
    x: x + inset,
    y: y + inset,
    w: d - inset * 2,
    h: d - inset * 2,
  });
}

function card(s: Slide, x: number, y: number, w: number, h: number, fill: string = BRAND.white) {
  s.addShape("roundRect", {
    x,
    y,
    w,
    h,
    fill: { color: fill },
    line: { color: BRAND.ink100, width: 0.75 },
    rectRadius: 0.08,
    shadow: { type: "outer", color: "0A1628", blur: 3, offset: 1, angle: 90, opacity: 0.06 },
  });
}

/** The band at the foot of every light slide: the one thing to remember. */
function callout(s: Slide, icon: string, text: string) {
  const y = H - 0.98;
  s.addShape("roundRect", {
    x: PAD,
    y,
    w: W - PAD * 2,
    h: 0.46,
    fill: { color: BRAND.blue050 },
    line: { color: BRAND.blue100, width: 0.75 },
    rectRadius: 0.06,
  });
  chip(s, icon, PAD + 0.12, y + 0.08, 0.3, BRAND.navy700);
  s.addText(text, {
    x: PAD + 0.52,
    y: y + 0.06,
    w: W - PAD * 2 - 0.64,
    h: 0.34,
    valign: "middle",
    margin: 0,
    fontSize: pt(fitSize(text, W - PAD * 2 - 0.64, 22, 16, 1)),
    color: BRAND.navy800,
    bold: true,
    fontFace: FONT,
  });
}

function footer(s: Slide) {
  s.addText(FOOT, {
    x: PAD,
    y: H - 0.42,
    w: 6,
    h: 0.2,
    valign: "top",
    margin: 0,
    fontSize: pt(14),
    color: BRAND.ink300,
    fontFace: FONT,
  });
  s.addImage({ data: WORDMARK_NAVY, x: W - PAD - 1.0, y: H - 0.44, w: 1.0, h: 0.19 });
}

/** The dotted pattern the reference decks put top-right. Quiet, not clip art. */
function dots(s: Slide) {
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 6; c += 1) {
      s.addShape("ellipse", {
        x: W - PAD - 1.15 + c * 0.2,
        y: 0.32 + r * 0.2,
        w: 0.06,
        h: 0.06,
        fill: { color: BRAND.blue100 },
        line: { color: BRAND.blue100, width: 0 },
      });
    }
  }
}

function light(pptx: Pptx): Slide {
  const s = pptx.addSlide();
  s.background = { color: BRAND.white };
  // The thin navy edge on the left, as in the kickoff deck: the one mark
  // that says these two decks are the same family.
  s.addShape("rect", {
    x: 0,
    y: 0,
    w: 0.12,
    h: H,
    fill: { color: BRAND.navy700 },
    line: { width: 0 },
  });
  dots(s);
  footer(s);
  return s;
}

const OWNER_LABEL: Record<string, string> = {
  gocanvas: "GoCanvas",
  client: "You",
  both: "Together",
};
const OWNER_FILL: Record<string, string> = {
  gocanvas: BRAND.navy700,
  client: BRAND.success,
  both: BRAND.blue500,
};

function ownerChip(s: Slide, owner: string, x: number, y: number, w: number) {
  s.addShape("roundRect", {
    x,
    y,
    w,
    h: 0.22,
    fill: { color: OWNER_FILL[owner] ?? BRAND.blue500 },
    line: { width: 0 },
    rectRadius: 0.11,
  });
  s.addText(OWNER_LABEL[owner] ?? owner, {
    x,
    y,
    w,
    h: 0.22,
    align: "center",
    valign: "middle",
    margin: 0,
    fontSize: pt(15),
    bold: true,
    color: BRAND.white,
    fontFace: FONT,
  });
}

/* ------------------------------------------------------------------ slides */

function slideCover(pptx: Pptx, d: OnboardingDeckInput) {
  const s = pptx.addSlide();
  s.background = { color: BRAND.navy900 };
  const t = d.timeline;

  eyebrow(s, `Your first ${daysToValue(t)} days with GoCanvas`, 1.35, BRAND.blue300);

  const headline = "Let's bring your workflow to life";
  s.addText(headline, {
    x: PAD,
    y: 1.68,
    w: 6.4,
    h: 1.2,
    valign: "top",
    margin: 0,
    fontSize: pt(fitSize(headline, 6.4, 92, 60, 2)),
    bold: true,
    color: BRAND.white,
    fontFace: FONT,
  });

  const name = d.clientName;
  s.addText(name, {
    x: PAD,
    y: 2.95,
    w: 6.4,
    h: 0.6,
    valign: "top",
    margin: 0,
    fontSize: pt(fitSize(name, 6.4, 48, 28, 1)),
    bold: true,
    color: BRAND.blue300,
    fontFace: FONT,
  });

  const when = `Closed ${shortDay(t.closeDate)} · Live in the field by ${shortDay(t.liveDate)}`;
  s.addText(when, {
    x: PAD,
    y: 3.6,
    w: 6.4,
    h: 0.3,
    valign: "top",
    margin: 0,
    fontSize: pt(24),
    color: BRAND.fgOnDark3,
    fontFace: FONT,
  });
  s.addText(`Prepared by ${d.lead ?? "your GoCanvas implementation team"}`, {
    x: PAD,
    y: 3.95,
    w: 6.4,
    h: 0.3,
    valign: "top",
    margin: 0,
    fontSize: pt(20),
    color: BRAND.fgOnDark3,
    fontFace: FONT,
  });

  // The industry, as a picture. The one thing that changes per customer.
  const ring = 2.3;
  const cx = W - PAD - ring;
  const cy = 1.55;
  s.addShape("ellipse", {
    x: cx,
    y: cy,
    w: ring,
    h: ring,
    fill: { color: BRAND.navy800 },
    line: { color: BRAND.navy700, width: 1 },
  });
  chip(s, industryIcon(d.industry), cx + 0.35, cy + 0.35, ring - 0.7, BRAND.blue500);
  if (d.industry) {
    s.addText(d.industry.toUpperCase(), {
      x: cx - 0.3,
      y: cy + ring + 0.1,
      w: ring + 0.6,
      h: 0.25,
      align: "center",
      valign: "top",
      margin: 0,
      fontSize: pt(18),
      bold: true,
      charSpacing: 1.6,
      color: BRAND.blue300,
      fontFace: FONT,
    });
  }

  s.addImage({ data: WORDMARK_WHITE, x: PAD, y: H - 0.62, w: 1.25, h: 0.24 });
  if (d.clientLogo) {
    s.addImage({
      data: d.clientLogo,
      x: PAD + 1.6,
      y: H - 0.72,
      w: 1.6,
      h: 0.44,
      sizing: { type: "contain", w: 1.6, h: 0.44 },
    });
  }
  s.addNotes(
    "Open with the date on the right: they closed yesterday and they will be live next week. That is the promise, and every slide after this is how.",
  );
}

function slidePlan(pptx: Pptx, d: OnboardingDeckInput) {
  const s = light(pptx);
  const t = d.timeline;
  eyebrow(s, "The plan at a glance");
  title(s, `Seven days to a form in the field`);
  sub(
    s,
    "Two short working sessions, a little homework, one crew on real jobs. Every day below has an owner.",
  );

  const ms = t.milestones;
  const n = ms.length;
  const x0 = PAD + 0.25;
  const span = W - PAD * 2 - 0.5;
  const step = span / (n - 1);
  const lineY = 2.32;
  const dia = 0.56;

  // The rail, then the nodes on it.
  s.addShape("line", {
    x: x0,
    y: lineY,
    w: span,
    h: 0,
    line: { color: BRAND.ink200, width: 2 },
  });

  ms.forEach((m, i) => {
    const cx = x0 + i * step;
    const isLive = m.key === "live";
    s.addText(`DAY ${m.day}`, {
      x: cx - 0.55,
      y: 1.68,
      w: 1.1,
      h: 0.2,
      align: "center",
      valign: "top",
      margin: 0,
      fontSize: pt(16),
      bold: true,
      charSpacing: 1.2,
      color: BRAND.ink400,
      fontFace: FONT,
    });
    chip(s, m.icon, cx - dia / 2, lineY - dia / 2, dia, isLive ? BRAND.navy700 : BRAND.blue500);
    s.addText(m.label, {
      x: cx - 0.64,
      y: lineY + 0.4,
      w: 1.28,
      h: 0.46,
      align: "center",
      valign: "top",
      margin: 0,
      fontSize: pt(fitSize(m.label, 1.28, 21, 17, 2)),
      bold: true,
      color: BRAND.fg1,
      fontFace: FONT,
    });
    s.addText(shortDay(m.date), {
      x: cx - 0.64,
      y: lineY + 0.88,
      w: 1.28,
      h: 0.24,
      align: "center",
      valign: "top",
      margin: 0,
      fontSize: pt(19),
      bold: true,
      color: m.moved ? BRAND.navy700 : BRAND.blue500,
      fontFace: FONT,
    });
    ownerChip(s, m.owner, cx - 0.44, lineY + 1.16, 0.88);
    const under = m.minutes ? `${m.minutes} min` : m.moved ? "date moved" : "";
    if (under) {
      s.addText(under, {
        x: cx - 0.5,
        y: lineY + 1.42,
        w: 1,
        h: 0.2,
        align: "center",
        valign: "top",
        margin: 0,
        fontSize: pt(15),
        italic: m.moved && !m.minutes,
        color: BRAND.ink400,
        fontFace: FONT,
      });
    }
  });

  // Legend: what the owner colours mean, in the band above the callout.
  const legend: Array<[string, string]> = [
    ["gocanvas", "we do it, you hear about it"],
    ["client", "your homework, fifteen minutes"],
    ["both", "on a call, hands on the keyboard together"],
  ];
  const ly = lineY + 1.98;
  let lx = x0 - 0.25;
  legend.forEach(([owner, meaning]) => {
    ownerChip(s, owner, lx, ly, 0.88);
    s.addText(meaning, {
      x: lx + 0.98,
      y: ly + 0.01,
      w: 2.2,
      h: 0.22,
      valign: "middle",
      margin: 0,
      fontSize: pt(17),
      color: BRAND.fg2,
      fontFace: FONT,
    });
    lx += 3.05;
  });

  callout(
    s,
    "Rocket",
    `Live on ${shortDay(t.liveDate)}. No account should stall waiting on a form — we drive the pace, and you own the form.`,
  );
  s.addNotes(
    "Walk the rail left to right. Say the dates out loud and book the two calls before you leave this slide. If a date does not work for them, move it now — the plan is ours to keep, the dates are theirs to set.",
  );
}

function slideTogether(pptx: Pptx, d: OnboardingDeckInput) {
  const s = light(pptx);
  const t = d.timeline;
  eyebrow(s, "How we work together");
  title(s, "We build it with you, not for you");
  sub(
    s,
    "A form you built yourself is one you will change yourself — and the second use case shows up on its own.",
  );

  const top = 1.72;
  const colW = (W - PAD * 2 - 0.25) / 2;
  const cols: Array<{ head: string; icon: string; fill: string; items: string[] }> = [
    {
      head: "We bring",
      icon: "Users",
      fill: BRAND.blue500,
      items: [
        "A starting point from the form library, in your vocabulary",
        "The build, live on the call, with you watching every field",
        "The logic, routing and notifications the office needs",
        "Someone watching the first submissions come in",
      ],
    },
    {
      head: "You bring",
      icon: "HardHat",
      fill: BRAND.success,
      items: [
        "How the job actually runs — the process, not the org chart",
        "One field user willing to try it on real work",
        "The customer or site list, so nothing is typed twice",
        "The last changes, made by you, in the working session",
      ],
    },
  ];
  cols.forEach((c, i) => {
    const x = PAD + i * (colW + 0.25);
    card(s, x, top, colW, 1.78);
    chip(s, c.icon, x + 0.16, top + 0.16, 0.42, c.fill);
    s.addText(c.head, {
      x: x + 0.7,
      y: top + 0.2,
      w: colW - 0.85,
      h: 0.34,
      valign: "top",
      margin: 0,
      fontSize: pt(30),
      bold: true,
      color: BRAND.fg1,
      fontFace: FONT,
    });
    s.addText(
      c.items.map((it, j) => ({
        text: it,
        options: { bullet: { indent: 12 }, breakLine: j < c.items.length - 1, paraSpaceAfter: 4 },
      })),
      {
        x: x + 0.16,
        y: top + 0.66,
        w: colW - 0.32,
        h: 1.05,
        valign: "top",
        margin: 0,
        fontSize: pt(22),
        color: BRAND.fg2,
        fontFace: FONT,
      },
    );
  });

  // Homework: the checkboxes the customer walks away with.
  const kickoff = t.milestones.find((m) => m.key === "kickoff");
  const homeworkDue = t.milestones.find((m) => m.key === "homework");
  const hy = top + 1.95;
  s.addText(
    `Your homework before the working session${homeworkDue ? ` · due ${shortDay(homeworkDue.date)}` : ""}`,
    {
      x: PAD,
      y: hy,
      w: W - PAD * 2,
      h: 0.24,
      valign: "top",
      margin: 0,
      fontSize: pt(20),
      bold: true,
      charSpacing: 1,
      color: BRAND.blue500,
      fontFace: FONT,
    },
  );
  const items = kickoff?.homework ?? [];
  const iw = (W - PAD * 2 - 0.2 * (items.length - 1)) / Math.max(1, items.length);
  items.forEach((h, i) => {
    const x = PAD + i * (iw + 0.2);
    const y = hy + 0.32;
    s.addShape("rect", {
      x,
      y: y + 0.03,
      w: 0.2,
      h: 0.2,
      fill: { color: BRAND.white },
      line: { color: BRAND.navy700, width: 1.25 },
    });
    s.addText(h, {
      x: x + 0.3,
      y,
      w: iw - 0.3,
      h: 0.42,
      valign: "top",
      margin: 0,
      fontSize: pt(fitSize(h, iw - 0.3, 22, 17, 2)),
      color: BRAND.fg1,
      fontFace: FONT,
    });
  });

  callout(
    s,
    "Users",
    "Fifteen minutes of homework means the second session starts from a live account, not a blank one.",
  );
  s.addNotes(
    "This is the slide that changes the relationship. Say it plainly: you make the last changes, not us. Assign the three homework items to a named person before moving on.",
  );
}

function slideFirstForm(pptx: Pptx, d: OnboardingDeckInput) {
  const s = light(pptx);
  const t = d.timeline;
  const at = (key: string) => t.milestones.find((m) => m.key === key);
  eyebrow(s, "Your first form");
  title(s, "The star of the show");
  sub(
    s,
    "One workflow, one crew, real jobs. Everything else waits until this one has been proven in the field.",
  );

  const top = 1.72;
  const leftW = 4.55;
  card(s, PAD, top, leftW, 2.55, BRAND.blue050);
  chip(s, industryIcon(d.industry), PAD + 0.22, top + 0.22, 0.7, BRAND.blue500);
  const formName = d.firstForm?.name ?? "To be chosen on the kickoff call";
  s.addText(formName, {
    x: PAD + 1.08,
    y: top + 0.22,
    w: leftW - 1.3,
    h: 0.7,
    valign: "top",
    margin: 0,
    fontSize: pt(fitSize(formName, leftW - 1.3, 34, 22, 2)),
    bold: true,
    color: BRAND.fg1,
    fontFace: FONT,
  });
  const objective =
    d.firstForm?.objective ??
    "We pick the starting point together from the form library, in the words your crews already use.";
  s.addText(objective, {
    x: PAD + 0.22,
    y: top + 1.05,
    w: leftW - 0.44,
    h: 1.0,
    valign: "top",
    margin: 0,
    fontSize: pt(fitSize(objective, leftW - 0.44, 25, 19, 4)),
    color: BRAND.fg2,
    fontFace: FONT,
  });
  const source =
    d.firstForm?.source === "uploaded"
      ? "Starting point: the form you already run today"
      : d.firstForm?.source === "library"
        ? "Starting point: from the GoCanvas form library"
        : "Starting point: chosen together on the kickoff call";
  s.addText(source.toUpperCase(), {
    x: PAD + 0.22,
    y: top + 2.15,
    w: leftW - 0.44,
    h: 0.22,
    valign: "top",
    margin: 0,
    fontSize: pt(14),
    bold: true,
    charSpacing: 1.2,
    color: BRAND.blue500,
    fontFace: FONT,
  });

  // Right: what happens to it, and when.
  const rx = PAD + leftW + 0.3;
  const rw = W - PAD - rx;
  const rows: Array<{ icon: string; head: string; body: string }> = [
    {
      icon: "PhoneCall",
      head: `Built live · ${at("kickoff") ? shortDay(at("kickoff")!.date) : "kickoff"}`,
      body: "On the kickoff call, from the starting point, with you watching every field go in.",
    },
    {
      icon: "Wrench",
      head: `Finished together · ${at("working") ? shortDay(at("working")!.date) : "working session"}`,
      body: "Thirty minutes. Logic, notifications, and the last changes made by your hands.",
    },
    {
      icon: "HardHat",
      head: `Proven on real jobs · from ${at("fieldtest") ? shortDay(at("fieldtest")!.date) : "the field test"}`,
      body: `${d.fieldTester ? d.fieldTester : "Your field tester"} runs it on real work. We watch the submissions and fix what the field says.`,
    },
  ];
  rows.forEach((r, i) => {
    const y = top + i * 0.86;
    chip(s, r.icon, rx, y + 0.04, 0.44, i === 2 ? BRAND.navy700 : BRAND.blue500);
    s.addText(r.head, {
      x: rx + 0.6,
      y,
      w: rw - 0.6,
      h: 0.26,
      valign: "top",
      margin: 0,
      fontSize: pt(fitSize(r.head, rw - 0.6, 23, 18, 1)),
      bold: true,
      color: BRAND.fg1,
      fontFace: FONT,
    });
    s.addText(r.body, {
      x: rx + 0.6,
      y: y + 0.28,
      w: rw - 0.6,
      h: 0.52,
      valign: "top",
      margin: 0,
      fontSize: pt(fitSize(r.body, rw - 0.6, 20, 16, 3)),
      color: BRAND.fg2,
      fontFace: FONT,
    });
  });

  callout(
    s,
    "Target",
    "Proven in the field before anything is connected to it. That is what makes the mapping right later.",
  );
  s.addNotes(
    "If they uploaded a form, this slide is about mapping what they have. If it came from the library, it is a starting point — say so, and ask what is missing from it before you build.",
  );
}

function slideDaySeven(pptx: Pptx, d: OnboardingDeckInput) {
  const s = light(pptx);
  const t = d.timeline;
  const working = t.milestones.find((m) => m.key === "working");
  eyebrow(s, `Day ${t.milestones[t.milestones.length - 1]?.day ?? 7}`);
  title(s, `What good looks like on ${shortDay(t.liveDate)}`);

  const top = 1.45;
  const leftW = 4.9;
  const rows: Array<{ icon: string; text: string }> = [
    {
      icon: "Smartphone",
      text: "Your crew submits from the phone, on the job, with photos and a signature.",
    },
    {
      icon: "Building2",
      text: "The office sees the work as it happens — no retyping, no Friday pile.",
    },
    {
      icon: "ClipboardCheck",
      text: "The first report goes out without anyone touching a spreadsheet.",
    },
    { icon: "Users", text: "The crew has asked for a change, and it was made the same day." },
  ];
  rows.forEach((r, i) => {
    const y = top + i * 0.72;
    chip(s, r.icon, PAD, y, 0.46, BRAND.blue500);
    s.addText(r.text, {
      x: PAD + 0.62,
      y: y + 0.02,
      w: leftW - 0.62,
      h: 0.6,
      valign: "top",
      margin: 0,
      fontSize: pt(fitSize(r.text, leftW - 0.62, 23, 18, 3)),
      color: BRAND.fg1,
      fontFace: FONT,
    });
  });

  // Right: the working session, minute by minute.
  const rx = PAD + leftW + 0.3;
  const rw = W - PAD - rx;
  card(s, rx, top, rw, 2.85);
  chip(s, "Wrench", rx + 0.16, top + 0.16, 0.42, BRAND.navy700);
  s.addText("The 30-minute working session", {
    x: rx + 0.7,
    y: top + 0.14,
    w: rw - 0.86,
    h: 0.26,
    valign: "top",
    margin: 0,
    fontSize: pt(fitSize("The 30-minute working session", rw - 0.86, 24, 18, 1)),
    bold: true,
    color: BRAND.fg1,
    fontFace: FONT,
  });
  s.addText(working ? `${shortDay(working.date)} · ${working.minutes ?? 30} minutes` : "Day 3", {
    x: rx + 0.7,
    y: top + 0.4,
    w: rw - 0.86,
    h: 0.22,
    valign: "top",
    margin: 0,
    fontSize: pt(18),
    bold: true,
    color: BRAND.blue500,
    fontFace: FONT,
  });
  const agenda: Array<[string, string]> = [
    ["5 min", "Debrief the homework and what you found in the account"],
    ["15 min", "Finish the form together — your hands on the keyboard"],
    ["5 min", "Logic, routing and the notifications the office wants"],
    ["5 min", "Name the field tester and book the field-test window"],
  ];
  agenda.forEach(([mins, what], i) => {
    const y = top + 0.78 + i * 0.5;
    s.addText(mins, {
      x: rx + 0.16,
      y,
      w: 0.62,
      h: 0.24,
      valign: "top",
      margin: 0,
      fontSize: pt(20),
      bold: true,
      color: BRAND.blue500,
      fontFace: FONT,
    });
    s.addText(what, {
      x: rx + 0.84,
      y,
      w: rw - 1.0,
      h: 0.46,
      valign: "top",
      margin: 0,
      fontSize: pt(fitSize(what, rw - 1.0, 20, 16, 2)),
      color: BRAND.fg2,
      fontFace: FONT,
    });
  });

  callout(
    s,
    "Flag",
    "If any of the four on the left is not true on day seven, we are not done — and we say so.",
  );
  s.addNotes(
    "Ask which of the four matters most to them. That is the one you check first on the live date.",
  );
}

function slideNext(pptx: Pptx, d: OnboardingDeckInput) {
  const s = light(pptx);
  const t = d.timeline;
  const integ = t.integration;

  if (integ.weeks > 0 && integ.startsOn) {
    eyebrow(s, "After the form is live");
    title(s, `Then we connect it${integ.target ? ` to ${integ.target}` : ""}`);
    sub(
      s,
      `Starts ${shortDay(integ.startsOn)}, the business day after your form is live. About ${integ.weeks} week${integ.weeks === 1 ? "" : "s"}.`,
    );

    // The tier strip, from the team's own complexity tiering. The chosen one lit.
    const top = 1.78;
    const tiers = INTEGRATION_TIERS.filter((x) => x.tier >= 1);
    const gap = 0.14;
    const bw = (W - PAD * 2 - gap * (tiers.length - 1)) / tiers.length;
    tiers.forEach((x, i) => {
      const bx = PAD + i * (bw + gap);
      const on = x.tier === integ.tier;
      s.addShape("roundRect", {
        x: bx,
        y: top,
        w: bw,
        h: 0.86,
        fill: { color: on ? BRAND.navy700 : BRAND.white },
        line: { color: on ? BRAND.navy700 : BRAND.ink100, width: 0.75 },
        rectRadius: 0.06,
      });
      s.addText(`TIER ${x.tier}`, {
        x: bx + 0.1,
        y: top + 0.1,
        w: bw - 0.2,
        h: 0.2,
        valign: "top",
        margin: 0,
        fontSize: pt(13),
        bold: true,
        charSpacing: 1.2,
        color: on ? BRAND.blue300 : BRAND.ink400,
        fontFace: FONT,
      });
      s.addText(x.name, {
        x: bx + 0.1,
        y: top + 0.3,
        w: bw - 0.2,
        h: 0.26,
        valign: "top",
        margin: 0,
        fontSize: pt(fitSize(x.name, bw - 0.2, 20, 14, 1)),
        bold: true,
        color: on ? BRAND.white : BRAND.fg1,
        fontFace: FONT,
      });
      s.addText(x.weeks ? `${x.weeks} wk${x.weeks === 1 ? "" : "s"}` : "—", {
        x: bx + 0.1,
        y: top + 0.56,
        w: bw - 0.2,
        h: 0.2,
        valign: "top",
        margin: 0,
        fontSize: pt(14),
        color: on ? BRAND.fgOnDark2 : BRAND.ink400,
        fontFace: FONT,
      });
    });

    const cy = top + 1.06;
    card(s, PAD, cy, W - PAD * 2, 1.62);
    chip(s, "Workflow", PAD + 0.16, cy + 0.16, 0.42, BRAND.blue500);
    s.addText(`${integ.name} integration — what that means`, {
      x: PAD + 0.7,
      y: cy + 0.18,
      w: W - PAD * 2 - 0.9,
      h: 0.28,
      valign: "top",
      margin: 0,
      fontSize: pt(24),
      bold: true,
      color: BRAND.fg1,
      fontFace: FONT,
    });
    const body = `${integ.summary} We map the fields from the form your crew has already run — which is why it comes second.`;
    s.addText(body, {
      x: PAD + 0.7,
      y: cy + 0.5,
      w: W - PAD * 2 - 0.9,
      h: 0.42,
      valign: "top",
      margin: 0,
      fontSize: pt(fitSize(body, W - PAD * 2 - 0.9, 20, 16, 2)),
      color: BRAND.fg2,
      fontFace: FONT,
    });
    // The bar: form live, integration starts, target finish — three dates on one line.
    const bx0 = PAD + 0.7;
    const bw2 = W - PAD * 2 - 0.9;
    const by = cy + 1.14;
    s.addShape("roundRect", {
      x: bx0,
      y: by,
      w: bw2,
      h: 0.12,
      fill: { color: BRAND.blue500 },
      line: { width: 0 },
      rectRadius: 0.06,
    });
    // The form's week is the short head of the bar; the integration is the rest.
    const headW = Math.min(bw2 * 0.3, 2.5);
    s.addShape("roundRect", {
      x: bx0,
      y: by,
      w: headW,
      h: 0.12,
      fill: { color: BRAND.navy700 },
      line: { width: 0 },
      rectRadius: 0.06,
    });
    s.addShape("ellipse", {
      x: bx0 + headW - 0.09,
      y: by - 0.03,
      w: 0.18,
      h: 0.18,
      fill: { color: BRAND.white },
      line: { color: BRAND.navy700, width: 1.5 },
    });
    const label = (x: number, w: number, align: "left" | "right", text: string, color: string) =>
      s.addText(text, {
        x,
        y: by + 0.2,
        w,
        h: 0.2,
        align,
        valign: "top",
        margin: 0,
        fontSize: pt(16),
        bold: true,
        color,
        fontFace: FONT,
      });
    label(bx0, headW - 0.15, "left", `Form live · ${shortDay(t.liveDate)}`, BRAND.navy700);
    label(
      bx0 + headW + 0.12,
      bw2 - headW - 2.2,
      "left",
      `Integration starts · ${shortDay(integ.startsOn)}`,
      BRAND.blue500,
    );
    label(
      bx0 + bw2 - 2.0,
      2.0,
      "right",
      `Target finish · ${integ.endsOn ? shortDay(integ.endsOn) : "to be agreed"}`,
      BRAND.blue500,
    );

    callout(
      s,
      "Route",
      "The form first, always. Field mapping is the whole of an integration, and it cannot be right until a crew has used the form on a real job.",
    );
    s.addNotes(
      "If they push to start the integration sooner, this is the slide to hold. Two weeks of real submissions is what makes the mapping right, and a remapped integration costs more than the two weeks.",
    );
    return;
  }

  eyebrow(s, "After the form is live");
  title(s, "Your next use cases");
  sub(
    s,
    "Three forms your industry runs next. You will build these yourselves — that is the point of the first seven days.",
  );

  const cards = d.nextUseCases.slice(0, 3);
  const top = 1.78;
  const gap = 0.22;
  const cw = (W - PAD * 2 - gap * 2) / 3;
  const icon = industryIcon(d.industry);
  if (cards.length === 0) {
    s.addText("We will pick these together once the first form is in the field.", {
      x: PAD,
      y: top + 0.4,
      w: W - PAD * 2,
      h: 0.4,
      valign: "top",
      margin: 0,
      fontSize: pt(20),
      color: BRAND.fg2,
      fontFace: FONT,
    });
  }
  cards.forEach((c, i) => {
    const x = PAD + i * (cw + gap);
    card(s, x, top, cw, 2.6);
    chip(s, icon, x + 0.18, top + 0.18, 0.5, i === 0 ? BRAND.navy700 : BRAND.blue500);
    s.addText(`${i + 1}`, {
      x: x + cw - 0.5,
      y: top + 0.16,
      w: 0.34,
      h: 0.3,
      align: "center",
      valign: "top",
      margin: 0,
      fontSize: pt(26),
      bold: true,
      color: BRAND.ink200,
      fontFace: FONT,
    });
    s.addText(c.name, {
      x: x + 0.18,
      y: top + 0.82,
      w: cw - 0.36,
      h: 0.6,
      valign: "top",
      margin: 0,
      fontSize: pt(fitSize(c.name, cw - 0.36, 26, 19, 2)),
      bold: true,
      color: BRAND.fg1,
      fontFace: FONT,
    });
    if (c.objective) {
      s.addText(c.objective, {
        x: x + 0.18,
        y: top + 1.42,
        w: cw - 0.36,
        h: 1.05,
        valign: "top",
        margin: 0,
        fontSize: pt(fitSize(c.objective, cw - 0.36, 21, 16, 5)),
        color: BRAND.fg2,
        fontFace: FONT,
      });
    }
  });

  callout(
    s,
    "Users",
    "Support is built in: the same team, the same working-session format, whenever the next form is ready to start.",
  );
  s.addNotes(
    "Do not sell these. Point at them and ask which one they would build next. The answer tells you what the second working session is about.",
  );
}

/* --------------------------------------------------------------- the deck */

export async function buildOnboardingDeckFile(d: OnboardingDeckInput): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "GoCanvas";
  pptx.company = "GoCanvas";
  pptx.title = `Onboarding plan — ${d.clientName}`;

  slideCover(pptx, d);
  slidePlan(pptx, d);
  slideTogether(pptx, d);
  slideFirstForm(pptx, d);
  slideDaySeven(pptx, d);
  slideNext(pptx, d);

  const out = await pptx.write({ outputType: "nodebuffer" });
  return out as Buffer;
}
