import { describe, expect, it } from "vitest";

import {
  FORM_SCREENSHOT_MAX_BASE64,
  FORM_SCREENSHOT_MAX_BYTES,
  formScreenshotSchema,
  sniffFormScreenshotType,
} from "../form-screenshot";
import { readIntake } from "../intake-answers";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);

describe("sniffFormScreenshotType — the bytes decide the type, not the name", () => {
  it("recognises PNG, JPEG and WebP by their signatures", () => {
    expect(sniffFormScreenshotType(png)).toBe("image/png");
    expect(sniffFormScreenshotType(jpeg)).toBe("image/jpeg");
    expect(sniffFormScreenshotType(webp)).toBe("image/webp");
  });

  it("refuses a PDF, a GIF and an empty file", () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(sniffFormScreenshotType(pdf)).toBeNull();
    expect(sniffFormScreenshotType(gif)).toBeNull();
    expect(sniffFormScreenshotType(new Uint8Array())).toBeNull();
  });

  it("refuses a RIFF file that is not WebP", () => {
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    expect(sniffFormScreenshotType(wav)).toBeNull();
  });
});

describe("form screenshot limits", () => {
  it("the base64 cap carries exactly the byte cap, with a little slack", () => {
    expect(FORM_SCREENSHOT_MAX_BASE64).toBeGreaterThanOrEqual(
      Math.ceil((FORM_SCREENSHOT_MAX_BYTES * 4) / 3),
    );
    expect(FORM_SCREENSHOT_MAX_BASE64).toBeLessThan(FORM_SCREENSHOT_MAX_BYTES * 2);
  });
});

describe("first_form_screenshot on the intake", () => {
  it("defaults to no screenshot, so existing deals read unchanged", () => {
    expect(readIntake({}).first_form_screenshot).toBeNull();
  });

  it("accepts a recorded screenshot and refuses a type it does not allow", () => {
    const ok = formScreenshotSchema.parse({
      path: "deals/x/forms/shot.png",
      name: "shot.png",
      content_type: "image/png",
      uploaded_at: "2026-10-12T10:00:00Z",
    });
    expect(ok?.content_type).toBe("image/png");
    expect(() =>
      formScreenshotSchema.parse({
        path: "deals/x/forms/shot.gif",
        name: "shot.gif",
        content_type: "image/gif",
        uploaded_at: "2026-10-12T10:00:00Z",
      }),
    ).toThrow();
  });
});
