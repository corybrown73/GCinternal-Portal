import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { _ as useNavigate, g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as supabase } from "./client-J2phZvXs.mjs";
import { n as Input, r as Label, t as Button } from "./label-BxvS4Y9r.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/login-CmGEK0j_.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function LoginPage() {
	const navigate = useNavigate();
	const [mode, setMode] = (0, import_react.useState)("internal");
	const [email, setEmail] = (0, import_react.useState)("");
	const [password, setPassword] = (0, import_react.useState)("");
	const [error, setError] = (0, import_react.useState)(null);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [linkSent, setLinkSent] = (0, import_react.useState)(false);
	async function signInInternal(e) {
		e.preventDefault();
		setError(null);
		setBusy(true);
		const { error } = await supabase.auth.signInWithPassword({
			email,
			password
		});
		setBusy(false);
		if (error) {
			setError(error.message === "Email not confirmed" ? "Your email isn't verified yet — check your inbox for the verification link." : "That email and password combination didn't work.");
			return;
		}
		navigate({ to: "/" });
	}
	async function sendCustomerLink(e) {
		e.preventDefault();
		setError(null);
		setBusy(true);
		const { error } = await supabase.auth.signInWithOtp({
			email,
			options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
		});
		setBusy(false);
		if (error) {
			setError("We couldn't send a link to that address. Check with your GoCanvas contact.");
			return;
		}
		setLinkSent(true);
	}
	const microsoftEnabled = {
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
	}["VITE_AUTH_MICROSOFT_ENABLED"] === "true";
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
					children: "Sales · Onboarding · Implementation"
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-md border border-border bg-card p-5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mb-4 grid grid-cols-2 gap-1 rounded-sm bg-muted p-0.5",
					children: [["internal", "GoCanvas team"], ["customer", "Customer"]].map(([m, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => {
							setMode(m);
							setError(null);
							setLinkSent(false);
						},
						className: `rounded-sm px-2 py-1.5 text-[13px] font-medium transition-colors ${mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`,
						children: label
					}, m))
				}), mode === "internal" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					onSubmit: signInInternal,
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
								autoComplete: "email",
								placeholder: "you@gocanvas.com",
								value: email,
								onChange: (e) => setEmail(e.target.value)
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
									htmlFor: "password",
									children: "Password"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
									to: "/forgot-password",
									className: "text-[11px] text-muted-foreground underline-offset-2 hover:underline",
									children: "Forgot password?"
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								id: "password",
								type: "password",
								required: true,
								autoComplete: "current-password",
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
							children: busy ? "Signing in…" : "Sign in"
						}),
						microsoftEnabled && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "outline",
							onClick: () => supabase.auth.signInWithOAuth({
								provider: "azure",
								options: {
									scopes: "email",
									redirectTo: `${window.location.origin}/auth/callback`
								}
							}),
							children: "Sign in with Microsoft"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-center text-[12px] text-muted-foreground",
							children: [
								"New here?",
								" ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
									to: "/signup",
									className: "text-foreground underline-offset-2 hover:underline",
									children: "Create an account"
								})
							]
						})
					]
				}) : linkSent ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "py-3 text-center",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[13px] font-medium",
						children: "Check your inbox"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-1 text-[12px] text-muted-foreground",
						children: [
							"If you have portal access, a sign-in link for ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: email }),
							" is on its way. It signs you straight in — no password needed."
						]
					})]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					onSubmit: sendCustomerLink,
					className: "flex flex-col gap-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[12px] text-muted-foreground",
							children: "Enter the email address your GoCanvas team invited, and we'll send you a one-click sign-in link."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
								htmlFor: "cust-email",
								children: "Email"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								id: "cust-email",
								type: "email",
								required: true,
								placeholder: "you@yourcompany.com",
								value: email,
								onChange: (e) => setEmail(e.target.value)
							})]
						}),
						error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[13px] text-destructive",
							children: error
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "submit",
							disabled: busy,
							children: busy ? "Sending…" : "Email me a sign-in link"
						})
					]
				})]
			})]
		})
	});
}
//#endregion
export { LoginPage as component };
