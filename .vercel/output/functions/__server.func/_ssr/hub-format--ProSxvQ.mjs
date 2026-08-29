import { r as __exportAll } from "../_runtime.mjs";
import { a as PRE_HANDOFF_STAGE_LABELS, o as STAGE_ALIASES, r as LIFECYCLE_STAGE_MAP } from "./lifecycle-Cl8aBFg1.mjs";
import { n as __exportAll$1 } from "./server-c8UtrfAP2.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/hub-format--ProSxvQ.js
var hub_format__ProSxvQ_exports = /* @__PURE__ */ __exportAll({
	a: () => hub_format_exports,
	c: () => isPreHandoffStage,
	d: () => stageLabel,
	i: () => fmtMoney,
	l: () => normalizeStage,
	n: () => fmtDate,
	o: () => humanize,
	r: () => fmtDateTime,
	s: () => isOverdue,
	t: () => daysSince,
	u: () => stageIndex
});
var hub_format_exports = /* @__PURE__ */ __exportAll$1({
	STAGE_FLAG_DAYS: () => 14,
	daysSince: () => daysSince,
	fmtDate: () => fmtDate,
	fmtDateTime: () => fmtDateTime,
	fmtMoney: () => fmtMoney,
	humanize: () => humanize,
	isOverdue: () => isOverdue,
	isPreHandoffStage: () => isPreHandoffStage,
	normalizeStage: () => normalizeStage,
	stageIndex: () => stageIndex,
	stageLabel: () => stageLabel
});
function normalizeStage(raw) {
	if (!raw) return null;
	const key = raw.trim().toLowerCase().replace(/_/g, "-");
	if (key in LIFECYCLE_STAGE_MAP) return key;
	return STAGE_ALIASES[key] ?? null;
}
/** True when the value is an upstream (pre-handoff) step this app does not own. */
function isPreHandoffStage(raw) {
	if (!raw) return false;
	return raw.trim().toLowerCase().replace(/_/g, "-") in PRE_HANDOFF_STAGE_LABELS;
}
function stageLabel(raw) {
	const id = normalizeStage(raw);
	if (id) return LIFECYCLE_STAGE_MAP[id].label;
	if (!raw) return "—";
	return PRE_HANDOFF_STAGE_LABELS[raw.trim().toLowerCase().replace(/_/g, "-")] ?? raw;
}
function stageIndex(raw) {
	const id = normalizeStage(raw);
	if (!id) return -1;
	return Object.keys(LIFECYCLE_STAGE_MAP).indexOf(id);
}
function daysSince(iso) {
	if (!iso) return null;
	const ms = Date.now() - new Date(iso).getTime();
	return Math.max(0, Math.floor(ms / 864e5));
}
function isOverdue(due) {
	if (!due) return false;
	if (!due.includes("T")) return due.slice(0, 10) < (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
	return new Date(due).getTime() < Date.now();
}
function fmtDate(value) {
	if (!value) return "—";
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		timeZone: "UTC"
	});
}
function fmtDateTime(value) {
	if (!value) return "—";
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return "—";
	return `${fmtDate(value)} ${d.toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "UTC"
	})}`;
}
function fmtMoney(value) {
	if (value == null) return "—";
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 0
	}).format(value);
}
function humanize(value) {
	if (!value) return "—";
	return value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
//#endregion
export { hub_format__ProSxvQ_exports as a, isPreHandoffStage as c, stageLabel as d, fmtMoney as i, normalizeStage as l, fmtDate as n, humanize as o, fmtDateTime as r, isOverdue as s, daysSince as t, stageIndex as u };
