export const PANEL_OPEN_EVENT = "gc:panel-open";

/** Ask the panel with this collapse key to open, and scroll it into view. */
export function openPanel(collapseKey: string, elementId?: string): void {
  window.dispatchEvent(new CustomEvent(PANEL_OPEN_EVENT, { detail: collapseKey }));
  if (elementId) {
    requestAnimationFrame(() => {
      document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}
