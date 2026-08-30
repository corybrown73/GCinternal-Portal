/**
 * How this deployment looks: its name, its mark, and the colour of the nav.
 *
 * WHY PRESETS AND NOT A COLOUR PICKER. A free hex field guarantees that
 * somebody eventually picks a sidebar colour that their own team cannot read.
 * Contrast is not a matter of taste, and the person choosing a brand colour on
 * a bright monitor is not the person who has to read the nav all day. Each
 * preset below is a matched set — surface, text, muted text, active item and
 * border — checked to stay legible together, so "custom" cannot become
 * "unusable".
 *
 * If a specific brand colour is genuinely needed later, the honest way to add
 * it is another entry here, not a field that accepts anything.
 */

export type NavScheme = {
  key: string;
  /** What it is called in the picker. */
  name: string;
  /** A one-line description of the feel, for the picker. */
  note: string;
  /** CSS custom properties applied to the sidebar element only. */
  vars: Record<string, string>;
  /** True when the scheme is dark, so the logo can be given a light backing. */
  dark: boolean;
};

/**
 * Every scheme sets the same five variables, so the sidebar's markup never has
 * to know which one is active.
 */
export const NAV_SCHEMES: NavScheme[] = [
  {
    key: "default",
    name: "Paper",
    note: "The default. Quiet grey, lets the content carry the colour.",
    dark: false,
    vars: {
      // Follows the surface ramp in styles.css. When the page background moved
      // down to 0.945 the old 0.972 nav stopped reading as a separate surface
      // and started reading as a slightly wrong-coloured page.
      "--nav-bg": "oklch(0.925 0.005 250)",
      "--nav-fg": "oklch(0.2 0.014 250)",
      "--nav-muted": "oklch(0.46 0.014 250)",
      "--nav-active": "oklch(0.87 0.009 250)",
      "--nav-border": "oklch(0.8 0.008 250)",
    },
  },
  {
    key: "slate",
    name: "Slate",
    note: "Dark and low-contrast against the page, so the content reads brighter.",
    dark: true,
    vars: {
      "--nav-bg": "oklch(0.28 0.015 250)",
      "--nav-fg": "oklch(0.96 0.004 250)",
      "--nav-muted": "oklch(0.72 0.012 250)",
      "--nav-active": "oklch(0.36 0.02 250)",
      "--nav-border": "oklch(0.36 0.018 250)",
    },
  },
  {
    key: "forest",
    name: "Forest",
    note: "Deep green. Reads as calm rather than corporate.",
    dark: true,
    vars: {
      "--nav-bg": "oklch(0.3 0.045 160)",
      "--nav-fg": "oklch(0.96 0.01 160)",
      "--nav-muted": "oklch(0.75 0.03 160)",
      "--nav-active": "oklch(0.38 0.055 160)",
      "--nav-border": "oklch(0.38 0.05 160)",
    },
  },
  {
    key: "ink",
    name: "Ink",
    note: "Near-black navy. The most contrast against a white page.",
    dark: true,
    vars: {
      "--nav-bg": "oklch(0.24 0.03 265)",
      "--nav-fg": "oklch(0.97 0.005 265)",
      "--nav-muted": "oklch(0.73 0.02 265)",
      "--nav-active": "oklch(0.33 0.04 265)",
      "--nav-border": "oklch(0.33 0.035 265)",
    },
  },
  {
    key: "clay",
    name: "Clay",
    note: "Warm terracotta. Distinct without being loud.",
    dark: true,
    vars: {
      "--nav-bg": "oklch(0.33 0.05 40)",
      "--nav-fg": "oklch(0.97 0.01 40)",
      "--nav-muted": "oklch(0.76 0.03 40)",
      "--nav-active": "oklch(0.41 0.06 40)",
      "--nav-border": "oklch(0.41 0.055 40)",
    },
  },
  {
    key: "sand",
    name: "Sand",
    note: "A light warm alternative to Paper, for people who dislike grey.",
    dark: false,
    vars: {
      "--nav-bg": "oklch(0.925 0.018 85)",
      "--nav-fg": "oklch(0.24 0.022 85)",
      "--nav-muted": "oklch(0.47 0.024 85)",
      "--nav-active": "oklch(0.87 0.032 85)",
      "--nav-border": "oklch(0.79 0.026 85)",
    },
  },
];

export const DEFAULT_SCHEME_KEY = "default";

export function schemeFor(key: string | null | undefined): NavScheme {
  return (
    NAV_SCHEMES.find((s) => s.key === key) ?? NAV_SCHEMES.find((s) => s.key === DEFAULT_SCHEME_KEY)!
  );
}

export type OrgBranding = {
  /** Replaces "GoCanvas Handoff Hub" in the sidebar. */
  app_name: string;
  nav_scheme: string;
  /** Storage path in the attachments bucket, or null. Never a URL. */
  logo_path: string | null;
};

export const DEFAULT_BRANDING: OrgBranding = {
  app_name: "GoCanvas Handoff Hub",
  nav_scheme: DEFAULT_SCHEME_KEY,
  logo_path: null,
};

/** What the browser needs: the same thing, with the path already signed. */
export type OrgBrandingView = Omit<OrgBranding, "logo_path"> & { logo_url: string | null };
