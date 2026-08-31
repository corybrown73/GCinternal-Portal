/**
 * The GoCanvas design system, from the source of truth.
 *
 * WHERE THESE COME FROM. `colors_and_type.css` in the Client Kickoff Deck
 * Template — the design project itself, not a reading of a rendered PDF. An
 * earlier version of this file took its values out of the 2026 QBR deck's
 * content streams, which got the two headline colours right and the rest
 * wrong: the neutrals there are warm, and the real system's are cool-leaning
 * on purpose ("to match corporate vibe"). Names below match the CSS custom
 * properties one-to-one, so a change there is a findable change here.
 *
 * WHAT THIS IS FOR. Everything the app renders that is not the app: the
 * kickoff deck, the plan PDF a customer opens, the completion record filed
 * against a Salesforce account. It is deliberately NOT the app's own
 * stylesheet — the internal UI still runs on its own tokens in
 * `src/styles.css`, and repainting it is a separate pass with its own contrast
 * work. Two systems for now, honestly separate, rather than one that is
 * half-converted everywhere.
 *
 * Hex WITHOUT the leading `#`, because pptxgenjs wants it that way; `hex()`
 * and `rgb()` convert for CSS and jsPDF.
 */

export const BRAND = {
  /* -------- Core palette. Deep navy is the hero, brand blue is the accent. */
  /** Deepest navy — the far corner of the hero gradient. */
  navy950: "041633",
  /** Primary dark. Headings on light. */
  navy900: "072B57",
  /** Body navy. */
  navy800: "0B3A78",
  /** Gradient mid. */
  navy700: "12509B",
  /** Gradient top — the bright end. */
  navy600: "1B5FBE",
  /** The official GoCanvas brand blue. */
  blue500: "039DE7",
  blue400: "29B1F0",
  /** The tint that carries accent text on a navy ground. */
  blue300: "6FD2FF",
  blue100: "D6EFFB",
  blue050: "EEF7FD",

  /* -------- Neutrals. Cool-leaning, deliberately. */
  ink900: "0A1628",
  ink700: "2B3849",
  ink500: "556477",
  ink400: "6B7A90",
  ink300: "9AA7BA",
  ink200: "C5CEDB",
  ink100: "E4E9F1",
  ink050: "F3F5F9",
  white: "FFFFFF",

  /* -------- Semantic. */
  success: "1DA25C",
  warning: "E8A53C",
  danger: "D94A3D",
  /** Hard-hat / SiteDocs yellow. */
  safetyYellow: "F5C21B",

  /* -------- Foreground roles. Use these in documents, not the raw palette. */
  /** Primary text on light. */
  fg1: "072B57",
  /** Secondary text on light. */
  fg2: "556477",
  /** Tertiary and captions. */
  fg3: "6B7A90",
  fgAccent: "039DE7",
  fgOnDark1: "FFFFFF",
  fgOnDark2: "6FD2FF",
  fgOnDark3: "AFC1D8",

  /* -------- Surfaces. */
  surface: "FFFFFF",
  surfaceMuted: "F3F5F9",
  surfaceDark: "072B57",
  surfaceDark2: "041633",
  border: "E4E9F1",
  borderStrong: "C5CEDB",

  /**
   * The signature slide background, top-left bright blue to bottom-right deep
   * navy. Kept as ordered stops rather than a CSS string so a renderer that
   * can only draw two of them still draws the right two.
   */
  heroGradient: ["1B5FBE", "0B3A78", "041633"],

  /**
   * Inter, as the design system specifies. Its own fallback chain is
   * 'Segoe UI', system-ui, -apple-system, Arial — so a machine without Inter
   * lands somewhere sane rather than on a serif.
   *
   * The PDFs do NOT use this: jsPDF's built-in faces are Helvetica, and
   * embedding Inter would put ~400 kB into every serverless bundle to change
   * the shape of a letter. The deck, which is a design artefact people
   * present, does.
   */
  fontSans: "Inter",
  fontSansFallback: "Arial",
} as const;

/**
 * The 8-point spacing scale, at the template's own 1920×1080 canvas size.
 * Renderers scale it; see `PX_TO_PT`.
 */
export const SPACE = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 24,
  s6: 32,
  s7: 48,
  s8: 64,
  s9: 96,
} as const;

/**
 * The type scale, in the template's pixels on a 1920×1080 canvas.
 * `pt()` converts to the points pptxgenjs and jsPDF measure in.
 */
export const TYPE = {
  eyebrow: 14,
  bodySm: 16,
  body: 18,
  bodyLg: 22,
  h5: 24,
  h4: 32,
  h3: 44,
  h2: 60,
  /** Slide hero. */
  h1: 84,
  /** Stat numbers. */
  mega: 128,
} as const;

/**
 * The template is built to a 1920 px wide canvas; a 16:9 slide is 720 pt wide.
 * Every size in the source can therefore be carried across by one factor
 * instead of being re-eyeballed per slide.
 */
export const PX_TO_PT = 720 / 1920;

/** A pixel measurement from the design, in points. */
export function pt(px: number): number {
  return Math.round(px * PX_TO_PT * 100) / 100;
}

/** Repo-relative paths to the official assets. */
export const BRAND_ASSETS = {
  /** White letterforms, cyan mark. For navy grounds only. */
  wordmarkWhite: "public/branding/gocanvas-wordmark-white.png",
  /** Navy letterforms, cyan mark. For white and muted grounds. */
  wordmarkNavy: "public/branding/gocanvas-wordmark-navy.png",
  /** The mark alone, for footers and tight placements. */
  mark: "public/branding/gocanvas-mark.png",
} as const;

/** `072B57` → `#072B57`, for anything that wants CSS. */
export function hex(value: string): string {
  return `#${value}`;
}

/** `072B57` → `[7, 43, 87]`, for jsPDF's setTextColor / setDrawColor / setFillColor. */
export function rgb(value: string): [number, number, number] {
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

/**
 * The footer line every outward-facing document carries. The year is the
 * document's, not today's — a deck reprinted next January should not silently
 * claim to be a 2027 document.
 */
export function copyrightLine(at: Date | string = new Date()): string {
  const year = (typeof at === "string" ? new Date(at) : at).getUTCFullYear();
  return `© ${year} GoCanvas`;
}
