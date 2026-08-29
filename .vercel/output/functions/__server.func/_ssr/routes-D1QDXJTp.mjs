import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-D1QDXJTp.js
var import_jsx_runtime = require_jsx_runtime();
var SplitErrorComponent = ({ error }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
	role: "alert",
	className: "p-6 text-[13px] text-destructive",
	children: ["We couldn't load today's list: ", error.message]
});
//#endregion
export { SplitErrorComponent as errorComponent };
