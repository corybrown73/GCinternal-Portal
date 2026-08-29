import { r as __exportAll } from "../_runtime.mjs";
import { n as __exportAll$1 } from "./server-c8UtrfAP2.mjs";
import { t as Resend } from "../_libs/resend+standardwebhooks.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/email-D82hv4FK.js
var email_D82hv4FK_exports = /* @__PURE__ */ __exportAll({
	n: () => sendEmail,
	t: () => email_exports
});
var email_exports = /* @__PURE__ */ __exportAll$1({ sendEmail: () => sendEmail });
async function sendEmail(opts) {
	if ((process.env["EMAIL_MODE"] ?? (process.env["RESEND_API_KEY"] ? "send" : "log")) !== "send") {
		console.log(`[email:log] to=${opts.to} subject=${JSON.stringify(opts.subject)}\n${opts.html}`);
		return { delivered: false };
	}
	const { error } = await new Resend(process.env["RESEND_API_KEY"]).emails.send({
		from: process.env["EMAIL_FROM"] ?? "GoCanvas Handoff Portal <onboarding@resend.dev>",
		to: opts.to,
		subject: opts.subject,
		html: opts.html
	});
	if (error) throw new Error(`Email send failed: ${error.message}`);
	return { delivered: true };
}
//#endregion
export { sendEmail as n, email_D82hv4FK_exports as t };
