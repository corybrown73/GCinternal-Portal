import { createHash } from "node:crypto";

import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";

import { MAX_DOC_BYTES } from "./config";

/**
 * A file somebody uploaded, turned into the one block the model can read.
 *
 * SNIFFED, NEVER TRUSTED. The New-account dialog once stored a .docx
 * labelled application/pdf, and every reader then 400ed with a message
 * nobody could act on. The first bytes say what a file is; the name and
 * the declared type only help word the problem when they do not.
 */

export type PreparedDocumentKind = "pdf" | "text" | "image" | "unsupported";

export type PreparedDocument = {
  kind: PreparedDocumentKind;
  /** The block to put in the user message; null when the file cannot be read. */
  block: BetaContentBlockParam | null;
  /** The text, for a Word document or a text file; null for PDFs and images. */
  text: string | null;
  bytes: Uint8Array;
  /** Hex sha256 of the bytes: the same file read twice is the same reading. */
  sha256: string;
  name: string;
  /** The media type the bytes turned out to be, or null when unsupported. */
  mediaType: string | null;
  /** True when the text was cut at the cap; the block says so to the model. */
  truncated: boolean;
  /** One line a person can act on when the file could not be read. */
  problem: string | null;
};

/** The API's per-image ceiling. */
const MAX_IMAGE_BYTES = 5_000_000;
/** The API reads a PDF up to this many pages on a 1M-context model. */
export const MAX_PDF_PAGES = 600;
/** Characters of text handed over; past this the model is told what it did not see. */
export const MAX_DOC_TEXT_CHARS = 400_000;
/** Below this a "text file" is almost certainly empty. */
const MIN_TEXT_CHARS = 40;

type ImageType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

function imageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return "image/webp";
  return null;
}

/** A zip's entry names sit in its local headers and central directory as plain ASCII. */
function zipHolds(bytes: Uint8Array, entry: string): boolean {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes(entry, 0, "latin1");
}

function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name.trim());
  return m ? m[1]!.toLowerCase() : "";
}

function megabytes(n: number): string {
  return `${Math.round(n / 100_000) / 10} MB`;
}

/** Of the decoded characters, how many are text rather than control bytes or undecodable. */
function printableRatio(text: string): number {
  if (text.length === 0) return 0;
  let bad = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0xfffd || (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d)) bad += 1;
  }
  return 1 - bad / text.length;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Roughly how many pages a PDF has: its page objects, counted as text.
 * Pages packed into compressed object streams are missed, so this only
 * ever undercounts, and it is used only to refuse a file the API would
 * refuse anyway, with a reason a person can act on.
 */
export function pdfPageCount(bytes: Uint8Array): number {
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");
  return text.match(/\/Type\s*\/Page(?![s\w])/g)?.length ?? 0;
}

/**
 * A file that cannot be read, with the reason — for a caller that could
 * not even fetch the bytes, so the brief still says why the SOW is missing.
 */
export function unreadableDocument(name: string, problem: string): PreparedDocument {
  return {
    kind: "unsupported",
    block: null,
    text: null,
    bytes: new Uint8Array(),
    sha256: sha256Hex(new Uint8Array()),
    name,
    mediaType: null,
    truncated: false,
    problem,
  };
}

/**
 * What an uploaded "document" really is, from its first bytes: a PDF, a
 * Word file, or neither. The upload paths store this, not the browser's
 * guess, so every later reader opens the file the right way.
 */
export function sniffDocumentType(
  bytes: Uint8Array,
):
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && zipHolds(bytes, "word/document.xml")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return null;
}

/**
 * Cut text to the cap with a note the model reads, instead of a silent
 * truncation that makes the last pages vanish from every reading.
 */
function capText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_DOC_TEXT_CHARS) return { text, truncated: false };
  const rest = text.length - MAX_DOC_TEXT_CHARS;
  return {
    text: `${text.slice(0, MAX_DOC_TEXT_CHARS)}\n\n[The document continues for about ${rest.toLocaleString("en-US")} more characters that were not included here. Say so in gaps if the part you read does not settle something.]`,
    truncated: true,
  };
}

