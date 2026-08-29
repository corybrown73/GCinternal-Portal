//#region node_modules/.nitro/vite/services/ssr/assets/cron-auth-Y83P2Slf.js
async function authenticateCronRequest(request) {
	const currentSecret = process.env["LOVABLE_CRON_SECRET"];
	const previousSecret = process.env["LOVABLE_CRON_SECRET_PREVIOUS"];
	if (!currentSecret) return new Response("Server configuration error", { status: 500 });
	const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
	if (!token) return new Response("Unauthorized", { status: 401 });
	const { createHash, timingSafeEqual } = await import("node:crypto");
	const digest = (value) => createHash("sha256").update(value, "utf8").digest();
	const providedDigest = digest(token);
	const currentMatches = timingSafeEqual(providedDigest, digest(currentSecret));
	const previousMatches = timingSafeEqual(providedDigest, digest(previousSecret ?? currentSecret));
	if (!currentMatches && !previousMatches) return new Response("Unauthorized", { status: 401 });
	return null;
}
//#endregion
export { authenticateCronRequest };
