import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/technical-solutions._id--T0CpUoz.js
var import_jsx_runtime = require_jsx_runtime();
var SplitNotFoundComponent = () => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
	className: "p-6 text-[13px]",
	children: [
		"That technical solution does not exist.",
		" ",
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
			to: "/technical-solutions",
			search: {
				sort: "customer",
				dir: "asc"
			},
			className: "underline",
			children: "Back to the queue"
		})
	]
});
//#endregion
export { SplitNotFoundComponent as notFoundComponent };
