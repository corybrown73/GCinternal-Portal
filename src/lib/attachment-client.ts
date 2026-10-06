function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Read a picked file into base64 so it can be handed to the server. */
export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return bytesToBase64(new Uint8Array(buffer));
}

/** Encode a pasted string into base64, safe for non-ASCII text (plain `btoa` is not). */
export function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

export const MAX_ATTACHMENT_BYTES = 4_500_000;
