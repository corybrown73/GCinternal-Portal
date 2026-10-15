import { describe, expect, it } from "vitest";

import {
  attachmentActionLabel,
  attachmentOpensDirectly,
  attachmentRemovable,
} from "@/lib/attachment-rows";

describe("attachment rows", () => {
  const upload = { origin: "file" as const, external_url: null };
  const link = { origin: "file" as const, external_url: "https://example.com/board" };
  const legacySow = { origin: "field" as const, external_url: "https://example.com/sow.pdf" };

  it("labels a stored file Download and a link Open", () => {
    expect(attachmentActionLabel(upload)).toBe("Download");
    expect(attachmentActionLabel(link)).toBe("Open");
    expect(attachmentActionLabel(legacySow)).toBe("Open");
  });

  it("opens legacy field links directly and sends everything else through the server", () => {
    expect(attachmentOpensDirectly(legacySow)).toBe(true);
    expect(attachmentOpensDirectly(link)).toBe(false);
    expect(attachmentOpensDirectly(upload)).toBe(false);
  });

  it("allows removal only for stored records, never legacy fields", () => {
    expect(attachmentRemovable(upload)).toBe(true);
    expect(attachmentRemovable(link)).toBe(true);
    expect(attachmentRemovable(legacySow)).toBe(false);
  });
});
