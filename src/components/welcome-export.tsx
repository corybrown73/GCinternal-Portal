import type PptxGenJS from "pptxgenjs";

import { GOCANVAS_APP } from "@/lib/app-links";
import { dayLabel, daysToValue, shortDay, type Milestone } from "@/lib/onboarding-timeline";
import { firstName } from "@/lib/team-profile";
import { isScreenShown, type WelcomeView } from "@/lib/welcome";
import { needTiming, phaseOneTime, roleBlurb } from "@/lib/welcome-copy";
import { whenLabel } from "@/lib/welcome-events";

/**
 * The page as a PowerPoint — an editable one.
 *
 * It used to screenshot every screen and paste the picture on a slide: the
 * exact pixels, and nothing a person could change. A presenter who wanted
 * to fix one word had to come back here and export again. Now every slide
 * is built from the same data the screens are drawn from, as PowerPoint's
 * own text boxes, shapes and pictures: same words, same order, same colours,
 * and every one of them editable in PowerPoint.
 *
 * The speaker notes ride along as slide notes, as before. Runs in the
 * browser; the only fetches are the pictures (wordmark, client logo, the
 * lead's photo, the QR), each of which is optional.
 */
export async function exportWelcomePptx(args: {
  view: WelcomeView;
  /** The screens to include, in order, by key. */
  keys: string[];
  /** Speaker notes per screen, same order; empty string for none. */
  notes: string[];
  qr?: { url: string; dataUrl: string } | null;
  fileName: string;
  title: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<void> {
  const pptxMod = await import("pptxgenjs");
  const Pptx = (pptxMod as { default?: unknown }).default ?? pptxMod;
  const pptx = new (Pptx as new () => PptxGenJS)();
  pptx.layout = "LAYOUT_WIDE"; // 13.333 × 7.5 in
  pptx.title = args.title;

  const view = args.view;
  const images = {
    wordmark: await asDataUrl("/branding/gocanvas-wordmark-navy.png"),
    clientLogo: view.clientLogoUrl ? await asDataUrl(view.clientLogoUrl) : null,
    leadPhoto: view.team.leadCard?.photoUrl ? await asDataUrl(view.team.leadCard.photoUrl) : null,
    qr: args.qr?.dataUrl ?? null,
  };
  const ctx: Ctx = { pptx, view, images, page: 0 };

  const total = args.keys.length;
  for (let i = 0; i < total; i++) {
    const key = args.keys[i]!;
    ctx.page = i + 1;
    const slide = pptx.addSlide();
    slide.background = { color: C.paper };
    if (key === "cover") cover(slide, ctx);
    else if (key === "team") team(slide, ctx);
    else if (key === "overview") overview(slide, ctx);
    else if (key === "plan") plan(slide, ctx);
    else if (key.startsWith("phase-")) phaseScreen(slide, ctx, Number(key.slice(6)));
    else if (key === "together") together(slide, ctx);
    else if (key === "form") firstForm(slide, ctx);
    else if (key === "business") business(slide, ctx);
    const note = args.notes[i];
    if (note) slide.addNotes(note);
    args.onProgress?.(i + 1, total);
  }
  await pptx.writeFile({ fileName: args.fileName });
}

/** The keys of the screens the page shows, in order — the same list the page draws. */
export function exportKeys(view: WelcomeView): string[] {
  const all = [
    "cover",
    "team",
    "overview",
    "plan",
    ...view.timeline.phases.map((ph) => `phase-${ph.phase}`),
    "together",
    "form",
    "business",
  ];
  return all.filter((k) => isScreenShown(k, view.hiddenScreens));
}

/** "Maverick Well Pluggers" → "Maverick-Well-Pluggers-onboarding-plan.pptx" */
export function pptxFileName(clientName: string): string {
  const safe = clientName
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${safe || "customer"}-onboarding-plan.pptx`;
}

/* ------------------------------------------------------------ palette & frame */

// The page's own colours (src/styles.css, .gc-welcome), without the '#'.
const C = {
  navy: "072B57",
  navyDeep: "041633",
  blue: "039DE7",
  blueDeep: "12509B",
  blueSoft: "EEF7FD",
  blueLine: "D6EFFB",
  ink: "0A1628",
  muted: "6B7A90",
  paper: "FFFFFF",
  line: "E3E8EF",
  green: "1B7F4A",
  greenSoft: "E7F5EC",
  amber: "9A6700",
  amberSoft: "FFF4D6",
};
const FONT = "Calibri";
const W = 13.333;
const H = 7.5;
const M = 0.6; // side margin
const CW = W - 2 * M; // content width

type Ctx = {
  pptx: PptxGenJS;
  view: WelcomeView;
  images: {
    wordmark: string | null;
    clientLogo: string | null;
    leadPhoto: string | null;
    qr: string | null;
  };
  page: number;
};
type Slide = PptxGenJS.Slide;
type Box = { x: number; y: number; w: number; h: number };

function text(
  slide: Slide,
  str: string | PptxGenJS.TextProps[],
  box: Box,
  opts: Partial<PptxGenJS.TextPropsOptions> = {},
): void {
  slide.addText(str, {
    ...box,
    fontFace: FONT,
    fontSize: 12,
    color: C.ink,
    margin: 0,
    valign: "top",
    isTextBox: true,
    ...opts,
  });
}

function rect(slide: Slide, box: Box, fill: string, line?: string, radius = 0.08): void {
  slide.addShape("roundRect" as PptxGenJS.ShapeType, {
    ...box,
    fill: { color: fill },
    line: line ? { color: line, width: 0.75 } : { color: fill, width: 0 },
    rectRadius: radius,
  });
}

/**
 * The frame every content screen shares: eyebrow, headline with its blue run,
 * lede, the band at the foot, and the footer. Returns the box the content
 * may use between them.
 */
function frame(
  slide: Slide,
  ctx: Ctx,
  f: { eyebrow: string; title: string; accent?: string; lede?: string; band?: string },
): Box {
  text(
    slide,
    f.eyebrow.toUpperCase(),
    { x: M, y: 0.45, w: CW, h: 0.25 },
    {
      fontSize: 10,
      bold: true,
      color: C.blue,
      charSpacing: 2,
    },
  );
  const runs: PptxGenJS.TextProps[] = [{ text: f.title, options: { color: C.navy } }];
  if (f.accent) runs.push({ text: ` ${f.accent}`, options: { color: C.blue } });
  text(slide, runs, { x: M, y: 0.72, w: CW, h: 0.7 }, { fontSize: 30, bold: true });
  let y = 1.45;
  if (f.lede) {
    text(slide, f.lede, { x: M, y, w: CW, h: 0.45 }, { fontSize: 12.5, color: C.muted });
    y += 0.5;
  }
  const bandH = f.band ? 0.62 : 0;
  const bandY = H - 0.55 - bandH;
  if (f.band) {
    rect(slide, { x: M, y: bandY, w: CW, h: bandH }, C.blueSoft, C.blueLine);
    text(
      slide,
      f.band,
      { x: M + 0.2, y: bandY + 0.12, w: CW - 0.4, h: bandH - 0.2 },
      {
        fontSize: 11.5,
        color: C.navy,
        valign: "middle",
      },
    );
  }
  footer(slide, ctx);
  return { x: M, y: y + 0.1, w: CW, h: bandY - y - 0.25 };
}

function footer(slide: Slide, ctx: Ctx): void {
  text(
    slide,
    "gocanvas.com",
    { x: M, y: H - 0.42, w: 3, h: 0.25 },
    {
      fontSize: 9,
      color: C.muted,
    },
  );
  text(
    slide,
    String(ctx.page).padStart(2, "0"),
    { x: W - M - 1, y: H - 0.42, w: 1, h: 0.25 },
    {
      fontSize: 9,
      color: C.muted,
      align: "right",
    },
  );
}

/** A card: white on the paper with a hairline, or tinted. */
function card(slide: Slide, box: Box, tone: "plain" | "now" | "done" | "soft" = "plain"): void {
  const fill = tone === "done" ? C.greenSoft : tone === "soft" ? C.blueSoft : C.paper;
  const line = tone === "now" ? C.blue : tone === "done" ? "BFE3CC" : C.line;
  rect(slide, box, fill, line, 0.1);
}

function ownerWord(owner: Milestone["owner"]): string {
  return owner === "client" ? "You" : owner === "gocanvas" ? "GoCanvas" : "Together";
}

/* ------------------------------------------------------------ the screens */

function cover(slide: Slide, ctx: Ctx): void {
  const { view, images } = ctx;
  const t = view.timeline;
  // A soft blue field on the right, the way the page's cover has its art.
  rect(slide, { x: 8.6, y: 0, w: W - 8.6, h: H }, C.blueSoft, undefined, 0);
  if (images.wordmark) {
    slide.addImage({ data: images.wordmark, x: M, y: 0.45, h: 0.38, w: 2.1 });
  } else {
    text(
      slide,
      "GoCanvas",
      { x: M, y: 0.45, w: 2.5, h: 0.4 },
      {
        fontSize: 16,
        bold: true,
        color: C.navy,
      },
    );
  }
  if (images.clientLogo) {
    slide.addImage({
      data: images.clientLogo,
      x: 8.9,
      y: 0.45,
      h: 0.6,
      w: 2.4,
      sizing: { type: "contain", w: 2.4, h: 0.6 },
    });
  }
  const eyebrow = `${
    view.path === "existing"
      ? "Services plan"
      : view.path === "dm_conversion"
        ? "Conversion plan"
        : "Onboarding plan"
  } · ${view.industry ?? "Your team"} · ${
    t.phases.length
      ? `Phase ${t.currentPhase} of ${t.phases.length + 1}`
      : `${daysToValue(t)} business days to value`
  }`;
  text(
    slide,
    eyebrow.toUpperCase(),
    { x: M, y: 1.6, w: 7.6, h: 0.25 },
    {
      fontSize: 10,
      bold: true,
      color: C.blue,
      charSpacing: 2,
    },
  );
  const headline: [string, string] =
    view.path === "existing"
      ? ["Let's take your", "workflow further"]
      : view.path === "dm_conversion"
        ? ["Let's move your forms", "over, one at a time"]
        : ["Let's bring your", "workflow to life"];
  text(
    slide,
    [
      { text: headline[0], options: { color: C.navy, breakLine: true } },
      { text: headline[1], options: { color: C.blue } },
    ],
    { x: M, y: 1.95, w: 7.6, h: 1.7 },
    { fontSize: 40, bold: true, lineSpacingMultiple: 0.95 },
  );
  rect(slide, { x: M, y: 3.75, w: 0.9, h: 0.06 }, C.blue, undefined, 0);
  text(
    slide,
    view.clientName,
    { x: M, y: 3.95, w: 7.6, h: 0.5 },
    {
      fontSize: 22,
      bold: true,
      color: C.navy,
    },
  );
  const lede =
    view.path === "existing"
      ? `Welcome back as of ${shortDay(t.closeDate)}. Form review ${shortDay(t.milestones[1]?.date ?? t.closeDate)}. Your form ready for the integration by ${shortDay(t.liveDate)} — optimised with you, not for you.`
      : `Welcome aboard as of ${shortDay(t.closeDate)}. Kickoff ${shortDay(t.milestones[1]?.date ?? t.closeDate)}. Your first form in the field by ${shortDay(t.liveDate)} — built with you, not for you.`;
  text(slide, lede, { x: M, y: 4.5, w: 7.6, h: 0.8 }, { fontSize: 13, color: C.muted });
  const pills = ["Build", "Collect in the field", "Connect"];
  let px = M;
  for (const p of pills) {
    const w = 0.35 + p.length * 0.085;
    rect(slide, { x: px, y: 5.45, w, h: 0.34 }, C.blueSoft, C.blueLine, 0.17);
    text(
      slide,
      p,
      { x: px, y: 5.45, w, h: 0.34 },
      {
        fontSize: 11,
        color: C.blueDeep,
        align: "center",
        valign: "middle",
      },
    );
    px += w + 0.12;
  }
  if (view.lead) {
    text(
      slide,
      `Prepared by ${view.lead}, GoCanvas onboarding`,
      { x: M, y: 5.95, w: 7.6, h: 0.3 },
      {
        fontSize: 10.5,
        color: C.muted,
      },
    );
  }
  if (images.qr) {
    slide.addImage({ data: images.qr, x: 9.3, y: 2.6, w: 1.7, h: 1.7 });
    text(
      slide,
      [
        { text: "Scan for your plan", options: { bold: true, color: C.navy, breakLine: true } },
        { text: "Your dates, your homework, on your phone.", options: { color: C.muted } },
      ],
      { x: 9.3, y: 4.4, w: 3.4, h: 0.7 },
      { fontSize: 11 },
    );
  } else {
    // The three things, as the page's cover art says them.
    const lines = ["Build", "Collect in the field", "Connect"];
    lines.forEach((l, i) => {
      rect(slide, { x: 9.3, y: 2.7 + i * 0.85, w: 3.3, h: 0.65 }, C.paper, C.blueLine, 0.1);
      text(
        slide,
        l,
        { x: 9.5, y: 2.7 + i * 0.85, w: 3, h: 0.65 },
        {
          fontSize: 14,
          bold: true,
          color: C.navy,
          valign: "middle",
        },
      );
    });
  }
  footer(slide, ctx);
}

function team(slide: Slide, ctx: Ctx): void {
  const { view, images } = ctx;
  const t = view.team;
  const people: Array<{
    name: string;
    role: string;
    does: string;
    side: "gocanvas" | "client";
    photo?: string | null;
  }> = [];
  if (t.lead)
    people.push({
      name: t.lead,
      role: `${t.leadCard?.title ?? "Onboarding lead"}, GoCanvas`,
      does:
        t.leadCard?.bio ??
        (view.path === "existing"
          ? "Runs both calls, reviews the form with you, watches the first real submissions through."
          : "Runs both calls, builds the first form with you, watches the first submissions."),
      side: "gocanvas",
      photo: images.leadPhoto,
    });
  if (t.accountManager && t.accountManager !== t.lead)
    people.push({
      name: t.accountManager,
      role: "Account manager, GoCanvas",
      does: "Your commercial contact from here on. Loops in when scope changes.",
      side: "gocanvas",
    });
  if (
    t.solutionsEngineer &&
    t.solutionsEngineer !== t.lead &&
    t.solutionsEngineer !== t.accountManager
  )
    people.push({
      name: t.solutionsEngineer,
      role: "Solutions engineer, GoCanvas",
      does: "Knows what was promised in the sale. Handles the integration when there is one.",
      side: "gocanvas",
    });
  people.push({
    name: t.champion?.name ?? "Your project owner",
    role: t.champion?.role ? `${t.champion.role}, ${view.clientName}` : view.clientName,
    does: roleBlurb(t.champion?.role ?? null, "champion"),
    side: "client",
  });
  let nth = 0;
  for (const o of t.others ?? []) {
    if (people.some((p) => p.name === o.name)) continue;
    people.push({
      name: o.name,
      role: o.role ? `${o.role}, ${view.clientName}` : view.clientName,
      does: o.does ?? roleBlurb(o.role ?? null, nth++ === 0 ? "other" : "other2"),
      side: "client",
    });
  }
  people.push({
    name: view.fieldTester ?? "Your field tester",
    role: `Field tester, ${view.clientName}`,
    does: "One crew, real jobs, from the field-test day. What they say is what we fix.",
    side: "client",
  });

  const area = frame(slide, ctx, {
    eyebrow: "Your team",
    title: "Small on purpose,",
    accent: "everyone has a job",
    lede: "Everyone here has a job in the next seven days.",
    band: "Two names on your side, agreed on the first call, is the difference between a plan and a wish.",
  });
  const cols = Math.min(people.length, 3);
  const rows = Math.ceil(people.length / cols);
  const gap = 0.2;
  const cw = (area.w - gap * (cols - 1)) / cols;
  const ch = Math.min(1.75, (area.h - gap * (rows - 1)) / rows);
  people.forEach((p, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const box = { x: area.x + col * (cw + gap), y: area.y + row * (ch + gap), w: cw, h: ch };
    card(slide, box, "plain");
    rect(
      slide,
      { x: box.x, y: box.y, w: 0.08, h: box.h },
      p.side === "client" ? C.navy : C.blue,
      undefined,
      0,
    );
    let tx = box.x + 0.25;
    if (p.photo) {
      slide.addImage({
        data: p.photo,
        x: box.x + 0.25,
        y: box.y + 0.2,
        w: 0.75,
        h: 0.75,
        rounding: true,
      });
      tx = box.x + 1.15;
    }
    text(
      slide,
      p.name,
      { x: tx, y: box.y + 0.18, w: box.w - (tx - box.x) - 0.2, h: 0.32 },
      {
        fontSize: 15,
        bold: true,
        color: C.navy,
      },
    );
    text(
      slide,
      p.role,
      { x: tx, y: box.y + 0.5, w: box.w - (tx - box.x) - 0.2, h: 0.28 },
      {
        fontSize: 10.5,
        color: C.muted,
      },
    );
    text(
      slide,
      p.does,
      { x: tx, y: box.y + 0.82, w: box.w - (tx - box.x) - 0.2, h: box.h - 0.95 },
      {
        fontSize: 11,
        color: C.ink,
      },
    );
  });
}

function overview(slide: Slide, ctx: Ctx): void {
  const { view } = ctx;
  const t = view.timeline;
  const live = t.milestones.find((m) => m.key === "live");
  const kickoff = t.milestones.find((m) => m.key === "kickoff");
  const working = t.milestones.find((m) => m.key === "working");
  const wk = (n: number) => `${n} wk${n === 1 ? "" : "s"}`;
  const cards = [
    {
      label: "Phase 1",
      names: [view.firstForm?.name ?? "Your first form", ...t.alongside.map((x) => x.name)].join(
        " + ",
      ),
      length: `${live?.day ?? 7} business days`,
      when: t.liveDoneOn
        ? `Live ${shortDay(t.liveDoneOn)}`
        : `${shortDay(t.closeDate)} → ${shortDay(t.liveDate)}`,
      yourTime: phaseOneTime(t, kickoff?.minutes ?? 60, working?.minutes ?? 30),
      gate: "Starts the day we begin",
      done: Boolean(t.liveDoneOn),
      now: t.currentPhase === 1,
    },
    ...t.phases.map((ph) => {
      const longest = Math.max(...ph.services.map((x) => x.weeks));
      const calls = ph.services.reduce(
        (acc, x) =>
          acc +
          x.milestones.filter((m) => m.kind === "call").reduce((a, m) => a + (m.minutes ?? 0), 0),
        0,
      );
      return {
        label: ph.label,
        names: ph.services.map((x) => x.name).join(" + "),
        length: wk(longest),
        when: ph.done
          ? `Done ${shortDay(ph.endsOn!)}`
          : `${ph.tentative ? "Earliest " : ""}${shortDay(ph.startsOn!)} → ${shortDay(ph.endsOn!)}`,
        yourTime: `${calls || 30} min on ${ph.services.length > 1 ? "kickoff calls" : "a kickoff call"} · a short review`,
        gate: ph.gate,
        done: ph.done,
        now: t.currentPhase === ph.phase && !ph.done,
      };
    }),
  ];
  const count = cards.length;
  const area = frame(slide, ctx, {
    eyebrow: "At a glance",
    title:
      count === 1
        ? "One phase,"
        : `${["", "One", "Two", "Three", "Four", "Five"][count] ?? count} phases,`,
    accent: "the form first",
    lede: "The shape of the whole project: how long, how much of your time, and where we are.",
    band: t.allDone
      ? "Every phase is live. From here the same team runs the working-session format for whatever you add."
      : `You are on ${cards.find((c) => c.now)?.label.toLowerCase() ?? "phase 1"}. Nothing after the form starts until a crew has run the form on real jobs.`,
  });
  const gap = 0.2;
  const cw = (area.w - gap * (count - 1)) / count;
  cards.forEach((c, i) => {
    const box = { x: area.x + i * (cw + gap), y: area.y, w: cw, h: area.h };
    card(slide, box, c.done ? "done" : c.now ? "now" : "plain");
    text(
      slide,
      c.label.toUpperCase(),
      { x: box.x + 0.2, y: box.y + 0.18, w: box.w - 1.6, h: 0.25 },
      {
        fontSize: 9.5,
        bold: true,
        color: C.blue,
        charSpacing: 2,
      },
    );
    text(
      slide,
      c.done ? "Done" : c.now ? "You are here" : "Later",
      { x: box.x + box.w - 1.4, y: box.y + 0.16, w: 1.2, h: 0.25 },
      {
        fontSize: 9.5,
        bold: true,
        color: c.done ? C.green : c.now ? C.blueDeep : C.muted,
        align: "right",
      },
    );
    text(
      slide,
      c.names,
      { x: box.x + 0.2, y: box.y + 0.5, w: box.w - 0.4, h: 0.8 },
      {
        fontSize: 15,
        bold: true,
        color: C.navy,
      },
    );
    const facts: Array<[string, string]> = [
      ["How long", c.length],
      ["When", c.when],
      ["Your time", c.yourTime],
      ["Opens", c.gate],
    ];
    facts.forEach(([k, v], j) => {
      const y = box.y + 1.4 + j * 0.62;
      text(
        slide,
        k.toUpperCase(),
        { x: box.x + 0.2, y, w: box.w - 0.4, h: 0.2 },
        {
          fontSize: 8.5,
          bold: true,
          color: C.muted,
          charSpacing: 1.5,
        },
      );
      text(slide, v, { x: box.x + 0.2, y: y + 0.2, w: box.w - 0.4, h: 0.4 }, { fontSize: 11 });
    });
  });
}

function plan(slide: Slide, ctx: Ctx): void {
  const { view } = ctx;
  const t = view.timeline;
  const existing = view.path === "existing";
  const days = t.milestones[t.milestones.length - 1]?.day ?? 7;
  const area = frame(slide, ctx, {
    eyebrow: "Your timeline",
    title: existing
      ? "Phase 1: your form,"
      : t.phases.length
        ? "Phase 1: seven days to a"
        : "Seven days to a",
    accent: existing ? "integration-ready" : "form in the field",
    lede: existing
      ? `A review call, a short working session, a few real jobs through it. ${["", "One", "Two", "Three", "Four", "Five", "Six", "Seven"][days] ?? days} business days, and every day below has an owner.`
      : "Two short working sessions, a little homework, one crew on real jobs. Every day below has an owner.",
    band: existing
      ? `Ready on ${shortDay(t.liveDate)}. A form optimised for the integration first is what makes the mapping right, first time.`
      : `Live on ${shortDay(t.liveDate)}. We drive the pace, and you own the form.`,
  });
  const ms = t.milestones;
  const n = ms.length;
  const gap = 0.12;
  const cw = (area.w - gap * (n - 1)) / n;
  const railY = area.y + 0.95;
  rect(slide, { x: area.x, y: railY, w: area.w, h: 0.04 }, C.blueLine, undefined, 0);
  ms.forEach((m, i) => {
    const x = area.x + i * (cw + gap);
    const isLive = m.key === "live";
    text(
      slide,
      dayLabel(m).toUpperCase(),
      { x, y: area.y, w: cw, h: 0.22 },
      {
        fontSize: 8.5,
        bold: true,
        color: C.muted,
        charSpacing: 1.5,
      },
    );
    // The node on the rail.
    slide.addShape("ellipse" as PptxGenJS.ShapeType, {
      x: x + cw / 2 - 0.17,
      y: railY - 0.15,
      w: 0.34,
      h: 0.34,
      fill: { color: m.doneOn ? C.green : isLive ? C.navy : C.blue },
      line: { color: C.paper, width: 1.5 },
    });
    text(
      slide,
      m.label,
      { x, y: railY + 0.3, w: cw, h: 0.55 },
      {
        fontSize: 11.5,
        bold: true,
        color: C.navy,
      },
    );
    text(
      slide,
      m.doneOn ? `Done ${shortDay(m.doneOn)}` : whenLabel(m, t.timezone),
      { x, y: railY + 0.85, w: cw, h: 0.3 },
      {
        fontSize: 10,
        color: m.doneOn ? C.green : C.blueDeep,
        bold: true,
      },
    );
    text(
      slide,
      `${ownerWord(m.owner)}${m.minutes ? ` · ${m.minutes} min` : ""}`,
      { x, y: railY + 1.15, w: cw, h: 0.25 },
      {
        fontSize: 9,
        color: C.muted,
      },
    );
    text(slide, m.detail, { x, y: railY + 1.42, w: cw, h: 1.1 }, { fontSize: 9.5, color: C.ink });
  });
  if (t.alongside.length) {
    const y = railY + 2.7;
    text(
      slide,
      `Alongside the form, from the kickoff call${t.alongside.length > 1 ? ` · ${t.alongside.length} at the same time` : ""}`,
      { x: area.x, y, w: area.w, h: 0.25 },
      { fontSize: 10, bold: true, color: C.navy },
    );
    const k = t.alongside.length;
    const aw = (area.w - 0.2 * (k - 1)) / k;
    t.alongside.forEach((svc, i) => {
      const box = {
        x: area.x + i * (aw + 0.2),
        y: y + 0.3,
        w: aw,
        h: Math.max(0.6, area.y + area.h - (y + 0.3)),
      };
      card(slide, box, svc.doneOn ? "done" : "soft");
      text(
        slide,
        [
          { text: svc.name, options: { bold: true, color: C.navy } },
          {
            text: ` · ${svc.label.toLowerCase()} · ${svc.doneOn ? `live ${shortDay(svc.doneOn)}` : `${shortDay(svc.startsOn)} → ${shortDay(svc.endsOn)}`}`,
            options: { color: C.muted },
          },
          { text: `\nWe need from you: ${svc.needs}`, options: { color: C.ink } },
        ],
        { x: box.x + 0.15, y: box.y + 0.1, w: box.w - 0.3, h: box.h - 0.2 },
        { fontSize: 10 },
      );
    });
  }
}

function phaseScreen(slide: Slide, ctx: Ctx, phaseNo: number): void {
  const { view } = ctx;
  const t = view.timeline;
  const ph = t.phases.find((p) => p.phase === phaseNo);
  if (!ph) {
    frame(slide, ctx, { eyebrow: "After the form", title: `Phase ${phaseNo}` });
    return;
  }
  const map = [
    {
      label: "Phase 1",
      name: [view.firstForm?.name ?? "Your first form", ...t.alongside.map((x) => x.name)].join(
        " + ",
      ),
      when: t.liveDoneOn ? `Live ${shortDay(t.liveDoneOn)}` : `Live ${shortDay(t.liveDate)}`,
      done: Boolean(t.liveDoneOn),
      now: t.currentPhase === 1,
      this: false,
    },
    ...t.phases.map((x) => ({
      label: x.label,
      name: x.services.map((y) => y.name).join(" + "),
      when: x.done
        ? `Done ${shortDay(x.endsOn!)}`
        : `${x.tentative ? "Earliest " : ""}${shortDay(x.startsOn!)} → ${shortDay(x.endsOn!)}`,
      done: x.done,
      now: t.currentPhase === x.phase && !x.done,
      this: x.phase === ph.phase,
    })),
  ];
  const names = ph.services.map((x) => x.name).join(" + ");
  const accent =
    ph.services.length > 2 || names.length > 44 ? `${ph.services.length} things at once` : names;
  const lede = ph.done
    ? `Done ${shortDay(ph.endsOn!)}. ${ph.gate}.`
    : ph.tentative
      ? `${ph.gate} — earliest ${shortDay(ph.startsOn!)}. ${ph.services.length > 1 ? "Both worked on at the same time." : "Dates are estimates until then."}`
      : `${ph.gate}, so it runs ${shortDay(ph.startsOn!)} to ${shortDay(ph.endsOn!)}.${ph.services.length > 1 ? " Both worked on at the same time." : ""}`;
  const area = frame(slide, ctx, {
    eyebrow: `After the form · ${ph.label}`,
    title: `${ph.label}:`,
    accent,
    lede,
    band:
      ph.phase === 2
        ? "The form first, always. Field mapping, PDFs and dashboards are built on real submissions, which is why they come second."
        : `${ph.label} opens with its own thirty-minute kickoff to gather the final details — the ones we cannot know until the form is real.`,
  });
  // The map across the top.
  const mw = (area.w - 0.15 * (map.length - 1)) / map.length;
  map.forEach((p, i) => {
    const box = { x: area.x + i * (mw + 0.15), y: area.y, w: mw, h: 0.85 };
    card(slide, box, p.done ? "done" : p.this ? "now" : p.now ? "soft" : "plain");
    text(
      slide,
      [
        {
          text: `${p.label.toUpperCase()}  `,
          options: { bold: true, color: C.blue, fontSize: 8.5 },
        },
        {
          text: p.now ? "You are here" : "",
          options: { bold: true, color: C.blueDeep, fontSize: 8.5 },
        },
        { text: `\n${p.name}`, options: { bold: true, color: C.navy, fontSize: 11 } },
        { text: `\n${p.when}`, options: { color: C.muted, fontSize: 9.5 } },
      ],
      { x: box.x + 0.15, y: box.y + 0.1, w: box.w - 0.3, h: box.h - 0.2 },
      { fontSize: 10 },
    );
  });
  // One card per service, with its steps.
  const top = area.y + 1.05;
  const avail = area.y + area.h - top;
  const k = ph.services.length;
  const sw = (area.w - 0.2 * (k - 1)) / k;
  ph.services.forEach((svc, i) => {
    const box = { x: area.x + i * (sw + 0.2), y: top, w: sw, h: avail };
    card(slide, box, svc.doneOn ? "done" : "plain");
    text(
      slide,
      [
        { text: svc.name, options: { bold: true, color: C.navy, fontSize: 14 } },
        {
          text: `\n${svc.label}${svc.tier ? ` · tier ${svc.tier}` : ""} · ${svc.weeks} wk${svc.weeks === 1 ? "" : "s"} · ${
            svc.doneOn
              ? `live ${shortDay(svc.doneOn)}`
              : `${ph.tentative ? "earliest " : ""}${shortDay(svc.startsOn)} → ${shortDay(svc.endsOn)}`
          }`,
          options: { color: C.muted, fontSize: 10 },
        },
      ],
      { x: box.x + 0.2, y: box.y + 0.15, w: box.w - 0.4, h: 0.65 },
      { fontSize: 12 },
    );
    const steps = svc.milestones;
    const stepH = Math.min(0.5, (box.h - 0.95) / Math.max(steps.length, 1));
    steps.forEach((m, j) => {
      const y = box.y + 0.9 + j * stepH;
      slide.addShape("ellipse" as PptxGenJS.ShapeType, {
        x: box.x + 0.25,
        y: y + 0.08,
        w: 0.16,
        h: 0.16,
        fill: { color: m.doneOn ? C.green : C.blue },
        line: { color: m.doneOn ? C.green : C.blue, width: 0 },
      });
      text(
        slide,
        [
          { text: m.label, options: { bold: true, color: C.navy } },
          {
            text: `  ${m.doneOn ? `Done ${shortDay(m.doneOn)}` : `${ph.tentative ? "≈ " : ""}${whenLabel(m, t.timezone)}`} · ${ownerWord(m.owner)}${m.minutes ? ` · ${m.minutes} min` : ""}`,
            options: { color: C.muted },
          },
        ],
        { x: box.x + 0.5, y, w: box.w - 0.7, h: stepH },
        { fontSize: 10, valign: "middle" },
      );
    });
  });
}

function together(slide: Slide, ctx: Ctx): void {
  const { view } = ctx;
  const t = view.timeline;
  const existing = view.path === "existing";
  const due = t.milestones.find((m) => m.key === "homework");
  const homework = t.milestones.find((m) => m.key === "kickoff")?.homework ?? [
    "Download the GoCanvas app and log in",
    "Add one field user who will test on a real job",
    "Send us the customer or site list to load",
  ];
  const area = frame(slide, ctx, {
    eyebrow: "What's expected",
    title: existing ? "We optimise it" : "We build it",
    accent: "with you, not for you",
    lede: existing
      ? "A form you adjusted yourself is one you will keep right — and the integration built on it stays right."
      : "A form you built yourself is one you will change yourself — and the second use case shows up on its own.",
    band: existing
      ? "Fifteen minutes of homework means the working session starts from your real form and your real output."
      : "Fifteen minutes of homework means the second session starts from a live account, not a blank one.",
  });
  const we = existing
    ? [
        "A field-by-field read of your form against what the integration needs",
        "The changes, made live on the call, with you watching every field",
        "The mapping, named the way the office system names things",
        "Someone watching the first real submissions come through",
      ]
    : [
        "A starting point from the form library, in your vocabulary",
        "The build, live on the call, with you watching every field",
        "The logic, routing and notifications the office needs",
        "Someone watching the first submissions come in",
      ];
  const you = existing
    ? [
        "The form the integration reads from, as your crews run it today",
        "One example of the output the office needs on the other side",
        "Who owns the field mapping on your side, by name",
        "The last changes, made by you, in the working session",
      ]
    : [
        "How the job actually runs — the process, not the org chart",
        "One field user willing to try it on real work",
        "The customer or site list, so nothing is typed twice",
        "The last changes, made by you, in the working session",
      ];
  const colW = (area.w - 0.25) / 2;
  const colH = 2.15;
  [
    ["We bring", we],
    ["You bring", you],
  ].forEach(([head, items], i) => {
    const box = { x: area.x + i * (colW + 0.25), y: area.y, w: colW, h: colH };
    card(slide, box, "plain");
    text(
      slide,
      head as string,
      { x: box.x + 0.2, y: box.y + 0.15, w: box.w - 0.4, h: 0.3 },
      {
        fontSize: 14,
        bold: true,
        color: C.navy,
      },
    );
    text(
      slide,
      (items as string[]).map((s, j) => ({
        text: s,
        options: { bullet: { code: "2713" }, breakLine: j < (items as string[]).length - 1 },
      })),
      { x: box.x + 0.2, y: box.y + 0.5, w: box.w - 0.4, h: box.h - 0.6 },
      { fontSize: 11, paraSpaceAfter: 4 },
    );
  });
  // Homework.
  const hy = area.y + colH + 0.2;
  const hh = area.y + area.h - hy;
  rect(slide, { x: area.x, y: hy, w: area.w, h: hh }, C.blueSoft, C.blueLine, 0.1);
  text(
    slide,
    `Your homework before the working session${due ? ` · due ${shortDay(due.date)}` : ""}`,
    { x: area.x + 0.2, y: hy + 0.12, w: area.w - 0.4, h: 0.28 },
    { fontSize: 11.5, bold: true, color: C.navy },
  );
  const hw = (area.w - 0.4 - 0.2 * 2) / 3;
  homework.slice(0, 3).forEach((h, i) => {
    const box = { x: area.x + 0.2 + i * (hw + 0.2), y: hy + 0.45, w: hw, h: 0.5 };
    rect(slide, box, C.paper, C.blueLine, 0.08);
    slide.addShape("rect" as PptxGenJS.ShapeType, {
      x: box.x + 0.12,
      y: box.y + 0.14,
      w: 0.22,
      h: 0.22,
      fill: {
        color: view.homeworkDone[(["app", "user", "list"] as const)[i]!] ? C.green : C.paper,
      },
      line: { color: C.blue, width: 1 },
    });
    text(
      slide,
      h,
      { x: box.x + 0.45, y: box.y, w: box.w - 0.55, h: box.h },
      {
        fontSize: 10.5,
        valign: "middle",
      },
    );
  });
  const extras = t.alongside.map(
    (svc) => `For ${svc.name}: ${svc.needs}${needTiming(svc, due?.date ?? null)}`,
  );
  const appLine = `Get the GoCanvas app: ${GOCANVAS_APP.any}`;
  text(
    slide,
    [...extras, appLine].join("\n"),
    { x: area.x + 0.2, y: hy + 1.05, w: area.w - 0.4, h: Math.max(0.3, hh - 1.15) },
    {
      fontSize: 10,
      color: C.ink,
    },
  );
}

function firstForm(slide: Slide, ctx: Ctx): void {
  const { view } = ctx;
  const t = view.timeline;
  const at = (key: string) => t.milestones.find((m) => m.key === key);
  const existing = view.path === "existing";
  const phase2 = t.phases[0] ?? null;
  const live = shortDay(t.liveDate);
  const lastDay = t.milestones[t.milestones.length - 1]?.day ?? 7;
  const today =
    view.currentProcess ??
    (existing
      ? "The form works in the field, but the office still retypes what it collects into the other system."
      : view.path === "dm_conversion"
        ? "The crew runs your forms in Device Magic today; the office works from what it sends. Same jobs, same forms — moved over one at a time, starting with the one they use most."
        : "Paper on the truck, photos on somebody's phone, and the office retyping it all at the end of the week.");
  const quoted = Boolean(view.currentProcess) && view.currentProcessSource === "person";
  const area = frame(slide, ctx, {
    eyebrow: "How we get there",
    title: "From today to",
    accent: existing
      ? `day ${["", "one", "two", "three", "four", "five", "six", "seven"][lastDay] ?? lastDay}`
      : "day seven",
    band: existing
      ? "Optimised before anything is connected to it. That is what makes the mapping right, first time."
      : "Proven in the field before anything is connected to it. That is what makes the mapping right later.",
  });
  const colW = (area.w - 0.5) / 3;
  const cols: Array<{
    tag: string | null;
    head: string;
    body: string;
    list: string[];
    tone: "plain" | "now" | "soft";
  }> = [
    {
      tag: null,
      head: "How it runs now",
      body: quoted ? `“${today}”` : today,
      list: existing
        ? ["Retyped into the office system", "Fields named two ways", "Nothing connected"]
        : ["Retyped", "Late", "No photos, no signature"],
      tone: "plain",
    },
    {
      tag: `Day ${lastDay} · ${live}`,
      head: `${view.firstForm?.name ?? "Your first form"}${existing ? ", ready for the integration" : " in the field"}`,
      body:
        (existing
          ? `Reviewed together ${at("kickoff") ? shortDay(at("kickoff")!.date) : "on the review call"}, adjusted by your hands ${at("working") ? shortDay(at("working")!.date) : "in the working session"}, run on real jobs by ${view.fieldTester ?? "your crew"}.`
          : `Built live ${at("kickoff") ? shortDay(at("kickoff")!.date) : "on the kickoff"}, finished by your hands ${at("working") ? shortDay(at("working")!.date) : "in the working session"}, proven by ${view.fieldTester ?? "your field tester"} on real jobs.`) +
        (t.alongside.length ? ` Alongside it: ${t.alongside.map((x) => x.name).join(" + ")}.` : ""),
      list: existing
        ? [
            "Every field the integration needs",
            "Named the way the office system names them",
            "Proven on real submissions",
          ]
        : ["Same day in the office", "Photos and a signature on every one", "Nothing retyped"],
      tone: "now",
    },
    {
      tag: phase2 ? "After the form" : "Then",
      head: phase2 ? "Connected to the office" : "The next forms, built by you",
      body: phase2
        ? `Once the form is proven on real jobs, the rest of your order builds on it — ${t.phases.length === 1 ? "phase 2, on its own screen" : `phases 2 to ${t.phases[t.phases.length - 1]!.phase}, each on its own screen`}.`
        : view.nextUseCases.length
          ? `${view.nextUseCases.map((n) => n.name).join(" · ")}. Same team, same working-session format, whenever you are ready.`
          : "We pick them together once the first form is in the field.",
      list: [],
      tone: "soft",
    },
  ];
  cols.forEach((c, i) => {
    const box = { x: area.x + i * (colW + 0.25), y: area.y, w: colW, h: area.h };
    card(slide, box, c.tone);
    let y = box.y + 0.2;
    if (c.tag) {
      text(
        slide,
        c.tag.toUpperCase(),
        { x: box.x + 0.2, y, w: box.w - 0.4, h: 0.22 },
        {
          fontSize: 8.5,
          bold: true,
          color: C.blue,
          charSpacing: 1.5,
        },
      );
      y += 0.28;
    }
    text(
      slide,
      c.head,
      { x: box.x + 0.2, y, w: box.w - 0.4, h: 0.6 },
      { fontSize: 15, bold: true, color: C.navy },
    );
    y += 0.7;
    text(
      slide,
      c.body,
      { x: box.x + 0.2, y, w: box.w - 0.4, h: 1.6 },
      {
        fontSize: 11,
        color: C.ink,
        italic: i === 0 && quoted,
      },
    );
    y += 1.7;
    if (c.list.length) {
      text(
        slide,
        c.list.map((s, j) => ({
          text: s,
          options: {
            bullet: { code: i === 0 ? "2022" : "2713" },
            breakLine: j < c.list.length - 1,
          },
        })),
        { x: box.x + 0.2, y, w: box.w - 0.4, h: box.h - (y - box.y) - 0.2 },
        { fontSize: 10.5, color: i === 0 ? C.muted : C.ink, paraSpaceAfter: 3 },
      );
    }
    if (i < cols.length - 1) {
      text(
        slide,
        "→",
        { x: box.x + box.w, y: box.y + box.h / 2 - 0.2, w: 0.25, h: 0.4 },
        {
          fontSize: 18,
          color: C.blue,
          align: "center",
          valign: "middle",
        },
      );
    }
  });
}

function business(slide: Slide, ctx: Ctx): void {
  const { view, images } = ctx;
  const t = view.timeline;
  const planEnd = t.phases.length ? (t.phases[t.phases.length - 1]?.endsOn ?? null) : null;
  const kickoff = t.milestones.find((m) => m.key === "kickoff");
  const working = t.milestones.find((m) => m.key === "working");
  const next = view.nextUseCases.slice(0, 3);
  const area = frame(slide, ctx, {
    eyebrow: "Let's get into business",
    title: "Two calls, then",
    accent: "it's yours",
    band: planEnd
      ? `${view.path === "existing" ? "Form ready" : "First form live"} on ${shortDay(t.liveDate)}; everything in your plan live by ${shortDay(planEnd)}. If any of the three on the right is not true that day, we are not done — and we say so.`
      : `${view.path === "existing" ? "Ready" : "Live"} on ${shortDay(t.liveDate)}. If any of the three on the right is not true that day, we are not done — and we say so.`,
  });
  const leftW = area.w * 0.55;
  const rightX = area.x + leftW + 0.3;
  const rightW = area.w - leftW - 0.3;
  const calls = [
    {
      when: `${kickoff ? whenLabel(kickoff, t.timezone) : "Day 1"} · ${kickoff?.minutes ?? 60} min`,
      head: kickoff?.label ?? "Kickoff call",
      body:
        view.path === "existing"
          ? "Walk the form the integration reads from, field by field, and decide together what it needs. You leave with three homework items."
          : "Meet, agree how we work, and build the first form live on the call. You leave with three homework items.",
    },
    {
      when: `${working ? whenLabel(working, t.timezone) : "Day 3"} · ${working?.minutes ?? 30} min`,
      head: working?.label ?? "Working session",
      body:
        view.path === "existing"
          ? "Your hands on the keyboard. The fields the integration needs, named the way the other system names them, then a few real jobs through it."
          : "Your hands on the keyboard. Finish the form, add the logic and notifications, hand it to the field tester.",
    },
  ];
  calls.forEach((c, i) => {
    const box = { x: area.x, y: area.y + i * 1.5, w: leftW, h: 1.35 };
    card(slide, box, "plain");
    text(
      slide,
      [
        {
          text: c.when.toUpperCase(),
          options: { bold: true, color: C.blue, fontSize: 8.5, breakLine: true },
        },
        { text: c.head, options: { bold: true, color: C.navy, fontSize: 15, breakLine: true } },
        { text: c.body, options: { color: C.ink, fontSize: 11 } },
      ],
      { x: box.x + 0.2, y: box.y + 0.15, w: box.w - 0.4, h: box.h - 0.3 },
      { fontSize: 11 },
    );
  });
  const afterY = area.y + 3.05;
  text(
    slide,
    [
      {
        text: t.phases.length
          ? `After the form: ${t.phases.length === 1 ? "phase 2" : `phases 2 to ${t.phases[t.phases.length - 1]!.phase}`}, on ${t.phases.length === 1 ? "its" : "their"} own screen${t.phases.length === 1 ? "" : "s"}`
          : "Then, the next ones — built by you",
        options: { bold: true, color: C.navy, breakLine: true },
      },
      {
        text: t.phases.length
          ? "Each one opens with a thirty-minute kickoff to gather the final details. The form first, always — nothing there starts until a crew has run it on real jobs."
          : next.length
            ? next.map((n) => n.name).join(" · ")
            : "We pick these together once the first form is in the field.",
        options: { color: C.ink },
      },
    ],
    { x: area.x, y: afterY, w: leftW, h: area.y + area.h - afterY },
    { fontSize: 11 },
  );
  // What good looks like.
  const box = { x: rightX, y: area.y, w: rightW, h: area.h };
  card(slide, box, "soft");
  text(
    slide,
    `What good looks like on ${shortDay(t.liveDate)}`.toUpperCase(),
    { x: box.x + 0.2, y: box.y + 0.18, w: box.w - 0.4, h: 0.22 },
    {
      fontSize: 8.5,
      bold: true,
      color: C.blue,
      charSpacing: 1.5,
    },
  );
  let y = box.y + 0.5;
  if (view.team.lead) {
    if (images.leadPhoto) {
      slide.addImage({
        data: images.leadPhoto,
        x: box.x + 0.2,
        y,
        w: 0.45,
        h: 0.45,
        rounding: true,
      });
    }
    const tx = images.leadPhoto ? box.x + 0.75 : box.x + 0.2;
    const contact = [
      view.team.leadEmail,
      view.team.leadCard?.bookingUrl
        ? `Book time with ${firstName(view.team.lead)}: ${view.team.leadCard.bookingUrl}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
    text(
      slide,
      [
        {
          text: `${view.team.lead}, your ${view.team.leadCard?.title?.toLowerCase() ?? "onboarding lead"}`,
          options: { bold: true, color: C.navy, breakLine: Boolean(contact) },
        },
        ...(contact ? [{ text: contact, options: { color: C.blueDeep } }] : []),
      ],
      { x: tx, y, w: box.w - (tx - box.x) - 0.2, h: 0.6 },
      { fontSize: 10.5 },
    );
    y += 0.7;
  }
  const ticks = [
    "Your crew submits from the phone, on the job, with photos and a signature.",
    "The office sees the work as it happens — no retyping, no Friday pile.",
    "The crew asked for a change, and it was made the same day.",
  ];
  text(
    slide,
    ticks.map((s, j) => ({
      text: s,
      options: { bullet: { code: "2713" }, breakLine: j < ticks.length - 1 },
    })),
    { x: box.x + 0.2, y, w: box.w - 0.4, h: 1.7 },
    { fontSize: 11.5, paraSpaceAfter: 6 },
  );
  y += 1.85;
  rect(
    slide,
    { x: box.x + 0.2, y, w: box.w - 0.4, h: box.y + box.h - y - 0.2 },
    C.paper,
    C.blueLine,
    0.08,
  );
  text(
    slide,
    [
      {
        text: "YOUR NEXT STEP",
        options: { bold: true, color: C.blue, fontSize: 8.5, breakLine: true },
      },
      {
        text: `Accept the ${view.path === "existing" ? "review call" : "kickoff"} invite for ${kickoff ? shortDay(kickoff.date) : "day one"} and download the app.`,
        options: { color: C.ink, breakLine: true },
      },
      {
        text: `App Store · Google Play · ${GOCANVAS_APP.any}`,
        options: { color: C.blueDeep, fontSize: 9.5 },
      },
    ],
    { x: box.x + 0.35, y: y + 0.12, w: box.w - 0.7, h: box.y + box.h - y - 0.4 },
    { fontSize: 11 },
  );
}

/* ------------------------------------------------------------ pictures */

/** A picture as a data URL the deck can embed; null when it cannot be fetched. */
async function asDataUrl(url: string): Promise<string | null> {
  if (url.startsWith("data:")) return url;
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("unreadable"));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
