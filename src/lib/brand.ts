/**
 * The GoCanvas design system, taken from the real thing.
 *
 * WHERE THESE COME FROM. Every value below was read out of the 2026 QBR deck
 * template's content streams — the fill colours actually used on its slides,
 * and its embedded wordmark. Not sampled from a screenshot, not eyeballed: the
 * PDF operators. The previous `src/lib/server/brief/brand.ts` guessed a green
 * palette with a comment saying to swap it "when marketing supplies official
 * assets". They have; the brand is navy and cyan, and was never green.
 *
 * WHAT THIS IS FOR. Documents that leave the building — the kickoff deck, the
 * plan PDF a customer opens, the completion record filed against a Salesforce
 * account. It is deliberately NOT the app's own stylesheet: the internal UI
 * still runs on its own tokens in `src/styles.css`, and repainting it is a
 * separate pass with its own contrast work. Two systems for now, honestly
 * separate, rather than one that is half-converted everywhere.
 *
 * Hex WITHOUT the leading `#`, because pptxgenjs wants it that way and jsPDF
 * takes numeric channels. Both are provided rather than making each call site
 * do the conversion and get it subtly wrong.
 */

export const BRAND = {
  /** The deepest field. Title slides and section dividers sit on this. */
  ink: "031736",
  /** The primary. Headings, rules, table headers. */
  navy: "00305E",
  /** The accent, and the only bright colour in the system. Used sparingly. */
  cyan: "039DE7",
  /** The mid blue that appears in the template's link and chart work. */
  blue: "0E51C4",
  /** Secondary text. Warm, not a cold grey — that is deliberate in the source. */
  grey: "757070",
  /** A light rule that reads on white without becoming a box. */
  line: "D8DEE6",
  paper: "FFFFFF",
  /** The near-white the template uses for panel fills. */
  panel: "FDFDFD",

  /**
   * The blue gradient the template runs behind hero art, darkest first. Kept as
   * a list rather than a CSS string so a renderer can pick the two stops it can
   * actually draw.
   */
  gradient: ["002C5F", "0073B9", "009EEA", "00C2F1"],

  /**
   * Arial throughout, which is what the template embeds. Not a nicer choice —
   * the correct one: a deck an AE opens in PowerPoint and edits must not
   * re-flow because the font it was built with is not installed.
   */
  fontHead: "Arial",
  fontBody: "Arial",
} as const;

/** Repo-relative paths to the official assets, extracted from the same template. */
export const BRAND_ASSETS = {
  /** White letterforms, cyan mark. For `ink` and `navy` grounds only. */
  wordmarkWhite: "public/branding/gocanvas-wordmark-white.png",
  /** Navy letterforms, cyan mark. For white and `panel` grounds. */
  wordmarkNavy: "public/branding/gocanvas-wordmark-navy.png",
  /** The mark alone, for footers and anywhere the wordmark would not be legible. */
  mark: "public/branding/gocanvas-mark.png",
} as const;

/** `031736` → `#031736`, for anything that wants CSS. */
export function hex(value: string): string {
  return `#${value}`;
}

/** `031736` → `[3, 23, 54]`, for jsPDF's setTextColor / setDrawColor / setFillColor. */
export function rgb(value: string): [number, number, number] {
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

/**
 * The footer line every outward-facing document carries, matching the
 * template's own. The year is the document's, not today's — a deck reprinted
 * next January should not silently claim to be a 2027 document.
 */
export function copyrightLine(at: Date | string = new Date()): string {
  const year = (typeof at === "string" ? new Date(at) : at).getUTCFullYear();
  return `© ${year} GoCanvas`;
}
