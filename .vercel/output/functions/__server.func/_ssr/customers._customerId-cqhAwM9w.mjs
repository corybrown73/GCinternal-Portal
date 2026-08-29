import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/customers._customerId-cqhAwM9w.js
var import_jsx_runtime = require_jsx_runtime();
/**
* Every implementation this customer has. Selecting one reloads this page for
* that record — each keeps its own stage, owner, dates and notes.
*/
/** Prove Value presentation for one success criterion, with observation + confirmation writes. */
/** Adoption presentation for one intended user group / workflow. */
var SplitNotFoundComponent = () => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
	className: "p-6 text-[13px]",
	children: [
		"Customer not found.",
		" ",
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
			to: "/customers",
			search: {
				sort: "days",
				dir: "desc"
			},
			className: "underline",
			children: "Back to customers"
		})
	]
});
//#endregion
export { SplitNotFoundComponent as notFoundComponent };
