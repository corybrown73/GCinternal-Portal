import { f as Outlet } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { B as useProfile, R as isSuperAdmin } from "./router-BT3neubm.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/admin-1AW8RTIa.js
var import_jsx_runtime = require_jsx_runtime();
/**
* Client-side gate only decides what to render — every admin serverFn
* independently re-checks the caller's role server-side.
*/
function AdminLayout() {
	const { profile, loading } = useProfile();
	if (loading) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "p-6",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "font-mono text-[11px] uppercase tracking-wider text-muted-foreground",
			children: "Loading…"
		})
	});
	if (!isSuperAdmin(profile?.role)) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "p-6",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "rounded-md border border-dashed border-border bg-card px-6 py-10 text-center",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] font-medium",
				children: "Super admin only"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mx-auto mt-1.5 max-w-md text-[13px] text-muted-foreground",
				children: "This area manages API keys, user roles and routing. Ask a super admin if you need a change made here."
			})]
		})
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {});
}
//#endregion
export { AdminLayout as component };
