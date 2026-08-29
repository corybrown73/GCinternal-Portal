import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

/**
 * Credentials for the external plan door.
 *
 * Three separate things, deliberately not one:
 *
 *  - the **link token** (`gcpl_…`), which identifies a grant. Hashed at rest,
 *    exactly like `portal_api_keys` (src/lib/server/api-auth.ts): the raw value
 *    exists only in the email we send and in the URL the recipient holds. It is
 *    never stored, never logged, never put in an audit payload.
 *  - the **passcode**, an optional second factor delivered out of band. scrypt,
 *    because it is a low-entropy human secret and a fast hash would make the
 *    5-attempt lockout the only thing standing between a leaked database and a
 *    working link.
 *  - the **session cookie**, a short-lived signed statement that this browser
 *    already proved both. It carries no authority of its own: every request
 *    re-reads the grant row, so revoking a grant kills live cookies.
 */

export const PLAN_TOKEN_PREFIX = "gcpl_";
export const SNAPSHOT_TOKEN_PREFIX = "gcps_";
export const PLAN_COOKIE = "gc_plan";
/** 24h. A viewer whose session lapses simply clicks their link again. */
export const PLAN_SESSION_TTL_SECONDS = 24 * 60 * 60;

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export type MintedToken = { token: string; hash: string; prefix: string };

function mint(prefix: string): MintedToken {
  const token = `${prefix}${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashToken(token), prefix: token.slice(0, 12) };
}

/** `gcpl_` + 32 random bytes, base64url so it is URL-safe by construction. */
export function generatePlanToken(): MintedToken {
  return mint(PLAN_TOKEN_PREFIX);
}

export function generateSnapshotToken(): MintedToken {
  return mint(SNAPSHOT_TOKEN_PREFIX);
}

/* ---------------------------------- passcode ---------------------------- */

const SCRYPT_KEYLEN = 32;

export function hashPasscode(passcode: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(passcode.normalize("NFKC"), salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPasscode(passcode: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  const derived = scryptSync(
    passcode.normalize("NFKC"),
    Buffer.from(saltHex, "hex"),
    expected.length,
  );
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/* ---------------------------------- session ----------------------------- */

function sessionSecret(): Uint8Array {
  const s = process.env["PLAN_SESSION_SECRET"];
  if (!s) throw new Error("PLAN_SESSION_SECRET is not set");
  return new TextEncoder().encode(s);
}

export type PlanSession = { grantId: string; passcodeVerified: boolean };

/**
 * `pc` records whether the passcode was actually entered in this session, so a
 * cookie minted before a passcode was set on the grant cannot be replayed to
 * skip it.
 */
export async function signPlanSession(session: PlanSession): Promise<string> {
  return await new SignJWT({ pc: session.passcodeVerified })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.grantId)
    .setIssuedAt()
    .setExpirationTime(`${PLAN_SESSION_TTL_SECONDS}s`)
    .sign(sessionSecret());
}

export async function verifyPlanSession(jwt: string | undefined): Promise<PlanSession | null> {
  if (!jwt) return null;
  try {
    const { payload } = await jwtVerify(jwt, sessionSecret());
    if (typeof payload.sub !== "string") return null;
    return { grantId: payload.sub, passcodeVerified: payload["pc"] === true };
  } catch {
    return null;
  }
}
