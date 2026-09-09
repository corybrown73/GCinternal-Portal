import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as Lucide from "lucide-react";

/**
 * A lucide icon as an SVG data URI, for embedding in a deck.
 *
 * No rasteriser: pptxgenjs embeds SVG and both PowerPoint and LibreOffice
 * draw it, so there is no native dependency and the icon is crisp at any
 * size. Server-only, because react-dom/server is.
 */
export function iconSvgDataUri(name: string, color: string, strokeWidth = 1.75): string {
  const Icon = (Lucide as unknown as Record<string, unknown>)[name] as
    Lucide.LucideIcon | undefined;
  const Component = Icon ?? Lucide.ClipboardCheck;
  const svg = renderToStaticMarkup(
    createElement(Component, { color: `#${color.replace(/^#/, "")}`, size: 256, strokeWidth }),
  );
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
