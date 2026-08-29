import { n as LIFECYCLE_STAGES, r as LIFECYCLE_STAGE_MAP } from "./lifecycle-Cl8aBFg1.mjs";
import { d as stageLabel, l as normalizeStage, n as fmtDate, o as humanize, s as isOverdue, t as daysSince, u as stageIndex } from "./hub-format--ProSxvQ.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/customer360-derive-DgUfIdHQ.js
var NEXT_ACTION_UNKNOWN = "Next action not recorded";
var SEVERITY_RANK = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3
};
function severityRank(value) {
	return SEVERITY_RANK[(value ?? "").toLowerCase()] ?? 4;
}
var isOpen = (status) => ![
	"resolved",
	"closed",
	"fulfilled",
	"cancelled",
	"mitigated",
	"accepted",
	"done"
].includes((status ?? "").toLowerCase());
function openItems(record) {
	return {
		commitments: record.commitments.filter((c) => isOpen(c.status)),
		risks: record.risks.filter((r) => isOpen(r.status)),
		issues: record.issues.filter((r) => isOpen(r.status)),
		escalations: record.escalations.filter((r) => isOpen(r.status))
	};
}
/** "What matters now": most severe live escalation, then risk, then issue. */
function whatMattersNow(record) {
	const open = openItems(record);
	const bySeverity = (rows) => [...rows].sort((a, b) => severityRank(a.severity) - severityRank(b.severity))[0];
	const esc = bySeverity(open.escalations);
	if (esc) return `Escalation (${esc.severity}): ${esc.title}`;
	const risk = bySeverity(open.risks);
	if (risk) return `Risk (${risk.severity}/${risk.likelihood} likelihood): ${risk.title}`;
	const issue = bySeverity(open.issues);
	if (issue) return `Issue (${issue.severity}): ${issue.title}`;
	const overdue = open.commitments.filter((c) => isOverdue(c.due_date));
	if (overdue.length) return `${overdue.length} overdue commitment(s), nothing escalated`;
	return "No open escalations, risks or issues.";
}
/** "Next action": nearest overdue/upcoming commitment, else an undecided decision. */
function nextAction(record, impl) {
	const open = openItems(record);
	const dated = open.commitments.filter((c) => c.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date));
	const overdue = dated.filter((c) => isOverdue(c.due_date));
	if (overdue.length) {
		const c = overdue[0];
		return `Close out the overdue commitment — ${c.description} (due ${fmtDate(c.due_date)}${c.owner_name ? `, ${c.owner_name}` : ""})`;
	}
	if (dated.length) {
		const c = dated[0];
		return `Deliver the commitment — ${c.description} (due ${fmtDate(c.due_date)}${c.owner_name ? `, ${c.owner_name}` : ""})`;
	}
	const pending = record.decisions.find((d) => [
		"pending",
		"proposed",
		"open"
	].includes((d.status ?? "").toLowerCase()));
	if (pending) return `Resolve the open decision — ${pending.title}`;
	const undated = open.commitments[0];
	if (undated) return `Schedule the commitment — ${undated.description} (no due date set)`;
	if (impl && launchOverdue(impl)) return `Launch date has passed (${fmtDate(impl.target_launch_date)}) — needs a launch review and replan`;
	return NEXT_ACTION_UNKNOWN;
}
/** Target launch date has passed with no actual launch recorded. */
function launchOverdue(impl) {
	return Boolean(!impl.actual_launch_date && impl.target_launch_date && isOverdue(impl.target_launch_date));
}
/**
* True when the only reason to surface an implementation would be plain steady-state
* tenure. Phase-based rather than id-based so the Graduate + CS merge keeps working.
*/
function isCsStage(stage) {
	const id = normalizeStage(stage);
	return id ? LIFECYCLE_STAGE_MAP[id].phase === "steady-state" : false;
}
/** Any open signal that justifies surfacing a long-tenured CS implementation. */
function hasOtherOpenSignal(record) {
	const open = openItems(record);
	return open.risks.length > 0 || open.issues.length > 0 || open.escalations.length > 0 || open.commitments.some((c) => c.due_date && isOverdue(c.due_date));
}
function progress(stage) {
	const idx = stageIndex(stage);
	const total = LIFECYCLE_STAGES.length;
	return {
		index: idx + 1,
		total,
		pct: idx < 0 ? 0 : (idx + 1) / total * 100
	};
}
/** Same rule triage uses for a milestone that has slipped. */
function milestoneMissed(m) {
	const status = (m.status ?? "").toLowerCase();
	return !m.completed_date && ([
		"missed",
		"overdue",
		"blocked"
	].includes(status) || m.target_date != null && isOverdue(m.target_date) && status !== "completed");
}
function deriveHealth(record, impl) {
	const open = openItems(record);
	const milestones = record.milestones ?? [];
	const bySeverity = (rows) => [...rows].sort((a, b) => severityRank(a.severity) - severityRank(b.severity))[0];
	const esc = bySeverity(open.escalations);
	if (esc && severityRank(esc.severity) <= 1) return {
		level: "blocked",
		reason: `Escalation (${esc.severity}): ${esc.title}`
	};
	const topRisk = bySeverity(open.risks);
	if (topRisk && severityRank(topRisk.severity) === 0) return {
		level: "blocked",
		reason: `Risk (critical/${topRisk.likelihood ?? "unknown"} likelihood): ${topRisk.title}`
	};
	if (topRisk && severityRank(topRisk.severity) <= 2) return {
		level: "at_risk",
		reason: `Risk (${topRisk.severity}/${topRisk.likelihood ?? "unknown"} likelihood): ${topRisk.title}`
	};
	const topIssue = bySeverity(open.issues);
	if (topIssue && severityRank(topIssue.severity) <= 2) return {
		level: "at_risk",
		reason: `Issue (${topIssue.severity}): ${topIssue.title}`
	};
	const overdue = open.commitments.filter((c) => isOverdue(c.due_date));
	if (overdue.length) return {
		level: "at_risk",
		reason: `${overdue.length} overdue commitment(s), most recent due ${fmtDate([...overdue].sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0].due_date)}`
	};
	if (launchOverdue(impl)) return {
		level: "at_risk",
		reason: `Target launch ${fmtDate(impl.target_launch_date)} passed with no actual launch recorded`
	};
	const stalledDays = daysSince(impl.stage_entered_at) ?? 0;
	if (stalledDays > 14 && (!isCsStage(impl.current_stage) || hasOtherOpenSignal(record))) return {
		level: "at_risk",
		reason: `Stalled ${stalledDays} days in current stage`
	};
	const badMilestone = milestones.find(milestoneMissed) ?? milestones.find((m) => (m.status ?? "").toLowerCase() === "at_risk");
	if (badMilestone) return {
		level: "at_risk",
		reason: `Milestone ${humanize(badMilestone.status ?? "off track")}: ${badMilestone.name}`
	};
	if (!(record.risks.length + record.issues.length + record.escalations.length + record.commitments.length + milestones.length > 0)) return {
		level: "no_signal",
		reason: "No risks, issues, escalations, commitments or milestones recorded yet"
	};
	return {
		level: "on_track",
		reason: "Nothing open against it"
	};
}
/**
* Data-integrity check: stage has moved past Launch but no actual_launch_date recorded.
* Independent of launchOverdue() — different question, kept separate deliberately.
*/
function launchStateConflict(impl) {
	const current = stageIndex(impl.current_stage);
	const launch = stageIndex("launch");
	if (current < 0 || launch < 0) return false;
	return current > launch && !impl.actual_launch_date;
}
/** Overview "recent activity": stage changes, decisions, escalations, approvals only. */
function meaningfulEvents(record, limit = 6) {
	return [
		...record.stage_history.map((h) => ({
			key: `stage-${h.id}`,
			at: h.entered_at,
			kind: "Stage",
			title: `Entered stage`,
			detail: h.stage,
			actor: h.entered_by_name
		})),
		...record.decisions.map((d) => ({
			key: `dec-${d.id}`,
			at: d.decision_date ?? d.created_at,
			kind: "Decision",
			title: d.title,
			detail: d.status,
			actor: d.decided_by ?? null
		})),
		...record.escalations.map((e) => ({
			key: `esc-${e.id}`,
			at: e.raised_at,
			kind: "Escalation",
			title: e.title,
			detail: `${e.severity} · ${e.status}`,
			actor: e.raised_by_name ?? null
		})),
		...record.approvals.map((a) => ({
			key: `apr-${a.id}`,
			at: a.decided_at ?? a.requested_at,
			kind: "Approval",
			title: a.title,
			detail: a.status,
			actor: a.approver_name ?? null
		}))
	].filter((e) => Boolean(e.at)).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, limit);
}
/** Live-data check: field_mappings.status values in use are currently null/unset. */
var MAPPING_COMPLETE = [
	"complete",
	"completed",
	"done",
	"mapped",
	"validated",
	"approved"
];
var DECISION_OPEN = [
	"pending",
	"proposed",
	"open",
	"under_review"
];
var APPROVAL_PENDING = [
	"pending",
	"requested",
	"in_review",
	"awaiting"
];
/**
* "What's needed next" for a technical solution, derived only from signals
* actually present on the loaded record. Returns NEXT_ACTION_UNKNOWN otherwise.
*/
function technicalSolutionNextAction(detail) {
	const status = (detail.solution.status ?? "").toLowerCase();
	const incompleteRequired = detail.field_mappings.filter((m) => m.required === true && !MAPPING_COMPLETE.includes(String(m.status ?? "").toLowerCase()));
	if (incompleteRequired.length) return `Complete ${incompleteRequired.length} required field mapping(s), starting with ${incompleteRequired[0].source_field ?? incompleteRequired[0].target_field ?? "an unnamed field"}`;
	const pendingApproval = detail.approvals.find((a) => APPROVAL_PENDING.includes(String(a.status ?? "").toLowerCase()));
	if (pendingApproval) return `Approval is still pending — ${pendingApproval.title}${pendingApproval.approver_name ? ` (${pendingApproval.approver_name})` : ""}`;
	if ([
		"in_review",
		"review",
		"build",
		"in_build",
		"in_progress"
	].includes(status) && !detail.approvals.length) return `Status is ${humanize(status)} with no approval linked — request sign-off`;
	if (!detail.notes.length && status !== "draft") return `No journal entries recorded despite ${humanize(status)} status — capture assessment/design/build notes`;
	const openDecision = detail.decisions.find((d) => DECISION_OPEN.includes(String(d.status ?? "").toLowerCase()));
	if (openDecision) return `Resolve the linked decision — ${openDecision.title}`;
	return NEXT_ACTION_UNKNOWN;
}
/** Solution statuses that mean technical work is still outstanding. */
var SOLUTION_OPEN = [
	"draft",
	"in_review",
	"review",
	"in_progress",
	"in_build",
	"build"
];
var isCustomerSide = (value) => {
	const v = (value ?? "").toLowerCase();
	return v.includes("customer") || v.includes("client");
};
/**
* Single shared "who needs to act next" signal. Distinct from health/triage:
* it answers dependency, not urgency. Derived only from records actually loaded.
*
* Precedence: pending customer approval → open technical solution →
* overdue customer-facing commitment → open implementation-side work → none.
*/
function waitingOn(input) {
	const solutions = input.technical_solutions ?? [];
	const approvals = input.approvals ?? [];
	const commitments = (input.commitments ?? []).filter((c) => isOpen(c.status));
	const risks = (input.risks ?? []).filter((r) => isOpen(r.status));
	const issues = (input.issues ?? []).filter((r) => isOpen(r.status));
	const escalations = (input.escalations ?? []).filter((r) => isOpen(r.status));
	const decisions = (input.decisions ?? []).filter((d) => DECISION_OPEN.includes(String(d.status ?? "").toLowerCase()));
	const pendingApproval = approvals.find((a) => APPROVAL_PENDING.includes(String(a.status ?? "").toLowerCase()));
	if (pendingApproval) {
		const who = pendingApproval.approver_name ?? pendingApproval.approver_role ?? null;
		return {
			party: "customer",
			reason: `Waiting on the customer to approve ${pendingApproval.title}${who ? ` (${who})` : ""}`
		};
	}
	for (const s of solutions) {
		const status = String(s.status ?? "").toLowerCase();
		const incompleteRequired = (s.field_mappings ?? []).filter((m) => m.required === true && !MAPPING_COMPLETE.includes(String(m.status ?? "").toLowerCase()));
		if (incompleteRequired.length) return {
			party: "technical_solutions",
			reason: `Waiting on Technical Solutions to finish ${incompleteRequired.length} required field mapping(s) for ${s.title}`
		};
		if (SOLUTION_OPEN.includes(status)) return {
			party: "technical_solutions",
			reason: `Waiting on Technical Solutions to finish ${s.title} — still ${humanize(status)}`
		};
	}
	const customerCommitment = commitments.find((c) => isCustomerSide(c.committed_to) && isOverdue(c.due_date));
	if (customerCommitment) return {
		party: "customer",
		reason: `Waiting on the customer for a commitment past due ${fmtDate(customerCommitment.due_date)}: ${customerCommitment.description}`
	};
	const bySeverity = (rows) => [...rows].sort((a, b) => severityRank(a.severity) - severityRank(b.severity))[0];
	const esc = bySeverity(escalations);
	if (esc) return {
		party: "tis",
		reason: `Waiting on TIS to resolve the open escalation: ${esc.title}`
	};
	const issue = bySeverity(issues);
	if (issue) return {
		party: "tis",
		reason: `Waiting on TIS to resolve the open issue: ${issue.title}`
	};
	const risk = bySeverity(risks);
	if (risk) return {
		party: "tis",
		reason: `Waiting on TIS to act on the open risk: ${risk.title}`
	};
	const tisCommitment = commitments.find((c) => !isCustomerSide(c.committed_to));
	if (tisCommitment) return {
		party: "tis",
		reason: `Waiting on TIS to close an open commitment: ${tisCommitment.description}`
	};
	if (decisions.length) return {
		party: "tis",
		reason: `Waiting on TIS to resolve an open decision: ${decisions[0].title}`
	};
	return {
		party: "none",
		reason: "No current dependency."
	};
}
/** Customer 360 adapter — same logic, record-shaped input. */
function waitingOnForCustomer(record) {
	return waitingOn({
		technical_solutions: record.technical_solutions,
		approvals: record.approvals,
		commitments: record.commitments,
		risks: record.risks,
		issues: record.issues,
		escalations: record.escalations,
		decisions: record.decisions
	});
}
/**
* Technical Solution detail adapter — same logic, scoped to this solution.
* Returns null unless the solution itself is the current dependency.
*/
function waitingOnForSolution(detail) {
	const result = waitingOn({
		technical_solutions: [{
			...detail.solution,
			field_mappings: detail.field_mappings
		}],
		approvals: detail.approvals,
		decisions: detail.decisions
	});
	return result.party === "technical_solutions" ? result : null;
}
var WAITING_ON_LABEL = {
	technical_solutions: "Technical Solutions",
	customer: "Customer",
	tis: "TIS",
	none: "No current dependency"
};
/**
* Precedence: no baseline → not_baselined; baseline but no observation →
* not_measured; latest observation assessed not_met → not_met; approved
* customer confirmation → customer_confirmed; else measured_unconfirmed.
* "Latest" is by observed_at, never array order. Confirmation is only ever an
* approval with status 'approved' — never inferred from evidence or free text.
*/
function proveValueState(criterion, observations = [], approvals = []) {
	if (!(criterion.baseline_value ?? "").trim()) return "not_baselined";
	const mine = (observations ?? []).filter((o) => !o.success_criteria_id || o.success_criteria_id === criterion.id);
	if (!mine.length) return "not_measured";
	if (([...mine].sort((a, b) => new Date(b.observed_at ?? 0).getTime() - new Date(a.observed_at ?? 0).getTime())[0]?.assessment ?? "").toLowerCase() === "not_met") return "not_met";
	if ((approvals ?? []).some((a) => (a.status ?? "").toLowerCase() === "approved" && (!a.approved_entity_type || a.approved_entity_type === "success_criterion") && (!a.approved_entity_id || a.approved_entity_id === criterion.id))) return "customer_confirmed";
	return "measured_unconfirmed";
}
var PROVE_VALUE_LABEL = {
	not_baselined: "No starting point recorded",
	not_measured: "Starting point recorded, not yet measured",
	measured_unconfirmed: "Measured, waiting on customer confirmation",
	customer_confirmed: "Customer-confirmed",
	not_met: "Target not met"
};
/**
* When a criterion carries no due_stage, the operating model's implicit
* expectations apply: baseline by Align Externally, first measurement by
* Launch, customer confirmation by Graduate to CS.
*/
var DEFAULT_PROVE_VALUE_DUE_STAGE = {
	not_baselined: "align-external",
	not_measured: "launch",
	measured_unconfirmed: "graduate-to-cs",
	not_met: null,
	customer_confirmed: null
};
/** Lower sorts first — worst gap wins. */
var PROVE_VALUE_GAP_RANK = {
	not_met: 0,
	not_baselined: 1,
	not_measured: 2,
	measured_unconfirmed: 3,
	customer_confirmed: 9
};
var PROVE_VALUE_GAP_NEED = {
	not_baselined: "no starting point recorded",
	not_measured: "not measured yet",
	measured_unconfirmed: "waiting on customer confirmation",
	not_met: "latest observation says target not met",
	customer_confirmed: "confirmed"
};
/**
* Criteria that are late against their due stage, given where the
* implementation actually is. Derived only — nothing is stored.
*/
function proveValueGaps(criteria, currentStage) {
	const current = stageIndex(currentStage);
	if (current < 0) return [];
	const gaps = [];
	for (const c of criteria ?? []) {
		const state = proveValueState(c, c.observations ?? [], c.confirmations ?? []);
		if (state === "customer_confirmed") continue;
		const explicit = Boolean((c.due_stage ?? "").trim());
		const due = explicit ? c.due_stage : DEFAULT_PROVE_VALUE_DUE_STAGE[state];
		const dueIdx = due ? stageIndex(due) : -1;
		if (!(state === "not_met" || dueIdx >= 0 && current >= dueIdx)) continue;
		const description = (c.description ?? "").trim() || "Untitled success criterion";
		const dueText = due ? ` — due by ${stageLabel(due)}${explicit ? "" : " (implied)"}` : "";
		gaps.push({
			id: c.id,
			description,
			state,
			due_stage: due ?? null,
			explicit_due_stage: explicit,
			reason: `${description}: ${PROVE_VALUE_GAP_NEED[state]}${dueText}`,
			rank: PROVE_VALUE_GAP_RANK[state]
		});
	}
	return gaps.sort((a, b) => a.rank - b.rank || a.description.localeCompare(b.description));
}
/** One-line summary for headers and the Home queue. Null when nothing is late. */
function proveValueGapSummary(criteria, currentStage) {
	const gaps = proveValueGaps(criteria, currentStage);
	if (!gaps.length) return null;
	const rest = gaps.length - 1;
	const top = gaps[0];
	return {
		count: gaps.length,
		reason: `${top.reason}${rest > 0 ? ` (+${rest} more late)` : ""}`
	};
}
var ADOPTION_LEVEL_LABEL = {
	not_started: "Not started",
	progressing: "Progressing",
	established: "Established",
	at_risk: "At risk",
	unknown: "Not observed"
};
/** Worst-first: an at-risk area dominates the overall picture. */
var ADOPTION_RANK = {
	at_risk: 0,
	not_started: 1,
	progressing: 2,
	established: 3,
	unknown: 4
};
var asLevel = (value) => value && value in ADOPTION_RANK ? value : "unknown";
/** Latest observation for one area, by observed date. */
function latestAdoptionObservation(observations) {
	return [...observations ?? []].sort((a, b) => new Date(b.observed_at ?? 0).getTime() - new Date(a.observed_at ?? 0).getTime())[0] ?? null;
}
/** State of a single adoption area, from its most recent observation only. */
function adoptionAreaLevel(area) {
	return asLevel(latestAdoptionObservation(area.observations)?.state);
}
/** One-line adoption picture for the Customer 360 header. */
function adoptionSummary(areas) {
	const rows = areas ?? [];
	if (!rows.length) return null;
	const counts = {
		at_risk: 0,
		not_started: 0,
		progressing: 0,
		established: 0,
		unknown: 0
	};
	const workarounds = [];
	let worst = "established";
	for (const area of rows) {
		const level = adoptionAreaLevel(area);
		counts[level] += 1;
		if (ADOPTION_RANK[level] < ADOPTION_RANK[worst]) worst = level;
		const latest = latestAdoptionObservation(area.observations);
		if (latest?.workaround_in_use) workarounds.push({
			id: area.id,
			name: (area.name ?? "").trim() || "Unnamed adoption area",
			description: latest.workaround_description ?? null
		});
	}
	const observed = rows.length - counts.unknown;
	const level = observed === 0 ? "unknown" : worst;
	const parts = [`${observed} of ${rows.length} area(s) observed`];
	if (counts.established) parts.push(`${counts.established} established`);
	if (counts.progressing) parts.push(`${counts.progressing} progressing`);
	if (counts.not_started) parts.push(`${counts.not_started} not started`);
	if (counts.at_risk) parts.push(`${counts.at_risk} at risk`);
	if (workarounds.length) parts.push(`${workarounds.length} with workarounds still in use`);
	return {
		level,
		workarounds,
		counts,
		observed,
		total: rows.length,
		reason: parts.join(" · ")
	};
}
//#endregion
export { waitingOnForSolution as C, waitingOnForCustomer as S, proveValueGaps as _, adoptionSummary as a, technicalSolutionNextAction as b, isCsStage as c, launchStateConflict as d, meaningfulEvents as f, proveValueGapSummary as g, progress as h, adoptionAreaLevel as i, latestAdoptionObservation as l, openItems as m, PROVE_VALUE_LABEL as n, deriveHealth as o, nextAction as p, WAITING_ON_LABEL as r, hasOtherOpenSignal as s, ADOPTION_LEVEL_LABEL as t, launchOverdue as u, proveValueState as v, whatMattersNow as w, waitingOn as x, severityRank as y };
