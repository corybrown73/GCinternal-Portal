import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";

/**
 * The page as a PowerPoint.
 *
 * WHY PICTURES. The deck the team already loves is ten full-bleed images —
 * one designed screen per slide. So that is what this makes: every visible
 * screen of the welcome page, rendered at exactly 1280 × 720 in the browser
 * that is already showing it, rasterised at 2x, and placed edge to edge on a
 * 13.333 × 7.5 in slide. Same fonts, same colours, same logo, same layout —
 * because it is the same pixels. Nothing to keep in step; there is no second
 * layout.
 *
 * Text is not editable in PowerPoint. That is the trade, and the page is the
 * editable thing. The speaker notes ride along as slide notes.
 *
 * Runs entirely in the browser: the screens are mounted off-screen at zoom 1,
 * captured with html-to-image, and written with pptxgenjs. No server render.
 */
export async function exportWelcomePptx(args: {
  /** The screens to include, in order, unzoomed. */
  screens: ReactNode[];
  /** Speaker notes per screen, same order; empty string for none. */
  notes: string[];
  fileName: string;
  title: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<void> {
  const host = document.createElement("div");
  // Off-screen but rendered: display:none would give html-to-image nothing.
  host.style.cssText =
    "position:fixed;left:-20000px;top:0;width:1280px;pointer-events:none;z-index:-1;";
  host.className = "gc-welcome wp-export";
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    root.render(
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {args.screens.map((s, i) => (
          <div key={i} className="wp-export-screen" style={{ width: 1280, height: 720 }}>
            {s}
          </div>
        ))}
      </div>,
    );
    await nextPaint();
    await document.fonts.ready;
    await settleImages(host);

    const [{ toPng }, pptxMod] = await Promise.all([import("html-to-image"), import("pptxgenjs")]);
    const Pptx = (pptxMod as { default?: unknown }).default ?? pptxMod;
    const pptx = new (Pptx as new () => import("pptxgenjs").default)();
    pptx.layout = "LAYOUT_WIDE"; // 13.333 × 7.5 in — the same 16:9 as the stage
    pptx.title = args.title;

    const nodes = Array.from(host.querySelectorAll<HTMLElement>(".wp-export-screen"));
    for (let i = 0; i < nodes.length; i++) {
      const data = await toPng(nodes[i]!, {
        width: 1280,
        height: 720,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        // A photo that will not cross origins becomes a blank, not a failed deck.
        imagePlaceholder: BLANK_PNG,
      });
      const slide = pptx.addSlide();
      slide.background = { color: "FFFFFF" };
      slide.addImage({ data, x: 0, y: 0, w: "100%", h: "100%" });
      const note = args.notes[i];
      if (note) slide.addNotes(note);
      args.onProgress?.(i + 1, nodes.length);
    }
    await pptx.writeFile({ fileName: args.fileName });
  } finally {
    root.unmount();
    host.remove();
  }
}

const BLANK_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function nextPaint(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

/** Wait for every image in the tree to load (or fail) so none is captured blank. */
async function settleImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((r) => {
            img.addEventListener("load", () => r(), { once: true });
            img.addEventListener("error", () => r(), { once: true });
          }),
    ),
  );
}

/** "Maverick Well Pluggers" → "Maverick-Well-Pluggers-onboarding-plan.pptx" */
export function pptxFileName(clientName: string): string {
  const safe = clientName
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${safe || "customer"}-onboarding-plan.pptx`;
}
