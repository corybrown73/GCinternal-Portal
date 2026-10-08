import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Files are read by their first bytes, never by their name or the type the
 * browser sent. mammoth is mocked: a real .docx is a zip with XML inside,
 * and what matters here is that a Word file is recognised and its text is
 * what the model gets.
 */
const h = vi.hoisted(() => ({
  mammothText: "Statement of Work\n\nThe customer buys three forms and QuickBooks.",
  mammothCalls: 0,
  mammothFails: false,
}));

vi.mock("mammoth", () => ({
  extractRawText: async () => {
    h.mammothCalls += 1;
    if (h.mammothFails) throw new Error("corrupt zip");
    return { value: h.mammothText, messages: [] };
  },
}));

import { MAX_DOC_BYTES } from "../server/ai/config";
import {
  MAX_DOC_TEXT_CHARS,
  MAX_PDF_PAGES,
  pdfPageCount,
  prepareDocument,
  sniffDocumentType,
  unreadableDocument,
} from "../server/ai/documents";

const enc = (s: string) => new TextEncoder().encode(s);
const bytes = (...parts: Array<number[] | string>) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...enc(p)] : p)));

const PDF = bytes("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
const DOCX = bytes([0x50, 0x4b, 0x03, 0x04], "\0\0\0\0", "word/document.xml", "<w:document/>");
const PPTX = bytes([0x50, 0x4b, 0x03, 0x04], "\0\0\0\0", "ppt/presentation.xml");
const DOC = bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], "old word");
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "IHDR....");
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], "JFIF");
const WEBP = bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 ");
const TEXT = enc(
  "Meeting transcript\n00:00:01 Dana: We fill the service ticket on paper at the end of every job.\n",
);

beforeEach(() => {
  h.mammothCalls = 0;
  h.mammothFails = false;
});

