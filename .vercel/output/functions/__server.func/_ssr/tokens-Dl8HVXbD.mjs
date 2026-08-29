import { r as __exportAll } from "../_runtime.mjs";
import { n as __exportAll$1 } from "./server-c8UtrfAP2.mjs";
import { n as jwtVerify, t as SignJWT } from "../_libs/jose.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/tokens-Dl8HVXbD.js
var tokens_Dl8HVXbD_exports = /* @__PURE__ */ __exportAll({
	n: () => tokens_exports,
	t: () => signDecisionToken
});
var tokens_exports = /* @__PURE__ */ __exportAll$1({
	signDecisionToken: () => signDecisionToken,
	verifyDecisionToken: () => verifyDecisionToken
});
function secret() {
	const s = process.env["TAM_TOKEN_SECRET"];
	if (!s) throw new Error("TAM_TOKEN_SECRET is not set");
	return new TextEncoder().encode(s);
}
async function signDecisionToken(requestId, action, jti) {
	return await new SignJWT({ act: action }).setProtectedHeader({ alg: "HS256" }).setSubject(requestId).setJti(jti).setIssuedAt().setExpirationTime("7d").sign(secret());
}
async function verifyDecisionToken(token) {
	try {
		const { payload } = await jwtVerify(token, secret());
		if (typeof payload.sub !== "string" || typeof payload.jti !== "string" || payload["act"] !== "approve" && payload["act"] !== "decline") return null;
		return {
			requestId: payload.sub,
			action: payload["act"],
			jti: payload.jti
		};
	} catch {
		return null;
	}
}
//#endregion
export { tokens_Dl8HVXbD_exports as n, signDecisionToken as t };
