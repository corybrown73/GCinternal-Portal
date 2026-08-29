import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { i as fmtMoney } from "./hub-format--ProSxvQ.mjs";
import { r as useSuspenseQuery } from "../_libs/tanstack__react-query.mjs";
import { dn as cn, m as leadershipQuery, p as Route$17 } from "./router-BT3neubm.mjs";
import { n as PageBody, r as PageHeader } from "./page-wX17g2fe.mjs";
import { k as ArrowLeft, t as X } from "../_libs/lucide-react.mjs";
import { i as Panel, r as NoRows } from "./record-BXejhTdA.mjs";
import { d as ownerPortfolio, t as AccountRowList } from "./account-rows-AVdgXCys.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/owners._owner-Bi3TFshS.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var OWNER_FILTER_LABEL = {
	intervention: "Needs intervention",
	blocked: "Blocked",
	at_risk: "At risk",
	on_track: "On track"
};
var matchesOwnerFilter = (account, filter) => filter === "intervention" ? !!account.intervention : account.health === filter;
function Metric({ label, value, tone, active, onSelect }) {
	const body = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground",
		children: label
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: cn("mt-0.5 font-mono text-[18px] font-semibold leading-none", tone === "bad" && "text-status-blocked-foreground", tone === "warn" && "text-status-risk-foreground", tone === "good" && "text-status-on-track-foreground", tone === "muted" && "text-muted-foreground"),
		children: value
	})] });
	const base = "min-w-0 rounded-md border border-border bg-card px-3 py-2 text-left";
	if (!onSelect) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: base,
		children: body
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		onClick: onSelect,
		"aria-pressed": !!active,
		className: cn(base, "transition-colors hover:border-foreground/30 hover:bg-muted/50", active && "border-foreground/60 bg-secondary ring-1 ring-foreground/20"),
		children: body
	});
}
function OwnerPortfolioPage() {
	const { owner: ownerParam } = Route$17.useParams();
	const owner = decodeURIComponent(ownerParam);
	const { data } = useSuspenseQuery(leadershipQuery);
	const portfolio = ownerPortfolio(data, owner);
	const [filter, setFilter] = (0, import_react.useState)(null);
	if (!portfolio) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		title: owner,
		description: "No implementations are recorded against this person."
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageBody, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
		title: "What this person is carrying",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: "Nothing is currently assigned to this person." })
	}) })] });
	const accounts = filter ? portfolio.accounts.filter((a) => matchesOwnerFilter(a, filter)) : portfolio.accounts;
	const toggle = (id) => setFilter((cur) => cur === id ? null : id);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHeader, {
		title: portfolio.owner,
		description: "What this person is carrying and where they need help. Open a row for the full record.",
		actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
			to: "/portfolio",
			className: "flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, {
				className: "h-3 w-3",
				strokeWidth: 2
			}), "Leadership"]
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PageBody, {
		className: "space-y-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid gap-2 sm:grid-cols-3 lg:grid-cols-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
					label: "Active implementations",
					value: portfolio.implementations
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
					label: "ARR they cover",
					value: portfolio.arr != null ? fmtMoney(portfolio.arr) : "—",
					tone: "muted"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
					label: "Needs intervention",
					value: portfolio.intervention_count,
					tone: portfolio.intervention_count ? "bad" : "good",
					active: filter === "intervention",
					onSelect: () => toggle("intervention")
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
					label: "Blocked",
					value: portfolio.blocked,
					tone: portfolio.blocked ? "bad" : "muted",
					active: filter === "blocked",
					onSelect: () => toggle("blocked")
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
					label: "At risk",
					value: portfolio.at_risk,
					tone: portfolio.at_risk ? "warn" : "muted",
					active: filter === "at_risk",
					onSelect: () => toggle("at_risk")
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
					label: "On track",
					value: portfolio.on_track,
					tone: "good",
					active: filter === "on_track",
					onSelect: () => toggle("on_track")
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Panel, {
			title: filter ? `Accounts · ${OWNER_FILTER_LABEL[filter]}` : "Accounts",
			count: accounts.length,
			meta: filter ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
					"Filtered to ",
					OWNER_FILTER_LABEL[filter].toLowerCase(),
					" — same derivation that produced the card count"
				] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: () => setFilter(null),
					className: "flex shrink-0 items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] hover:border-foreground/40 hover:text-foreground",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, {
						className: "h-3 w-3",
						strokeWidth: 2
					}), "Clear filter"]
				})]
			}) : "Accounts needing help first · every figure comes from the saved record",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountRowList, {
				accounts,
				emptyLabel: filter ? `No ${OWNER_FILTER_LABEL[filter].toLowerCase()} accounts for this owner.` : "No accounts recorded for this owner."
			})
		})]
	})] });
}
//#endregion
export { OwnerPortfolioPage as component };