describe("prepareDocument", () => {
  it("reads a PDF as a PDF document block, whatever the name says", async () => {
    const d = await prepareDocument(PDF, "sow.docx", "application/octet-stream");
    expect(d.kind).toBe("pdf");
    expect(d.mediaType).toBe("application/pdf");
    expect(d.problem).toBeNull();
    expect(d.block).toMatchObject({
      type: "document",
      title: "sow.docx",
      source: { type: "base64", media_type: "application/pdf" },
    });
    expect(d.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(d.text).toBeNull();
  });

  it("reads a Word file through mammoth and hands the text over as a document", async () => {
    const d = await prepareDocument(DOCX, "sow.pdf", "application/pdf", { title: "Signed SOW" });
    expect(h.mammothCalls).toBe(1);
    expect(d.kind).toBe("text");
    expect(d.mediaType).toMatch(/wordprocessingml/);
    expect(d.text).toBe(h.mammothText);
    expect(d.block).toEqual({
      type: "document",
      title: "Signed SOW",
      source: { type: "text", media_type: "text/plain", data: h.mammothText },
    });
  });

  it("says so when the Word file cannot be opened", async () => {
    h.mammothFails = true;
    const d = await prepareDocument(DOCX, "sow.docx");
    expect(d.kind).toBe("unsupported");
    expect(d.block).toBeNull();
    expect(d.problem).toMatch(/Word document that could not be opened/);
  });

  it("reads an image as an image block", async () => {
    for (const [data, type] of [
      [PNG, "image/png"],
      [JPEG, "image/jpeg"],
      [WEBP, "image/webp"],
    ] as const) {
      const d = await prepareDocument(data, "form.bin");
      expect(d.kind).toBe("image");
      expect(d.mediaType).toBe(type);
      expect(d.block).toMatchObject({
        type: "image",
        source: { type: "base64", media_type: type },
      });
    }
  });

  it("reads plain text, and a .vtt declared as text, as a text document", async () => {
    const d = await prepareDocument(TEXT, "call.vtt", "text/vtt");
    expect(d.kind).toBe("text");
    expect(d.text).toMatch(/service ticket/);
    expect(d.truncated).toBe(false);
    expect(d.block).toMatchObject({ type: "document", source: { type: "text" } });
  });

  it("tells the model when the text was cut, instead of cutting it silently", async () => {
    const d = await prepareDocument(enc("word ".repeat(MAX_DOC_TEXT_CHARS / 4)), "big.txt");
    expect(d.kind).toBe("text");
    expect(d.truncated).toBe(true);
    expect(d.text!.length).toBeGreaterThan(MAX_DOC_TEXT_CHARS);
    expect(d.text).toMatch(/continues for about/);
  });

  it("refuses binary junk, an empty file and a near-empty text file with a reason", async () => {
    const junk = new Uint8Array(400);
    for (let i = 0; i < junk.length; i++) junk[i] = (i * 7) % 32;
    const d = await prepareDocument(junk, "mystery.bin");
    expect(d.kind).toBe("unsupported");
    expect(d.problem).toMatch(/mystery\.bin is a \.bin file that cannot be read/);

    expect((await prepareDocument(new Uint8Array(0), "nothing.pdf")).problem).toMatch(/is empty/);
    expect((await prepareDocument(enc("hi"), "short.txt")).problem).toMatch(/looks empty/);
  });

  it("names the Office formats it cannot read", async () => {
    expect((await prepareDocument(DOC, "sow.doc")).problem).toMatch(/older Office file/);
    expect((await prepareDocument(PPTX, "deck.pptx")).problem).toMatch(/PowerPoint/);
  });

  it("caps a PDF at MAX_DOC_BYTES with the size in the message", async () => {
    const huge = new Uint8Array(MAX_DOC_BYTES + 1);
    huge.set(PDF, 0);
    const d = await prepareDocument(huge, "huge.pdf");
    expect(d.kind).toBe("unsupported");
    expect(d.problem).toMatch(/huge\.pdf is 20 MB/);
    expect(d.problem).toMatch(/Export a smaller copy/);
  });

  it("refuses a PDF with more pages than the API reads, counting page objects", async () => {
    const page = "<< /Type /Page /Parent 2 0 R >>\n";
    const pages = bytes("%PDF-1.4\n<< /Type /Pages /Count 2 >>\n", page.repeat(MAX_PDF_PAGES + 5));
    expect(pdfPageCount(pages)).toBe(MAX_PDF_PAGES + 5);
    const d = await prepareDocument(pages, "long.pdf");
    expect(d.kind).toBe("unsupported");
    expect(d.problem).toMatch(new RegExp(`about ${MAX_PDF_PAGES + 5} pages`));
    expect(d.problem).toMatch(/Export the pages/);
    // /Pages (the tree) and /PageMode are not pages.
    expect(pdfPageCount(bytes("<< /Type /Pages >> << /PageMode /UseNone >>"))).toBe(0);
    expect((await prepareDocument(PDF, "short.pdf")).kind).toBe("pdf");
  });

  it("stands in for a file that could not be fetched, with the reason", () => {
    const d = unreadableDocument("sow.pdf", "sow.pdf could not be downloaded.");
    expect(d.kind).toBe("unsupported");
    expect(d.block).toBeNull();
    expect(d.problem).toBe("sow.pdf could not be downloaded.");
    expect(d.name).toBe("sow.pdf");
  });

  it("hashes the same bytes to the same reading", async () => {
    const a = await prepareDocument(PDF, "a.pdf");
    const b = await prepareDocument(new Uint8Array(PDF), "b.pdf");
    expect(a.sha256).toBe(b.sha256);
    expect((await prepareDocument(TEXT, "c.txt")).sha256).not.toBe(a.sha256);
  });
});

describe("sniffDocumentType", () => {
  it("knows a PDF and a Word file by their bytes and nothing else", () => {
    expect(sniffDocumentType(PDF)).toBe("application/pdf");
    expect(sniffDocumentType(DOCX)).toMatch(/wordprocessingml/);
    expect(sniffDocumentType(PPTX)).toBeNull();
    expect(sniffDocumentType(PNG)).toBeNull();
    expect(sniffDocumentType(TEXT)).toBeNull();
  });
});

describe("every reader schema compiles to an output grammar", () => {
  it("builds a JSON schema from each zod/v4 schema the readers pass to the client", async () => {
    const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");
    const { briefJsonSchema } = await import("../server/schemas");
    const { sowPlanProposalSchema } = await import("../sow-plan");
    const { sowAnalysisSchema } = await import("../sow-analysis");
    const { transcriptAnalysisSchema } = await import("../transcript-analysis");
    for (const schema of [
      briefJsonSchema,
      briefJsonSchema.shape.onboarding.unwrap(),
      sowPlanProposalSchema,
      sowAnalysisSchema,
      transcriptAnalysisSchema,
    ]) {
      const format = zodOutputFormat(schema);
      expect(format.type).toBe("json_schema");
      expect(format.schema["type"]).toBe("object");
      expect(Object.keys(format.schema["properties"] as object).length).toBeGreaterThan(0);
    }
  });
});
