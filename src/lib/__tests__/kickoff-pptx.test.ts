import { describe, expect, it } from "vitest";

import { BRAND } from "../brand";
import { buildKickoffDeck, type KickoffDeckInput } from "../kickoff-deck";
import { buildKickoffDeckFile } from "../server/brief/pptx";

const bare: KickoffDeckInput = {
  brief: {
    account_name: "Thin Deal Ltd",
    one_liner: "",
    current_process: [],
    goals: [],
    what_we_know: [],
    stakeholders: [],
    risks_open_items: [],
    discovery_questions: [],
    process_gaps: [],
  },
  account: {
    name: "Thin Deal Ltd",
    domain: null,
    arr: null,
    products: null,
    primaryContactName: null,
    primaryContactEmail: null,
    primaryContactRole: null,
    salesOwner: null,
    seOwner: null,
  },
  sow: null,
  sources: [],
  team: [],
  plan: null,
  preparedAt: "2026-08-31T14:00:00.000Z",
};

/** The .pptx is a zip. Reading it back is the only honest check on the output. */
async function open(buf: Buffer) {
  const { unzipSync } = await import("node:zlib");
  const entries = new Map<string, Buffer>();
  // Minimal central-directory walk — enough to list names and inflate members,
  // without adding a zip dependency for one test.
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end -= 1;
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  for (let i = 0; i < count; i += 1) {
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 24);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString();
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + buf.readUInt32LE(p + 20));
    entries.set(name, method === 0 ? raw.subarray(0, size) : unzipSync(raw, { finishFlush: 2 }));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

describe("buildKickoffDeckFile", () => {
  it("renders a deck with nothing recorded rather than refusing to", async () => {
    const buf = await buildKickoffDeckFile(buildKickoffDeck(bare), null);
    const entries = await open(buf);
    const slides = [...entries.keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    expect(slides.length).toBeGreaterThan(10);
  });

  it("embeds the wordmark twice, not once per slide", async () => {
    // It lives on the two masters. Before that it was an addImage per slide and
    // the same PNG appeared twenty times in one file.
    const buf = await buildKickoffDeckFile(buildKickoffDeck(bare), null);
    const media = [...(await open(buf)).keys()].filter(
      (n) => n.startsWith("ppt/media/") && n.endsWith(".png"),
    );
    expect(media).toHaveLength(2);
  });

  it("adds the customer's logo when there is one, and nothing when there is not", async () => {
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const withLogo = [
      ...(await open(await buildKickoffDeckFile(buildKickoffDeck(bare), png))).keys(),
    ].filter((n) => n.startsWith("ppt/media/"));
    const without = [
      ...(await open(await buildKickoffDeckFile(buildKickoffDeck(bare), null))).keys(),
    ].filter((n) => n.startsWith("ppt/media/"));
    expect(withLogo.length).toBe(without.length + 1);
  });

  it("paints the title slide in the brand, not in the green that used to be here", async () => {
    const entries = await open(await buildKickoffDeckFile(buildKickoffDeck(bare), null));
    const xml = entries.get("ppt/slides/slide1.xml")!.toString();
    expect(xml).toContain(BRAND.cyan);
    expect(xml).not.toContain("237A4B");
  });

  it("names the account in the file's own title metadata", async () => {
    const entries = await open(await buildKickoffDeckFile(buildKickoffDeck(bare), null));
    const core = entries.get("docProps/core.xml")!.toString();
    expect(core).toContain("Thin Deal Ltd");
  });
});
