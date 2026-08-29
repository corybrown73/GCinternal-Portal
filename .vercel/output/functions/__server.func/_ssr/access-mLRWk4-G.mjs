import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/access-mLRWk4-G.js
var import_jsx_runtime = require_jsx_runtime();
var SplitErrorComponent = ({ error }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
	role: "alert",
	className: "p-6 text-[13px] text-destructive",
	children: ["Could not load customer access: ", error.message]
});
//#endregion
export { SplitErrorComponent as errorComponent };
