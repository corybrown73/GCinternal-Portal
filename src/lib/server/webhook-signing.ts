import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Outbound webhook signing and secret storage.
 *
 * Signing is Stripe-shaped on purpose: a Zapier code step can verify it in
 * eight lines, which is the whole reason this integration can exist without
 * Salesforce API access. The signed string is `"{timestamp}.{body}"` over the
 * exact bytes we send, so a receiver that re-serializes the JSON differently
 * still verifies.
 *
 * Secrets are the one place this codebase cannot reuse the API-key hash
 * pattern: HMAC needs the raw secret back, so it is encrypted (AES-256-GCM)
 * under `WEBHOOK_SIGNING_KEK` and stored in a table with RLS on and ZERO
 * policies — unreadable by every PostgREST principal, managers included. A
 * secret is shown once at creation and never returned by a read endpoint.
 */

export const SIGNATURE_HEADER = "x-gchub-signature";
export const EVENT_ID_HEADER = "x-gchub-event-id";
export const EVENT_TYPE_HEADER = "x-gchub-event-type";
export const TIMESTAMP_HEADER = "x-gchub-timestamp";

/** Tolerance a receiver should apply to the timestamp header. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function generateWebhookSecret(): { secret: string; last4: string } {
  const secret = `whsec_${randomBytes(32).toString("base64url")}`;
  return { secret, last4: secret.slice(-4) };
}

/** The exact body bytes we sign and send. Key order is fixed, not incidental. */
export function canonicalBody(event: {
  id: string;
  type: string;
  created_at: string;
  data: unknown;
}): string {
  return JSON.stringify({
    id: event.id,
    type: event.type,
    created_at: event.created_at,
    data: event.data,
  });
}

export function signPayload(secret: string, timestamp: number, body: string): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `v1=${mac}`;
}

/** Constant-time verification, for our own tests and for anyone porting the check. */
export function verifySignature(
  secret: string,
  timestamp: number,
  body: string,
  signature: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(signPayload(secret, timestamp, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

/* ------------------------------------------------------------ at-rest KEK */

function kek(): Buffer {
  const raw = process.env["WEBHOOK_SIGNING_KEK"];
  if (!raw) {
    throw new Error(
      "WEBHOOK_SIGNING_KEK is not set — webhook endpoint secrets cannot be encrypted or read.",
    );
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("WEBHOOK_SIGNING_KEK must decode to exactly 32 bytes (AES-256).");
  }
  return key;
}

/** `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function encryptSecret(plaintext: string, key: Buffer = kek()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(
    ".",
  );
}

export function decryptSecret(ciphertext: string, key: Buffer = kek()): string {
  const [version, ivB64, tagB64, ctB64] = ciphertext.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !ctB64) {
    throw new Error("Unrecognized webhook secret ciphertext");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Exponential-ish backoff, in minutes, indexed by attempt number (0-based). */
export const RETRY_BACKOFF_MINUTES = [1, 5, 30, 120, 360, 1440] as const;
export const MAX_DELIVERY_ATTEMPTS = RETRY_BACKOFF_MINUTES.length;

export function nextAttemptAt(attempt: number, from: Date = new Date()): Date | null {
  if (attempt >= MAX_DELIVERY_ATTEMPTS) return null;
  const minutes = RETRY_BACKOFF_MINUTES[attempt]!;
  return new Date(from.getTime() + minutes * 60_000);
}

/** Which endpoints want this event type. An empty subscription means "all". */
export function endpointWantsEvent(eventTypes: string[], eventType: string): boolean {
  if (eventTypes.length === 0) return true;
  return eventTypes.includes(eventType);
}
