import { z } from "zod";

/**
 * Working notes on an implementation. The stage is never a form field — the
 * server stamps whichever stage the implementation is in when the note is
 * written, so historical notes stay attached to the stage they belong to.
 */
export const createJournalEntryInput = z.object({
  implementationId: z.string().uuid(),
  note: z.string().trim().min(1),
  authorId: z.string().uuid().nullable(),
  /** One link per line. */
  links: z.string().trim().min(1).nullable(),
  attachmentUrl: z.string().trim().min(1).nullable(),
  attachmentName: z.string().trim().min(1).nullable(),
});

export type CreateJournalEntryInput = z.infer<typeof createJournalEntryInput>;

/** File handed to the server as base64 — POC scale only. */
export const uploadAttachmentInput = z.object({
  folder: z.enum(["sow", "notes", "solution"]),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(200),
  /** ~6 MB of base64 ≈ 4.5 MB of file. */
  dataBase64: z.string().min(1).max(6_500_000),
});

export const attachmentPathInput = z.object({ path: z.string().trim().min(1) });

export function splitLinks(links: string | null | undefined): string[] {
  if (!links) return [];
  return links
    .split(/[\n,]/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * A customer's logo.
 *
 * Deliberately narrower than the general attachment input: a fixed set of
 * image types and a small ceiling, because this is a brand mark rendered at
 * 28px, not a document. Accepting anything here would make the private
 * customer-branding bucket a general file drop that happens to be reachable
 * from a customer record.
 *
 * SVG is excluded on purpose. It is a document format that can carry script,
 * and it would be served from a signed URL on our own origin.
 */
export const uploadCustomerLogoInput = z.object({
  customerId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  /** ~1.4 MB of base64 ≈ 1 MB of image. Generous for a logo. */
  dataBase64: z.string().min(1).max(1_400_000),
});
