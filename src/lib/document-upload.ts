/**
 * What a signed SOW or contract may be uploaded as: a PDF or a Word file.
 * The browser checks here so the person hears "a PDF or Word document,
 * please" before the bytes go up; the server sniffs the bytes and decides
 * for real, because a browser's `file.type` is a guess from the extension.
 */

export const PDF_TYPE = "application/pdf";
export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const DOCUMENT_UPLOAD_TYPES = [PDF_TYPE, DOCX_TYPE] as const;
export type DocumentUploadType = (typeof DOCUMENT_UPLOAD_TYPES)[number];

/** For an `<input accept>`: both types and both extensions, for browsers that only know one. */
export const DOCUMENT_UPLOAD_ACCEPT = `${PDF_TYPE},${DOCX_TYPE},.pdf,.docx`;

export const DOCUMENT_UPLOAD_HINT = "A PDF or Word document (.docx), please.";

/**
 * The upload type for a picked file, or null when it is neither. Some
 * browsers report an empty `type` for .docx, so the extension counts too.
 */
export function documentUploadType(file: {
  name: string;
  type: string;
}): DocumentUploadType | null {
  if (file.type === PDF_TYPE || file.type === DOCX_TYPE) return file.type;
  const ext = /\.([A-Za-z0-9]+)$/.exec(file.name)?.[1]?.toLowerCase();
  if (ext === "pdf") return PDF_TYPE;
  if (ext === "docx") return DOCX_TYPE;
  return null;
}
