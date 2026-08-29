import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as supabase } from "./client-J2phZvXs.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/auth.callback-BmDfbpc7.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function AuthCallbackPage() {
	const [failed, setFailed] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		(async () => {
			const params = new URLSearchParams(window.location.search);
			const code = params.get("code");
			const next = params.get("next") ?? "/";
			if (code) {
				const { error } = await supabase.auth.exchangeCodeForSession(code);
				if (error) {
					setFailed(true);
					return;
				}
			} else {
				await new Promise((r) => setTimeout(r, 400));
				const { data } = await supabase.auth.getSession();
				if (!data.session) {
					setFailed(true);
					return;
				}
			}
			window.location.replace(next);
		})();
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-h-screen items-center justify-center bg-background px-4",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "text-center",
			children: failed ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] font-medium",
				children: "This link didn't work"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-1 text-[12px] text-muted-foreground",
				children: [
					"It may have expired or already been used.",
					" ",
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						href: "/login",
						className: "underline underline-offset-2",
						children: "Back to sign in"
					})
				]
			})] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] text-muted-foreground",
				children: "Signing you in…"
			})
		})
	});
}
//#endregion
export { AuthCallbackPage as component };
