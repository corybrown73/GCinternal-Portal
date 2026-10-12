import { z } from "zod";

/**
 * The screenshot of the customer's first form, shown on Kickoff Slide 5.
 * A picture the TIS takes of the live form, not an integration with it: it
 * lives in the same private attachments bucket as the intake's form files,
 * under the same deal prefix, and is served through the same short-lived
 * signed link.
 */

export const FORM_SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type FormScreenshotType = (typeof FORM_SCREENSHOT_TYPES)[number];

export const FORM_SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;

/** The base64 text that carries FORM_SCREENSHOT_MAX_BYTES, with a little slack. */
export const FORM_SCREENSHOT_MAX_BASE64 = Math.ceil((FORM_SCREENSHOT_MAX_BYTES * 4) / 3) + 16;

export const formScreenshotSchema = z
  .object({
    path: z.string().min(1).max(300),
    name: z.string().min(1).max(200),
    content_type: z.enum(FORM_SCREENSHOT_TYPES),
    uploaded_at: z.string().max(40),
  })
  .nullable()
  .default(null);

/**
 * The image type the bytes actually are, from their signature — never the
 * type the browser claimed. Null for anything that is not PNG, JPEG or WebP.
 */
export function sniffFormScreenshotType(bytes: Uint8Array): FormScreenshotType | null {
  const startsWith = (sig: readonly number[], offset = 0) =>
    sig.every((b, i) => bytes[offset + i] === b);
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}
