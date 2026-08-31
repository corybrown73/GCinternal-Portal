import { BRAND, copyrightLine, rgb } from "@/lib/brand";

import { WORDMARK_WHITE } from "./brand-assets";

/**
 * The GoCanvas document system, once.
 *
 * ISOMORPHIC ON PURPOSE, and therefore not under `server/`. Three of the four
 * documents are rendered in Node; the SOW analysis is built in the browser and
 * never touches a server. One design system means one module both can import —
 * jsPDF and the wordmarks are loaded at the call site, so a page that never
 * exports a PDF pays nothing for it.
 *
 * WHY THIS EXISTS. Four PDFs leave this app — the weekly snapshot, the
 * customer's plan, the completion record, and the SOW analysis — and each one
 * had grown its own private idea of a heading, a rule and a footer. "Use the
 * design system for all PDF output" cannot mean four files that each hard-code
 * the same navy; the first one somebody forgets to update is the one a
 * customer opens.
 *
 * So the system is here and the documents only say what they contain. A
 * renderer that wants a different heading size does not get one.
 *
 * WHAT THE SYSTEM IS, taken from the 2026 template (see `src/lib/brand.ts`):
 *  - A navy `ink` masthead with the white wordmark, and the document's subject
 *    set in white on it.
 *  - Navy section headings, each with ONE short cyan rule under it. Cyan
 *    appears nowhere else; it is the only bright colour in the palette and it
 *    stops meaning anything if it is used for decoration.
 *  - Body text in near-black, secondary text in the template's warm grey.
 *  - `© <year> GoCanvas` bottom-right of every page, dated to the document.
 *
 * TWO THINGS LEARNED BY RENDERING AND LOOKING, both encoded here so no
 * document has to rediscover them:
 *  - jsPDF's built-in Helvetica is WinAnsi. `☐` and `☑` render as `&`. Use
 *    `MARKS`.
 *  - A rule positioned from the cursor AFTER writing a heading lands on the
 *    text underneath; positioned too close to the baseline it strikes through
 *    the heading's own descenders. It is drawn from the heading's baseline,
 *    ten points down.
 */

/** Checkbox marks the built-in font can actually draw. */
export const MARKS = { open: "[ ]", done: "[x]" } as const;

/**
 * Everything cp1252 (WinAnsi) can represent: Latin-1 minus the C1 block, plus
 * the twenty-seven characters Windows put in 0x80-0x9F.
 */
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

/**
 * Characters people really type that WinAnsi has no slot for, and what to put
 * instead. An arrow is the one that matters: "Dispatch → ERP sync" is how an
 * engineer names an integration, and it came out of the first build as
 * "Dispatch !' ERP sync" in a document filed against a customer's account.
 */
const SUBSTITUTIONS: Array<[RegExp, string]> = [
  [/[\u2192\u21D2\u27A1\u2794]/g, "->"],
  [/[\u2190\u21D0]/g, "<-"],
  [/[\u2194\u21D4]/g, "<->"],
  [/[\u2713\u2714\u2705]/g, "[x]"],
  [/[\u2717\u2718\u274C]/g, "x"],
  [/[\u2610]/g, "[ ]"],
  [/[\u2611\u2612]/g, "[x]"],
  [/\u2265/g, ">="],
  [/\u2264/g, "<="],
  [/\u2260/g, "!="],
  [/\u00D7/g, "x"],
  [/[\u2500-\u257F]/g, "-"],
  // Anything else non-Latin — an emoji, a CJK character — becomes a space
  // rather than mojibake. A gap reads as "something was here"; "!'" reads as
  // a bug in the document.
];

/**
 * Make a string safe for jsPDF's built-in Helvetica.
 *
 * WHY THIS IS NOT OPTIONAL. Every document here renders free text a person
 * typed: solution titles, risk mitigations, a customer's own task names. The
 * built-in fonts are WinAnsi-encoded, and jsPDF does not fail on an
 * unrepresentable character — it emits whatever byte falls out, so the failure
 * only ever shows up in the finished PDF. Embedding a Unicode font instead
 * would cost ~400 kB in every serverless bundle for a handful of arrows.
 *
 * Exported so it can be tested directly; every write in this module goes
 * through it.
 */
export function winAnsi(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SUBSTITUTIONS) out = out.replace(pattern, replacement);
  return Array.from(out)
    .map((ch) => {
      const code = ch.codePointAt(0)!;
      if (code === 9 || code === 10 || code === 13) return ch;
      if (code >= 0x20 && code <= 0x7e) return ch;
      if (code >= 0xa0 && code <= 0xff) return ch;
      if (WIN_ANSI_EXTRA.includes(ch)) return ch;
      return " ";
    })
    .join("")
    .replace(/ {2,}/g, " ");
}

export type BrandedPdf = {
  /** A block of body text. Wraps, paginates, and returns nothing. */
  line: (text: string, opts?: LineOptions) => void;
  /** A heading with the cyan rule, and an optional italic note under it. */
  section: (heading: string, note?: string) => void;
  /** A label/value list — the "at a glance" block, not a table. */
  pairs: (items: Array<[string, string]>) => void;
  /**
   * A panel stating that something was not recorded. Deliberately unlike body
   * text: an absence must not read as an answer.
   */
  absent: (note: string) => void;
  /** Vertical space, in points. */
  gap: (points: number) => void;
  /** Footer the last page and return the bytes. */
  finish: () => Uint8Array;
};

