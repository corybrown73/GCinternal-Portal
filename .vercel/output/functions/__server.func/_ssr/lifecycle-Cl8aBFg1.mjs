//#region node_modules/.nitro/vite/services/ssr/assets/lifecycle-Cl8aBFg1.js
/**
* Upstream company/customer journey steps that this application does NOT own.
* Documentation only: no ids in the lifecycle, no ownership, no behaviour.
*/
var PRE_HANDOFF_CONTEXT = [
	{
		label: "Qualify",
		note: "Sales-led. Operating model not yet agreed."
	},
	{
		label: "Define the Process",
		note: "Sales-led. Operating model not yet agreed."
	},
	{
		label: "Technically Validate",
		note: "SE-led. Output becomes the agreed scope handed over."
	},
	{
		label: "Closed / Won",
		note: "Trigger, not a stage — an implementation record implies the deal is won."
	}
];
/** Legacy stage ids recorded upstream, kept readable on historical rows only. */
var PRE_HANDOFF_STAGE_LABELS = {
	qualify: "Qualify",
	scoping: "Define the Process",
	"define-process": "Define the Process",
	"technically-validate": "Technically Validate"
};
var LIFECYCLE_STAGES = [
	{
		id: "handoff",
		label: "Handoff",
		intent: "Sales-to-implementation transfer of context, promises and risks accepted by TIS.",
		phase: "intake",
		leads: ["Implementation"],
		supports: ["AE", "SE"],
		boundary: "sales-to-implementation"
	},
	{
		id: "plan-internal",
		label: "Plan Internally",
		intent: "Internal implementation plan, owners and target dates committed.",
		phase: "delivery",
		leads: ["Implementation"]
	},
	{
		id: "align-external",
		label: "Align Externally",
		intent: "Customer stakeholders, success criteria and decision rights confirmed.",
		phase: "delivery",
		leads: ["Implementation"]
	},
	{
		id: "build",
		label: "Build",
		intent: "Configuration, integrations and data migration executed.",
		phase: "delivery",
		leads: ["Implementation"],
		overlay: {
			role: "Professional Services",
			condition: "Engaged only when build scope exceeds implementation capacity or capability."
		}
	},
	{
		id: "validate-iterate",
		label: "Validate / Iterate",
		intent: "UAT and iteration loops closed; readiness sign-off complete.",
		phase: "delivery",
		leads: ["Implementation"]
	},
	{
		id: "launch",
		label: "Launch",
		intent: "Go-live executed and hypercare window opened.",
		phase: "delivery",
		leads: ["Implementation"]
	},
	{
		id: "adopt",
		label: "Adopt",
		intent: "Usage breadth and depth at the agreed bar, with success criteria showing measured movement.",
		phase: "value",
		leads: ["Implementation"]
	},
	{
		id: "graduate-to-cs",
		label: "Handover to Customer Success",
		intent: "Ready to hand over confirmed and accepted by Customer Success; account self-sufficient.",
		phase: "steady-state",
		leads: ["Implementation"],
		supports: ["Customer Success"],
		boundary: "implementation-to-cs"
	}
];
var LIFECYCLE_BOUNDARY_LABEL = {
	"sales-to-implementation": "Sales / SE → Implementation",
	"implementation-to-cs": "Implementation → Customer Success"
};
var LIFECYCLE_STAGE_MAP = Object.fromEntries(LIFECYCLE_STAGES.map((stage) => [stage.id, stage]));
/**
* Legacy stage ids recorded before the lifecycle redesign. Kept permanently:
* implementation_stage_history is append-only, so historical rows legitimately
* carry the old vocabulary and aliasing is how we read them honestly.
*/
var STAGE_ALIASES = {
	plan: "plan-internal",
	align: "align-external",
	validate: "validate-iterate",
	"prove-value": "adopt",
	graduate: "graduate-to-cs",
	cs: "graduate-to-cs"
};
//#endregion
export { PRE_HANDOFF_STAGE_LABELS as a, PRE_HANDOFF_CONTEXT as i, LIFECYCLE_STAGES as n, STAGE_ALIASES as o, LIFECYCLE_STAGE_MAP as r, LIFECYCLE_BOUNDARY_LABEL as t };
