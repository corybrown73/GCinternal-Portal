import { useCallback, useEffect, useState } from "react";

import {
  readThemeChoice,
  resolveTheme,
  THEME_OVERRIDE_KEY,
  themeClass,
  type ThemeChoice,
} from "./interface-theme";
import type { InterfaceTheme } from "./org-branding";
import { useOrgBranding } from "./use-branding";

const EVENT = "hub:theme-choice";
const FONT_ID = "hub-font-gocanvas";
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap";

function readStored(): ThemeChoice {
  try {
    return readThemeChoice(window.localStorage.getItem(THEME_OVERRIDE_KEY));
  } catch {
    return "team";
  }
}

/** This person's own choice, live across the tabs that share the browser. */
export function useThemeChoice(): [ThemeChoice, (next: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>("team");
  useEffect(() => {
    setChoice(readStored());
    const sync = () => setChoice(readStored());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const set = useCallback((next: ThemeChoice) => {
    try {
      if (next === "team") window.localStorage.removeItem(THEME_OVERRIDE_KEY);
      else window.localStorage.setItem(THEME_OVERRIDE_KEY, next);
    } catch {
      // Private mode or blocked storage: the choice lasts for this page only.
    }
    setChoice(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [choice, set];
}

/** The theme in effect for this person: their choice, else the team's. */
export function useInterfaceTheme(): InterfaceTheme {
  const branding = useOrgBranding();
  const [choice] = useThemeChoice();
  return resolveTheme(branding.theme, choice);
}

/**
 * Puts the theme's class on <html> and loads its font when it is on. Mounted
 * once, at the root, so a page that renders without the sidebar (sign-in,
 * a plan link) follows the same rule as the rest.
 */
export function useApplyTheme(): void {
  const theme = useInterfaceTheme();
  useEffect(() => {
    const root = document.documentElement;
    const cls = themeClass(theme);
    root.classList.toggle("theme-gocanvas", cls === "theme-gocanvas");
    if (cls && !document.getElementById(FONT_ID)) {
      const link = document.createElement("link");
      link.id = FONT_ID;
      link.rel = "stylesheet";
      link.href = FONT_HREF;
      document.head.appendChild(link);
    }
  }, [theme]);
}
