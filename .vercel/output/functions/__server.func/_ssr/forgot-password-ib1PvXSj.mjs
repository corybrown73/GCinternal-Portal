import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as supabase } from "./client-J2phZvXs.mjs";
import { n as Input, r as Label, t as Button } from "./label-BxvS4Y9r.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/forgot-password-ib1PvXSj.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function ForgotPasswordPage() {
	const [email, setEmail] = (0, import_react.useState)("");
	const [newPassword, setNewPassword] = (0, import_react.useState)("");
	const [sent, setSent] = (0, import_react.useState)(false);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)(null);
	const [recoverySession, setRecoverySession] = (0, import_react.useState)(false);
	(0, import_react.useState)(() => {
		supabase.auth.getSession().then(({ data }) => {
			if (data.session && window.location.hash.includes("type=recovery")) setRecoverySession(true);
		});
	});
	async function requestReset(e) {
		e.preventDefault();
		setBusy(true);
		await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/forgot-password` });
		setBusy(false);
		setSent(true);
	}
	async function setPassword(e) {
		e.preventDefault();
		setError(null);
		if (newPassword.length < 12) {
			setError("Password must be at least 12 characters.");
			return;
		}
		setBusy(true);
		const { error } = await supabase.auth.updateUser({ password: newPassword });
		setBusy(false);
		if (error) {
			setError("Couldn't set the new password — the link may have expired. Request a new one.");
			return;
		}
		window.location.href = "/";
	}
	const showSetForm = recoverySession || window.location.search.includes("next=/forgot-password");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-h-screen items-center justify-center bg-background px-4",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "w-full max-w-sm",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-6 text-center",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-lg font-semibold tracking-tight",
					children: "GoCanvas Handoff Hub"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
					children: "Password reset"
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "rounded-md border border-border bg-card p-5",
				children: showSetForm ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					onSubmit: setPassword,
					className: "flex flex-col gap-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Label, {
								htmlFor: "new-password",
								children: ["New password ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-normal text-muted-foreground",
									children: "(12+ characters)"
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								id: "new-password",
								type: "password",
								required: true,
								minLength: 12,
								autoComplete: "new-password",
								value: newPassword,
								onChange: (e) => setNewPassword(e.target.value)
							})]
						}),
						error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[13px] text-destructive",
							children: error
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "submit",
							disabled: busy,
							children: busy ? "Saving…" : "Save password"
						})
					]
				}) : sent ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "py-3 text-center",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[13px] font-medium",
						children: "Check your inbox"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-1 text-[12px] text-muted-foreground",
						children: [
							"If an account exists for ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: email }),
							", a reset link is on its way."
						]
					})]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					onSubmit: requestReset,
					className: "flex flex-col gap-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
								htmlFor: "email",
								children: "Work email"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								id: "email",
								type: "email",
								required: true,
								value: email,
								onChange: (e) => setEmail(e.target.value)
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "submit",
							disabled: busy,
							children: busy ? "Sending…" : "Send reset link"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-center text-[12px]",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
								to: "/login",
								className: "text-muted-foreground underline-offset-2 hover:underline",
								children: "Back to sign in"
							})
						})
					]
				})
			})]
		})
	});
}
//#endregion
export { ForgotPasswordPage as component };
