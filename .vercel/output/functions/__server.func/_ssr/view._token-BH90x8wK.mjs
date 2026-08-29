import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as useServerFn } from "./useServerFn-CrZF2pjq.mjs";
import { n as Route$9, nt as recordJourneyView } from "./router-DuzTz6dO.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/view._token-BH90x8wK.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/**
* PUBLIC tracked-link landing (AuthGate exempts /view). Records the view —
* which may advance the journey — then forwards the visitor to the real
* content URL. recordJourneyView never throws: on any failure it returns the
* app root so the visitor always lands somewhere.
*/
function ViewTokenPage() {
	const { token } = Route$9.useParams();
	const record = useServerFn(recordJourneyView);
	const [failed, setFailed] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		let cancelled = false;
		(async () => {
			try {
				const { url } = await record({ data: { token } });
				if (!cancelled) window.location.replace(url);
			} catch {
				if (!cancelled) setFailed(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [token]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-h-screen items-center justify-center bg-background px-4",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "text-center",
			children: failed ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] font-medium text-foreground",
				children: "This link didn't work"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-1 text-[12px] text-muted-foreground",
				children: [
					"It may have expired.",
					" ",
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						href: "/",
						className: "underline underline-offset-2",
						children: "Go to GoCanvas"
					})
				]
			})] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[14px] font-medium text-foreground",
				children: "Opening your content…"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground",
				children: "GoCanvas onboarding"
			})] })
		})
	});
}
//#endregion
export { ViewTokenPage as component };
