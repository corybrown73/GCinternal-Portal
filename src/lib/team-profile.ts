/**
 * What a customer sees of the person running their onboarding: a name, a
 * title, a face, and a way to book time. Pure helpers; the record lives on
 * portal_profiles and the photo in the attachments bucket.
 */
export type TeamCard = {
  profileId: string;
  name: string;
  email: string | null;
  title: string | null;
  bookingUrl: string | null;
  bio: string | null;
  /** Signed, short-lived. Null when no photo has been uploaded. */
  photoUrl: string | null;
};

/** https only, trimmed; anything else is refused with a reason the person can act on. */
export function normalizeBookingUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let url: URL;
  try {
    url = new URL(s.includes("://") ? s : `https://${s}`);
  } catch {
    throw new Error("That does not look like a link. Paste the full scheduling URL.");
  }
  if (url.protocol !== "https:") throw new Error("The booking link has to start with https://");
  if (!url.hostname.includes(".")) throw new Error("The booking link needs a real domain.");
  return url.toString().replace(/\/$/, "");
}

/** "Cory Brown" → "Cory". For "book time with Cory". */
export function firstName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || "us";
}