export async function prepareDocument(
  input: Uint8Array | ArrayBuffer | Buffer,
  name: string,
  declaredType?: string | null,
  options?: { title?: string | null | undefined },
): Promise<PreparedDocument> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const title = options?.title ?? name;
  const base = {
    bytes,
    sha256: sha256Hex(bytes),
    name,
    truncated: false,
  };
  const unsupported = (problem: string): PreparedDocument => ({
    ...base,
    kind: "unsupported",
    block: null,
    text: null,
    mediaType: null,
    problem,
  });
  const asText = (raw: string, mediaType: string): PreparedDocument => {
    const trimmed = raw.replace(/\r\n/g, "\n").trim();
    if (trimmed.length < MIN_TEXT_CHARS) {
      return unsupported(`${name} looks empty — there is no readable text in it.`);
    }
    const capped = capText(trimmed);
    return {
      ...base,
      kind: "text",
      block: {
        type: "document",
        source: { type: "text", media_type: "text/plain", data: capped.text },
        title,
      },
      text: capped.text,
      mediaType,
      truncated: capped.truncated,
      problem: null,
    };
  };

  if (bytes.byteLength === 0) return unsupported(`${name} is empty.`);

  // PDF
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    if (bytes.byteLength > MAX_DOC_BYTES) {
      return unsupported(
        `${name} is ${megabytes(bytes.byteLength)}; a PDF up to ${megabytes(MAX_DOC_BYTES)} can be read. Export a smaller copy.`,
      );
    }
    const pages = pdfPageCount(bytes);
    if (pages > MAX_PDF_PAGES) {
      return unsupported(
        `${name} has about ${pages} pages; a PDF up to ${MAX_PDF_PAGES} pages can be read. Export the pages that matter.`,
      );
    }
    return {
      ...base,
      kind: "pdf",
      block: {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: Buffer.from(bytes).toString("base64"),
        },
        title,
      },
      text: null,
      mediaType: "application/pdf",
      problem: null,
    };
  }

  // Office Open XML: a zip whose entries say which app wrote it.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    if (bytes.byteLength > MAX_DOC_BYTES) {
      return unsupported(
        `${name} is ${megabytes(bytes.byteLength)}; a document up to ${megabytes(MAX_DOC_BYTES)} can be read.`,
      );
    }
    if (zipHolds(bytes, "word/document.xml")) {
      try {
        // Loaded here: mammoth is only worth parsing when a Word file arrives.
        // CommonJS under the hood, so the function sits on the namespace in
        // one runtime and on `default` in another.
        const mod = (await import("mammoth")) as unknown as {
          extractRawText?: typeof import("mammoth").extractRawText;
          default?: { extractRawText?: typeof import("mammoth").extractRawText };
        };
        const extractRawText = mod.extractRawText ?? mod.default?.extractRawText;
        if (!extractRawText) throw new Error("mammoth did not load");
        const { value } = await extractRawText({ buffer: Buffer.from(bytes) });
        return asText(
          value,
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );
      } catch (e) {
        console.error("[documents] mammoth could not read the Word file", e);
        return unsupported(
          `${name} is a Word document that could not be opened. Save it again, or export it as a PDF.`,
        );
      }
    }
    if (zipHolds(bytes, "ppt/presentation.xml")) {
      return unsupported(`${name} is a PowerPoint deck; export it as a PDF to have it read.`);
    }
    if (zipHolds(bytes, "xl/workbook.xml")) {
      return unsupported(
        `${name} is an Excel workbook; export it as a PDF or CSV to have it read.`,
      );
    }
    return unsupported(
      `${name} is a zip archive, which cannot be read. Attach the document itself.`,
    );
  }

  // The pre-2007 Office container: .doc, .xls, .ppt.
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) {
    return unsupported(
      `${name} is an older Office file (.doc, .xls or .ppt). Save it as .docx or export it as a PDF.`,
    );
  }

  const image = imageType(bytes);
  if (image) {
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return unsupported(
        `${name} is ${megabytes(bytes.byteLength)}; an image up to ${megabytes(MAX_IMAGE_BYTES)} can be read.`,
      );
    }
    return {
      ...base,
      kind: "image",
      block: {
        type: "image",
        source: { type: "base64", media_type: image, data: Buffer.from(bytes).toString("base64") },
      },
      text: null,
      mediaType: image,
      problem: null,
    };
  }

  // Anything else is text if it decodes as text. The declared type and the
  // extension only lower the bar for a file that says it is text.
  if (bytes.byteLength > MAX_DOC_BYTES) {
    return unsupported(`${name} is ${megabytes(bytes.byteLength)}, too large to read as text.`);
  }
  const decoded = new TextDecoder("utf-8").decode(bytes);
  const ext = extensionOf(name);
  const saysText =
    (declaredType ?? "").startsWith("text/") ||
    ["txt", "md", "markdown", "csv", "json", "html", "htm", "rtf", "vtt", "srt", "xml"].includes(
      ext,
    );
  const ratio = printableRatio(decoded);
  if (ratio >= 0.95 || (saysText && ratio >= 0.8)) {
    return asText(decoded, declaredType?.startsWith("text/") ? declaredType : "text/plain");
  }
  const what = ext ? `a .${ext} file` : "a file";
  return unsupported(
    `${name} is ${what} that cannot be read. Attach a PDF, a Word document (.docx), an image or a text file.`,
  );
}
