//#region node_modules/.nitro/vite/services/ssr/assets/launch-gate-CjDcSjmz.js
var LAUNCH_GATE_TITLE = "Solution acceptance required before Launch";
var status = (value) => String(value ?? "").toLowerCase();
/** Acceptance for one solution = an approval row for it with status 'approved'. */
function solutionAcceptance(solution, approvals) {
	const linked = approvals.filter((a) => status(a.approved_entity_type) === "technical_solution" && a.approved_entity_id === solution.id);
	return {
		accepted: linked.some((a) => status(a.status) === "approved"),
		linked,
		pending: linked.find((a) => status(a.status) === "pending"),
		rejected: linked.find((a) => status(a.status) === "rejected")
	};
}
/**
* Evaluate the gate for a proposed transition. Only the move into Launch is
* gated; every other stage keeps its existing behaviour.
*/
function launchAcceptanceGate(input) {
	if (status(input.toStage) !== "launch") return {
		blocked: false,
		reason: null,
		outstanding: []
	};
	if (input.solutions.length === 0) return {
		blocked: true,
		reason: "No technical solution is recorded for this implementation, so acceptance cannot be confirmed.",
		outstanding: ["Record the technical solution and mark its acceptance as approved before moving to Launch."]
	};
	const outstanding = [];
	for (const s of input.solutions) {
		const name = s.title?.trim() || "Untitled solution";
		const { accepted, linked, pending, rejected } = solutionAcceptance(s, input.approvals);
		if (accepted) continue;
		if (pending) outstanding.push(`${name} — acceptance still pending${pending.approver_name ? ` with ${pending.approver_name}` : ""}.`);
		else if (rejected) outstanding.push(`${name} — acceptance was rejected and has not been re-approved.`);
		else if (linked.length === 0) outstanding.push(`${name} — no acceptance has been requested yet.`);
		else outstanding.push(`${name} — acceptance is not approved.`);
	}
	if (outstanding.length === 0) return {
		blocked: false,
		reason: null,
		outstanding: []
	};
	return {
		blocked: true,
		reason: `${outstanding.length} technical solution(s) have not been accepted.`,
		outstanding
	};
}
/** One message used for the thrown server error and the UI block alike. */
function launchGateMessage(gate) {
	if (!gate.blocked) return "";
	return [
		LAUNCH_GATE_TITLE,
		gate.reason,
		...gate.outstanding
	].filter(Boolean).join(" ");
}
//#endregion
export { launchAcceptanceGate as n, launchGateMessage as r, LAUNCH_GATE_TITLE as t };
