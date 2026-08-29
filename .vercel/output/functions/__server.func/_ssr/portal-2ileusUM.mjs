import { f as Outlet, g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { i as useQuery } from "../_libs/tanstack__react-query.mjs";
import { l as portalHomeQuery, z as signOut } from "./router-DuzTz6dO.mjs";
import { m as LogOut } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/portal-2ileusUM.js
var import_jsx_runtime = require_jsx_runtime();
/**
* Customer portal shell: minimal top bar, no internal sidebar. Warmer and
* simpler than the hub, same token system.
*/
function PortalLayout() {
	const { data } = useQuery(portalHomeQuery);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex min-h-screen flex-col bg-background text-foreground",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
				className: "sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto flex h-12 w-full max-w-4xl items-center justify-between px-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: "/portal",
						className: "flex items-baseline gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[14px] font-semibold tracking-tight text-primary",
							children: "GoCanvas"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "text-[13px] text-muted-foreground",
							children: ["· ", data?.customer_name ?? "Customer portal"]
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
						className: "flex items-center gap-1",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
								to: "/portal",
								activeOptions: { exact: true },
								activeProps: { className: "bg-surface text-foreground" },
								className: "rounded-sm px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground",
								children: "Progress"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
								to: "/portal/tickets",
								activeProps: { className: "bg-surface text-foreground" },
								className: "rounded-sm px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground",
								children: "Help"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => void signOut(),
								className: "ml-2 inline-flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogOut, { className: "h-3 w-3" }), " Sign out"]
							})
						]
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
				className: "mx-auto w-full max-w-4xl flex-1 px-4 py-6",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("footer", {
				className: "border-t border-border py-4",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mx-auto max-w-4xl px-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
					children: "GoCanvas onboarding portal"
				})
			})
		]
	});
}
//#endregion
export { PortalLayout as component };
