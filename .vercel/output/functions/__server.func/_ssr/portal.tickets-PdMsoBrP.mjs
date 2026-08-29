import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/portal.tickets-PdMsoBrP.js
var import_jsx_runtime = require_jsx_runtime();
var SplitErrorComponent = ({ error }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
	role: "alert",
	className: "rounded-md border border-border bg-card p-6 text-[13px]",
	children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "font-medium",
		children: "We couldn't load your requests."
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "mt-1 text-muted-foreground",
		children: error.message
	})]
});
//#endregion
export { SplitErrorComponent as errorComponent };
