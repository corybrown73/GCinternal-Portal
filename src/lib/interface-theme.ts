import { DEFAULT_THEME, type InterfaceTheme, themeFor } from "./org-branding";

/**
 * Which theme this person sees: their own choice if they made one, else the
 * team's default. Pure, so the sidebar, the root shell and the settings
 * form all agree.
 *
 * WHY A PERSONAL OVERRIDE. The team default is an admin's call, but the
 * people who built and chose the Classic look should not lose it because a
 * manager flipped a switch. "Follow the team" is the default; a person who
 * picks Classic or GoCanvas keeps it on that browser until they change it.
 */
export type ThemeChoice = InterfaceTheme | "team";

export const THEME_OVERRIDE_KEY = "hub:interface-theme";

export function resolveTheme(team: unknown, personal: unknown): InterfaceTheme {
  if (personal === "classic" || personal === "gocanvas") return personal;
  return themeFor(team);
}

export function readThemeChoice(raw: string | null | undefined): ThemeChoice {
  return raw === "classic" || raw === "gocanvas" ? raw : "team";
}

/** The class the <html> element carries for each theme. Classic carries none. */
export function themeClass(theme: InterfaceTheme): string | null {
  return theme === "gocanvas" ? "theme-gocanvas" : null;
}

export { DEFAULT_THEME };