export type LineOptions = {
  size?: number;
  style?: "normal" | "bold" | "italic";
  /** A `BRAND` token, or a six-digit hex without the hash. */
  color?: string;
  /** Baseline-to-baseline distance. Defaults to a readable multiple of `size`. */
  gap?: number;
  indent?: number;
};

export type MastheadOptions = {
  /** The big line: whose document this is. */
  title: string;
  /** Under it: what the document is. */
  subtitle?: string | null;
  /** One line of facts, already joined by the caller. */
  meta?: string | null;
  /**
   * Dates the `© year` footer. The document's own moment, never today's — a
   * completion record reprinted next January must not claim to be a 2027
   * document.
   */
  dateFor: string | Date;
  /** Bottom-left of every page. For a document that gets printed and handed round. */
  footerLeft?: string | null;
  /**
   * Stamp "Page n of N". Only worth it on a long document — the total is not
   * known until the last page, so this costs a second pass at `finish()`.
   */
  pageNumbers?: boolean;
};

/** Near-black. Not `ink`, which is the navy the masthead is painted in. */
const BODY = "1B2534";
const BODY_SOFT = "3C4757";

export async function openBrandedPdf(options: MastheadOptions): Promise<BrandedPdf> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 54;
  const width = pageW - margin * 2;
  const floor = pageH - margin - 18;
  let y = margin;

  const setText = (value: string) => {
    const [r, g, b] = rgb(value);
    doc.setTextColor(r, g, b);
  };

  const footer = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setText(BRAND.fg2);
    doc.text(copyrightLine(options.dateFor), pageW - margin, pageH - 30, { align: "right" });
    if (options.footerLeft) doc.text(winAnsi(options.footerLeft), margin, pageH - 30);
  };

  const room = (needed: number) => {
    if (y + needed > floor) {
      footer();
      doc.addPage();
      y = margin;
    }
  };

  const line: BrandedPdf["line"] = (text, opts = {}) => {
    const size = opts.size ?? 10;
    const gap = opts.gap ?? Math.round(size * 1.3);
    const indent = opts.indent ?? 0;
    doc.setFont("helvetica", opts.style ?? "normal");
    doc.setFontSize(size);
    setText(opts.color ?? BODY);
    for (const part of doc.splitTextToSize(winAnsi(text), width - indent) as string[]) {
      room(gap);
      doc.text(part, margin + indent, y);
      y += gap;
    }
  };

  /* -------------------------------------------------------------- masthead */

  const [ir, ig, ib] = rgb(BRAND.navy950);
  doc.setFillColor(ir, ig, ib);
  doc.rect(0, 0, pageW, options.meta ? 132 : 112, "F");
  doc.addImage(WORDMARK_WHITE, "PNG", pageW - margin - 78, 30, 78, 15);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text(doc.splitTextToSize(winAnsi(options.title), width - 96)[0] as string, margin, 62);
  if (options.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    setText("A9B6C7");
    doc.text(winAnsi(options.subtitle), margin, 84);
  }
  if (options.meta) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    setText("A9B6C7");
    doc.text(winAnsi(options.meta), margin, options.subtitle ? 104 : 84);
  }
  y = (options.meta ? 132 : 112) + 30;

  return {
    line,

    section(heading, note) {
      room(58);
      y += 8;
      const baseline = y;
      line(heading, { size: 13.5, style: "bold", color: BRAND.navy900, gap: 17 });
      const [cr, cg, cb] = rgb(BRAND.blue500);
      doc.setDrawColor(cr, cg, cb);
      doc.setLineWidth(2);
      doc.line(margin, baseline + 10, margin + 34, baseline + 10);
      doc.setLineWidth(0.5);
      y += 9;
      if (note) line(note, { size: 9, style: "italic", color: BRAND.fg2, gap: 12 });
      y += 3;
    },

    pairs(items) {
      for (const [label, value] of items) {
        room(15);
        const at = y;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        setText(BRAND.fg2);
        doc.text(winAnsi(label), margin, at);
        doc.setFontSize(10);
        setText(BODY);
        // The value column wraps on its own; the label never does, so a long
        // value pushes the cursor and a short one does not.
        const parts = doc.splitTextToSize(winAnsi(value), width - 150) as string[];
        parts.forEach((part, i) => {
          if (i > 0) room(13);
          doc.text(part, margin + 150, i === 0 ? at : y);
          if (i > 0) y += 13;
        });
        y = Math.max(y, at) + 15;
      }
    },

    absent(note) {
      room(46);
      const top = y - 10;
      const [pr, pg, pb] = rgb("F2F5F8");
      const [lr, lg, lb] = rgb(BRAND.border);
      const height = (doc.splitTextToSize(winAnsi(note), width - 24) as string[]).length * 12 + 16;
      doc.setFillColor(pr, pg, pb);
      doc.setDrawColor(lr, lg, lb);
      doc.rect(margin, top, width, height, "FD");
      y = top + 15;
      line(note, { size: 9.5, style: "italic", color: BRAND.navy900, gap: 12, indent: 12 });
      y = top + height + 10;
    },

    gap(points) {
      y += points;
    },

    finish() {
      footer();
      if (options.pageNumbers) {
        // Second pass: the total is not knowable until the document is done.
        const pages = doc.getNumberOfPages();
        for (let i = 1; i <= pages; i += 1) {
          doc.setPage(i);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          setText(BRAND.fg2);
          doc.text(`Page ${i} of ${pages}`, pageW / 2, pageH - 30, { align: "center" });
        }
      }
      return new Uint8Array(doc.output("arraybuffer"));
    },
  };
}

export const PDF_BODY = BODY;
export const PDF_BODY_SOFT = BODY_SOFT;
