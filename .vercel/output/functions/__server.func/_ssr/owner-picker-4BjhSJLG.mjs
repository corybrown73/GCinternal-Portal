import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/owner-picker-4BjhSJLG.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
/** Read a picked file into base64 so it can be handed to the server. */
async function fileToBase64(file) {
	const buffer = await file.arrayBuffer();
	const bytes = new Uint8Array(buffer);
	let binary = "";
	const chunk = 32768;
	for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	return btoa(binary);
}
var inputClass = "h-6 w-full rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var labelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
/**
* Ownership is picked in two steps: the team first, then a person from that
* team. Keeps the person list short and makes it obvious which team carries the
* work. No flat list of everyone.
*/
function OwnerPicker({ team, group, ownerId, disabled, onChange, personLabel = "Person" }) {
	const groups = (0, import_react.useMemo)(() => Array.from(new Set(team.map((t) => t.role))).sort((a, b) => a.localeCompare(b)), [team]);
	const people = (0, import_react.useMemo)(() => group ? team.filter((t) => t.role === group) : [], [team, group]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "block space-y-0.5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: labelClass,
			children: "Team"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
			className: inputClass,
			"aria-label": "Owning team",
			value: group,
			disabled,
			onChange: (e) => onChange({
				group: e.target.value,
				ownerId: ""
			}),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
				value: "",
				children: "Not chosen"
			}), groups.map((g) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
				value: g,
				children: g
			}, g))]
		})]
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "block space-y-0.5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: labelClass,
			children: personLabel
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
			className: inputClass,
			"aria-label": personLabel,
			value: ownerId,
			disabled: disabled || group === "",
			onChange: (e) => onChange({
				group,
				ownerId: e.target.value
			}),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
				value: "",
				children: group === "" ? "Choose a team first" : "Unassigned"
			}), people.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
				value: p.id,
				children: p.name
			}, p.id))]
		})]
	})] });
}
/** Team of the person currently assigned, so an existing owner prefills cleanly. */
function groupOf(team, ownerId) {
	if (!ownerId) return "";
	return team.find((t) => t.id === ownerId)?.role ?? "";
}
//#endregion
export { fileToBase64 as n, groupOf as r, OwnerPicker as t };
