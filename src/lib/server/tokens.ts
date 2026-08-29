import { SignJWT, jwtVerify } from "jose";

export type DecisionAction = "approve" | "decline";

function secret(): Uint8Array {
  const s = process.env["TAM_TOKEN_SECRET"];
  if (!s) throw new Error("TAM_TOKEN_SECRET is not set");
  return new TextEncoder().encode(s);
}

// The action lives INSIDE the signed payload — never a query param — so a
// tampered link fails verification instead of flipping the decision.
export async function signDecisionToken(
  requestId: string,
  action: DecisionAction,
  jti: string,
): Promise<string> {
  return await new SignJWT({ act: action })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(requestId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function verifyDecisionToken(
  token: string,
): Promise<{ requestId: string; action: DecisionAction; jti: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (
      typeof payload.sub !== "string" ||
      typeof payload.jti !== "string" ||
      (payload["act"] !== "approve" && payload["act"] !== "decline")
    ) {
      return null;
    }
    return { requestId: payload.sub, action: payload["act"], jti: payload.jti };
  } catch {
    return null;
  }
}
