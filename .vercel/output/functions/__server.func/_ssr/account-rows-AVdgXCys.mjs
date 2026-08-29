import { g as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { n as LIFECYCLE_STAGES } from "./lifecycle-Cl8aBFg1.mjs";
import { d as stageLabel, i as fmtMoney, l as normalizeStage, n as fmtDate, s as isOverdue, t as daysSince } from "./hub-format--ProSxvQ.mjs";
import { O as ArrowRight } from "../_libs/lucide-react.mjs";
import { c as StatusChip, r as NoRows, s as StageBadge } from "./record-BXejhTdA.mjs";
import { _ as proveValueGaps, a as adoptionSummary, d as launchStateConflict, m as openItems, r as WAITING_ON_LABEL, t as ADOPTION_LEVEL_LABEL, u as launchOverdue, v as proveValueState, x as waitingOn, y as severityRank } from "./customer360-derive-DgUfIdHQ.mjs";
import { i as graduationReadinessSummary, r as graduationReadiness } from "./graduation-readiness-DKDYA6-i.mjs";
import { n as healthByImplementation, r as triageRow, t as buildQueue } from "./home-triage-Cy00RQO2.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/account-rows-AVdgXCys.js
var import_jsx_runtime = require_jsx_runtime();
var DAY = 864e5;
var daysUntil = (date) => date ? Math.ceil((new Date(date).getTime() - Date.now()) / DAY) : null;
var bundleFor = (triage, id) => triage.find((t) => t.implementation_id === id);
function portfolioRollup(data) {
	const health = healthByImplementation(data.implementations, data.triage);
	const queue = buildQueue(data.implementations, data.triage);
	const counts = {
		blocked: 0,
		at_risk: 0,
		on_track: 0,
		no_signal: 0
	};
	for (const impl of data.implementations) {
		const level = health.get(impl.id)?.level;
		if (level) counts[level] += 1;
	}
	return {
		total: data.implementations.length,
		health: counts,
		act_now: queue.act_now.length,
		needs_attention: queue.needs_attention.length,
		moving: queue.moving.length,
		unassigned: data.implementations.filter((i) => !i.owner_name).length,
		owners: new Set(data.implementations.map((i) => i.owner_name).filter(Boolean)).size
	};
}
var LEADERSHIP_ACTION_LABEL = {
	assign_owner: "Assign an owner",
	join_customer_conversation: "Join the customer conversation",
	escalate_internally: "Escalate internally",
	rebaseline_launch: "Agree a new launch date",
	unblock_dependency: "Unblock the dependency",
	review_with_owner: "Review with the owner"
};
/**
* Maps an already-derived triage signal onto the management action a lead can
* take. Traceable to stored fields only: owner, severity, dependency party and
* launch dates.
*/
function leadershipAction(row, dependency, bundle) {
	const impl = row.impl;
	if (!impl.owner_name) return {
		action: "assign_owner",
		action_reason: "No implementation owner is recorded, so no one is accountable for the signal."
	};
	const open = openItems({
		commitments: bundle?.commitments ?? [],
		risks: bundle?.risks ?? [],
		issues: bundle?.issues ?? [],
		escalations: bundle?.escalations ?? []
	});
	const severeEscalation = open.escalations.find((e) => severityRank(e.severity) <= 1);
	if (severeEscalation) return {
		action: "escalate_internally",
		action_reason: `Open ${severeEscalation.severity} escalation "${severeEscalation.title}" needs a decision above the owner.`
	};
	if (launchOverdue(impl) || launchStateConflict(impl)) return {
		action: "rebaseline_launch",
		action_reason: launchOverdue(impl) ? "The target launch date has passed with no actual launch recorded — the date needs renegotiating." : "Stage is past Launch with no actual launch date, so the recorded plan and reality disagree."
	};
	if (dependency.party === "customer") return {
		action: "join_customer_conversation",
		action_reason: "The account is waiting on the customer; a lead-level conversation moves it."
	};
	if (dependency.party === "technical_solutions") return {
		action: "unblock_dependency",
		action_reason: "Progress depends on Technical Solutions work outside the owner's control."
	};
	const criticalRisk = open.risks.find((r) => severityRank(r.severity) === 0);
	if (criticalRisk) return {
		action: "escalate_internally",
		action_reason: `Critical risk "${criticalRisk.title}" is still open.`
	};
	return {
		action: "review_with_owner",
		action_reason: `${impl.owner_name} holds this; confirm the next action is happening.`
	};
}
/** Accounts a lead must step into: act-now, plus attention rows with lead-level causes. */
function interventions(data) {
	const queue = buildQueue(data.implementations, data.triage);
	const health = healthByImplementation(data.implementations, data.triage);
	return [...queue.act_now, ...queue.needs_attention.filter((r) => {
		const bundle = bundleFor(data.triage, r.impl.id);
		const open = openItems({
			commitments: bundle?.commitments ?? [],
			risks: bundle?.risks ?? [],
			issues: bundle?.issues ?? [],
			escalations: bundle?.escalations ?? []
		});
		return !r.impl.owner_name || open.escalations.length > 0 || open.risks.some((x) => severityRank(x.severity) <= 1) || launchOverdue(r.impl) || launchStateConflict(r.impl);
	})].map((row) => {
		const bundle = bundleFor(data.triage, row.impl.id);
		const dependency = waitingOn({
			technical_solutions: bundle?.technical_solutions ?? [],
			approvals: bundle?.approvals ?? [],
			commitments: bundle?.commitments ?? [],
			risks: bundle?.risks ?? [],
			issues: bundle?.issues ?? [],
			escalations: bundle?.escalations ?? [],
			decisions: bundle?.decisions ?? []
		});
		const { action, action_reason } = leadershipAction(row, dependency, bundle);
		return {
			row,
			health: health.get(row.impl.id)?.level ?? "no_signal",
			dependency,
			action,
			action_reason
		};
	});
}
function ownerLoad(data) {
	const health = healthByImplementation(data.implementations, data.triage);
	const queue = buildQueue(data.implementations, data.triage);
	const actNow = new Set(queue.act_now.map((r) => r.impl.id));
	const groups = /* @__PURE__ */ new Map();
	for (const impl of data.implementations) {
		const key = impl.owner_name ?? "Unassigned";
		groups.set(key, [...groups.get(key) ?? [], impl]);
	}
	const rows = [...groups.entries()].map(([owner, impls]) => {
		const arrValues = impls.map((i) => i.arr).filter((v) => v != null);
		const blocked = impls.filter((i) => health.get(i.id)?.level === "blocked").length;
		const at_risk = impls.filter((i) => health.get(i.id)?.level === "at_risk").length;
		const act = impls.filter((i) => actNow.has(i.id)).length;
		return {
			owner,
			unassigned: owner === "Unassigned",
			implementations: impls,
			act_now: act,
			blocked,
			at_risk,
			arr: arrValues.length ? arrValues.reduce((a, b) => a + b, 0) : null,
			launches_30d: impls.filter((i) => {
				const d = daysUntil(i.target_launch_date);
				return !i.actual_launch_date && d != null && d >= 0 && d <= 30;
			}).length,
			flags: []
		};
	});
	const totalBlocked = rows.reduce((n, r) => n + r.blocked, 0);
	for (const r of rows) {
		if (r.unassigned) r.flags.push("No owner recorded — assign before anything else");
		if (r.act_now > 1) r.flags.push(`Carrying ${r.act_now} act-now accounts alone`);
		if (r.blocked > 0 && r.blocked === totalBlocked && totalBlocked > 0 && !r.unassigned) r.flags.push("Holds every blocked account in the portfolio");
		if (r.launches_30d > 1) r.flags.push(`${r.launches_30d} launches inside 30 days`);
	}
	return rows.sort((a, b) => b.act_now - a.act_now || b.blocked + b.at_risk - (a.blocked + a.at_risk) || b.implementations.length - a.implementations.length || a.owner.localeCompare(b.owner));
}
function stageDistribution(data) {
	return LIFECYCLE_STAGES.map((stage) => {
		const impls = data.implementations.filter((i) => normalizeStage(i.current_stage) === stage.id);
		const dwell = impls.map((i) => ({
			days: daysSince(i.stage_entered_at) ?? 0,
			customer: i.customer_name
		})).sort((a, b) => b.days - a.days)[0];
		return {
			id: stage.id,
			label: stage.label,
			phase: stage.phase,
			implementations: impls,
			longest_dwell_days: dwell ? dwell.days : null,
			longest_dwell_customer: dwell ? dwell.customer : null,
			over_flag: impls.filter((i) => (daysSince(i.stage_entered_at) ?? 0) > 14).length
		};
	});
}
/** Observed dwell across completed transitions only. Not a benchmark or target. */
function completedStageDwell(history) {
	const byStage = /* @__PURE__ */ new Map();
	for (const row of history) {
		if (!row.exited_at || !row.entered_at) continue;
		const days = Math.max(0, Math.round((new Date(row.exited_at).getTime() - new Date(row.entered_at).getTime()) / DAY));
		const label = stageLabel(row.stage);
		byStage.set(label, [...byStage.get(label) ?? [], days]);
	}
	return [...byStage.entries()].map(([stage, values]) => ({
		stage,
		transitions: values.length,
		shortest_days: Math.min(...values),
		longest_days: Math.max(...values)
	})).sort((a, b) => b.longest_days - a.longest_days);
}
/**
* The individual completed transitions behind one row of observed dwell. Same
* filter and same day arithmetic as completedStageDwell — grouping only, so the
* dwell figures cannot drift from what is listed here.
*/
function completedTransitions(data, stage) {
	return data.stage_history.filter((h) => h.entered_at && h.exited_at && stageLabel(h.stage) === stage).map((h, i) => ({
		key: `${h.implementation_id}-${h.entered_at}-${i}`,
		impl: data.implementations.find((impl) => impl.id === h.implementation_id) ?? null,
		stage: stageLabel(h.stage),
		entered_at: h.entered_at,
		exited_at: h.exited_at,
		days: Math.max(0, Math.round((new Date(h.exited_at).getTime() - new Date(h.entered_at).getTime()) / DAY))
	})).sort((a, b) => b.days - a.days);
}
function launchBoard(data) {
	const byArr = (a, b) => (b.impl.arr ?? 0) - (a.impl.arr ?? 0) || String(a.impl.target_launch_date).localeCompare(String(b.impl.target_launch_date));
	const slipped = [];
	const landing = [];
	const conflict = [];
	for (const impl of data.implementations) {
		const d = daysUntil(impl.target_launch_date);
		if (launchOverdue(impl)) slipped.push({
			impl,
			detail: `${Math.abs(d ?? 0)}d past target, no actual launch recorded`
		});
		else if (!impl.actual_launch_date && d != null && d >= 0 && d <= 30) landing.push({
			impl,
			detail: `${d}d to target launch`
		});
		if (launchStateConflict(impl)) conflict.push({
			impl,
			detail: `Stage ${stageLabel(impl.current_stage)} is past Launch but no actual launch date is recorded`
		});
	}
	return {
		slipped: slipped.sort(byArr),
		landing_30d: landing.sort(byArr),
		conflict: conflict.sort(byArr)
	};
}
function valueCoverage(data) {
	const rows = data.implementations.map((impl) => {
		const criteria = bundleFor(data.triage, impl.id)?.success_criteria ?? [];
		const baselined = criteria.filter((c) => String(c.baseline_value ?? "").trim()).length;
		const observed = criteria.filter((c) => (c.observations ?? []).length > 0).length;
		const confirmed = criteria.filter((c) => proveValueState(c, c.observations ?? [], c.confirmations ?? []) === "customer_confirmed").length;
		const late = proveValueGaps(criteria, impl.current_stage).length;
		return {
			impl,
			criteria: criteria.length,
			baselined,
			observed,
			confirmed,
			late,
			summary: criteria.length ? `${baselined}/${criteria.length} baselined · ${observed}/${criteria.length} observed · ${confirmed} confirmed` : "No measurable success criteria recorded"
		};
	});
	return {
		rows: rows.sort((a, b) => a.criteria - b.criteria || b.late - a.late || a.observed / (a.criteria || 1) - b.observed / (b.criteria || 1) || a.impl.customer_name.localeCompare(b.impl.customer_name)),
		no_criteria: rows.filter((r) => r.criteria === 0).length,
		total: rows.length
	};
}
/** Restricted to implementations at or past Build — adoption is meaningless earlier. */
function adoptionCoverage(data) {
	const buildIdx = LIFECYCLE_STAGES.findIndex((s) => s.id === "build");
	return data.implementations.filter((i) => {
		const id = normalizeStage(i.current_stage);
		return id != null && LIFECYCLE_STAGES.findIndex((s) => s.id === id) >= buildIdx;
	}).map((impl) => {
		const areas = bundleFor(data.triage, impl.id)?.adoption ?? [];
		const summary = adoptionSummary(areas);
		const observed = areas.filter((a) => (a.observations ?? []).length > 0).length;
		const level = summary?.level ?? "unknown";
		return {
			impl,
			areas: areas.length,
			observed,
			workarounds: summary?.workarounds.length ?? 0,
			level,
			level_label: ADOPTION_LEVEL_LABEL[level]
		};
	}).sort((a, b) => a.observed - b.observed || b.areas - a.areas || a.impl.customer_name.localeCompare(b.impl.customer_name));
}
var STALE_DAYS = 14;
function stuckWork(data) {
	const items = [];
	for (const impl of data.implementations) {
		const bundle = bundleFor(data.triage, impl.id);
		if (!bundle) continue;
		const open = openItems({
			commitments: bundle.commitments,
			risks: bundle.risks,
			issues: bundle.issues,
			escalations: bundle.escalations
		});
		const push = (kind, row, title, at, overdue = false) => {
			const age = daysSince(at);
			items.push({
				key: `${kind}-${row.id}`,
				kind,
				title,
				customer_name: impl.customer_name,
				customer_id: impl.customer_id,
				owner_name: row.owner_name ?? null,
				severity: row.severity ?? null,
				age_days: age,
				overdue,
				unowned: !row.owner_name,
				stale: (age ?? 0) > STALE_DAYS,
				rank: (kind === "escalation" ? 0 : kind === "issue" ? 1 : kind === "risk" ? 1 : 2) + severityRank(row.severity) / 10
			});
		};
		for (const e of open.escalations) push("escalation", e, e.title, e.raised_at);
		for (const r of open.risks) push("risk", r, r.title, r.identified_at);
		for (const i of open.issues) push("issue", i, i.title, i.raised_at);
		for (const c of open.commitments) push("commitment", c, c.description, c.made_at, isOverdue(c.due_date));
		for (const d of bundle.decisions.filter((x) => [
			"proposed",
			"pending",
			"open",
			"under_review"
		].includes(String(x.status ?? "").toLowerCase()))) push("decision", d, d.title, d.created_at);
	}
	return items.filter((i) => i.unowned || i.stale || i.overdue || i.kind === "escalation").sort((a, b) => a.rank - b.rank || (b.age_days ?? 0) - (a.age_days ?? 0));
}
function graduationGate(data) {
	const rows = [];
	for (const candidate of data.graduation_candidates) {
		const impl = data.implementations.find((i) => i.id === candidate.implementation_id);
		if (!impl) continue;
		const areas = graduationReadiness(candidate.record, {
			current_stage: impl.current_stage,
			actual_launch_date: impl.actual_launch_date,
			target_launch_date: impl.target_launch_date
		});
		rows.push({
			impl,
			areas,
			summary: graduationReadinessSummary(areas)
		});
	}
	return rows.sort((a, b) => b.summary.attention - a.summary.attention || a.impl.customer_name.localeCompare(b.impl.customer_name));
}
/**
* Groups already-derived triage, health and intervention results for one owner.
* No new metric, score or forecast — "Unassigned" is never a valid owner here.
*/
function ownerPortfolio(data, owner) {
	const impls = data.implementations.filter((i) => i.owner_name === owner);
	if (!owner || !impls.length) return null;
	const accounts = accountRows(data, impls);
	const arrValues = impls.map((i) => i.arr).filter((v) => v != null);
	return {
		owner,
		implementations: impls.length,
		arr: arrValues.length ? arrValues.reduce((a, b) => a + b, 0) : null,
		intervention_count: accounts.filter((a) => a.intervention).length,
		blocked: accounts.filter((a) => a.health === "blocked").length,
		at_risk: accounts.filter((a) => a.health === "at_risk").length,
		on_track: accounts.filter((a) => a.health === "on_track").length,
		accounts
	};
}
/**
* Presentation helper: wraps a set of implementations in their already-derived
* triage row, health level and intervention row, intervention accounts first.
*/
function accountRows(data, impls) {
	const health = healthByImplementation(data.implementations, data.triage);
	const interventionByImpl = new Map(interventions(data).map((r) => [r.row.impl.id, r]));
	return impls.map((impl) => ({
		row: triageRow(impl, bundleFor(data.triage, impl.id)),
		health: health.get(impl.id)?.level ?? "no_signal",
		intervention: interventionByImpl.get(impl.id) ?? null
	})).sort((a, b) => Number(!!b.intervention) - Number(!!a.intervention) || a.row.rank - b.row.rank || a.row.impl.customer_name.localeCompare(b.row.impl.customer_name));
}
var PORTFOLIO_FILTER_LABEL = {
	act_now: "Act now",
	needs_attention: "Needs attention",
	blocked: "Blocked",
	at_risk: "At risk",
	on_track: "On track",
	unassigned: "Unassigned"
};
/**
* Returns the exact accounts counted by a roll-up card, using the same
* derivations (buildQueue / healthByImplementation / owner_name) that produced
* the count. Categories may overlap; no new rule is applied here.
*/
function portfolioFilterAccounts(data, filter) {
	const queue = buildQueue(data.implementations, data.triage);
	const health = healthByImplementation(data.implementations, data.triage);
	return accountRows(data, data.implementations.filter((impl) => {
		switch (filter) {
			case "act_now": return queue.act_now.some((r) => r.impl.id === impl.id);
			case "needs_attention": return queue.needs_attention.some((r) => r.impl.id === impl.id);
			case "unassigned": return !impl.owner_name;
			default: return health.get(impl.id)?.level === filter;
		}
	}));
}
function MetaLine({ label, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: "min-w-0 text-[11px] leading-relaxed text-muted-foreground",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "mr-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70",
			children: label
		}), children]
	});
}
/**
* The single account row used everywhere a list of accounts appears — leadership
* filters, stage drill-downs and owner portfolios. Existing derived triage,
* health and intervention fields only, linking through to the account record.
*/
function AccountRowList({ accounts, showOwner, showDaysInStage, emptyLabel = "No accounts match this filter." }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
		className: "divide-y divide-border",
		children: [accounts.map(({ row, health, intervention }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
			className: "px-3 py-3 hover:bg-muted/60",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center gap-x-2.5 gap-y-1.5",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusChip, { status: health }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/customers/$customerId",
							params: { customerId: row.impl.customer_id },
							search: { tab: row.tab },
							className: "text-[13px] font-semibold tracking-tight hover:underline",
							children: row.impl.customer_name
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StageBadge, { stage: row.impl.current_stage }),
						showOwner ? row.impl.owner_name ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/owners/$owner",
							params: { owner: row.impl.owner_name },
							className: "font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline",
							children: row.impl.owner_name
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-mono text-[11px] text-destructive",
							children: "Unassigned"
						}) : null,
						showDaysInStage ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "font-mono text-[11px] text-muted-foreground",
							children: [daysSince(row.impl.stage_entered_at) ?? 0, "d in stage"]
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "font-mono text-[11px] text-muted-foreground",
							children: [row.impl.arr != null ? `${fmtMoney(row.impl.arr)} ARR` : "ARR not recorded", row.impl.target_launch_date ? ` · launch ${fmtDate(row.impl.target_launch_date)}` : ""]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
							to: "/customers/$customerId",
							params: { customerId: row.impl.customer_id },
							search: { tab: row.tab },
							className: "ml-auto flex shrink-0 items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline",
							children: [row.tab, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, {
								className: "h-3 w-3",
								strokeWidth: 2
							})]
						})
					]
				}),
				intervention ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-[13px] font-semibold leading-snug tracking-tight",
					children: LEADERSHIP_ACTION_LABEL[intervention.action]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-0.5 text-[12px] leading-snug text-muted-foreground",
					children: intervention.action_reason
				})] }) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-2 grid gap-x-8 gap-y-1 border-l-2 border-border pl-2.5 sm:grid-cols-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetaLine, {
							label: "Why",
							children: row.reason
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetaLine, {
							label: "Next",
							children: row.next_action
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetaLine, {
							label: "Impact",
							children: row.impact
						}),
						intervention ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(MetaLine, {
							label: "Waiting on",
							children: [
								WAITING_ON_LABEL[intervention.dependency.party],
								" —",
								" ",
								intervention.dependency.reason
							]
						}) : null
					]
				})
			]
		}, row.impl.id)), accounts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoRows, { label: emptyLabel }) : null]
	});
}
//#endregion
export { completedStageDwell as a, interventions as c, ownerPortfolio as d, portfolioFilterAccounts as f, valueCoverage as g, stuckWork as h, adoptionCoverage as i, launchBoard as l, stageDistribution as m, PORTFOLIO_FILTER_LABEL as n, completedTransitions as o, portfolioRollup as p, accountRows as r, graduationGate as s, AccountRowList as t, ownerLoad as u };
