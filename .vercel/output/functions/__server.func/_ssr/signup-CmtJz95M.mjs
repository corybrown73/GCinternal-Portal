import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as supabase } from "./client-J2phZvXs.mjs";
import { n as Input, r as Label, t as Button } from "./label-BxvS4Y9r.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/signup-CmtJz95M.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function SignupPage() {
	const [fullName, setFullName] = (0, import_react.useState)("");
	const [email, setEmail] = (0, import_react.useState)("");
	const [password, setPassword] = (0, import_react.useState)("");
	const [error, setError] = (0, import_react.useState)(null);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [sent, setSent] = (0, import_react.useState)(false);
	async function onSubmit(e) {
		e.preventDefault();
		setError(null);
		const allowed = ({
			"BASE_URL": "/",
			"DEV": false,
			"MODE": "production",
			"PROD": true,
			"SSR": true,
			"TSS_DEV_SERVER": "false",
			"TSS_DEV_SSR_STYLES_BASEPATH": "/",
			"TSS_DEV_SSR_STYLES_ENABLED": "true",
			"TSS_DISABLE_CSRF_MIDDLEWARE_WARNING": "false",
			"TSS_INLINE_CSS_ENABLED": "false",
			"TSS_ROUTER_BASEPATH": "",
			"TSS_SERVER_FN_BASE": "/_serverFn/",
			"VITE_ALLOWED_EMAIL_DOMAINS": "gocanvas.com",
			"VITE_AUTH_MICROSOFT_ENABLED": "false",
			"VITE_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_WINyOQ8YFqFiidIZ-feWcg_S1EbrFeW",
			"VITE_SUPABASE_URL": "https://wynvngnbjasiuxkcfofu.supabase.co"
		}["VITE_ALLOWED_EMAIL_DOMAINS"] ?? "gocanvas.com").split(",").map((d) => d.trim().toLowerCase());
		const domain = email.split("@")[1]?.toLowerCase();
		if (!domain || !allowed.includes(domain)) {
			setError(`Signups are limited to ${allowed.map((d) => "@" + d).join(", ")} addresses. Customers are invited by their GoCanvas team instead.`);
			return;
		}
		if (password.length < 12) {
			setError("Password must be at least 12 characters.");
			return;
		}
		setBusy(true);
		const { error } = await supabase.auth.signUp({
			email,
			password,
			options: {
				data: { full_name: fullName },
				emailRedirectTo: `${window.location.origin}/auth/callback`
			}
		});
		setBusy(false);
		if (error) {
			setError(error.message.includes("restricted") ? "Signups are restricted to approved email domains." : error.message);
			return;
		}
		setSent(true);
	}
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
					children: "Create your team account"
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "rounded-md border border-border bg-card p-5",
				children: sent ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "py-3 text-center",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[13px] font-medium",
							children: "Check your inbox"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1 text-[12px] text-muted-foreground",
							children: [
								"We sent a verification link to ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: email }),
								". Click it, then sign in."
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/login",
							className: "mt-3 inline-block text-[12px] text-foreground underline-offset-2 hover:underline",
							children: "Back to sign in"
						})
					]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					onSubmit,
					className: "flex flex-col gap-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
								htmlFor: "name",
								children: "Full name"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								id: "name",
								required: true,
								value: fullName,
								onChange: (e) => setFullName(e.target.value)
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
								htmlFor: "email",
								children: "Work email"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								id: "email",
								type: "email",
								required: true,
								placeholder: "you@gocanvas.com",
								value: email,
								onChange: (e) => setEmail(e.target.value)
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Label, {
								htmlFor: "password",
								children: ["Password ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "font-normal text-muted-foreground",
									children: "(12+ characters)"
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								id: "password",
								type: "password",
								required: true,
								minLength: 12,
								autoComplete: "new-password",
								value: password,
								onChange: (e) => setPassword(e.target.value)
							})]
						}),
						error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[13px] text-destructive",
							children: error
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "submit",
							disabled: busy,
							className: "mt-1",
							children: busy ? "Creating…" : "Create account"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-center text-[12px] text-muted-foreground",
							children: [
								"Already have an account?",
								" ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
									to: "/login",
									className: "text-foreground underline-offset-2 hover:underline",
									children: "Sign in"
								})
							]
						})
					]
				})
			})]
		})
	});
}
//#endregion
export { SignupPage as component };
