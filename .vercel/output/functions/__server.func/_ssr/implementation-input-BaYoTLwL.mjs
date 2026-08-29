import { n as LIFECYCLE_STAGES } from "./lifecycle-Cl8aBFg1.mjs";
import { a as objectType, c as stringType, i as numberType, n as booleanType, o as preprocessType, r as enumType, t as arrayType } from "../_libs/zod.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/implementation-input-BaYoTLwL.js
/**
* Stage advancement (P0 Slice 2). Only a single step forward along the existing
* lifecycle ordering is allowed — no jumps, no rollbacks, no new stages.
* Notes and "recorded by" are optional: blank means not stated, never invented.
*/
var advanceStageInput = objectType({
	implementationId: stringType().uuid(),
	toStage: stringType().min(1),
	enteredBy: stringType().uuid().nullable(),
	notes: stringType().trim().min(1).nullable()
});
/** The single stage that follows `stage` in the canonical ordering, if any. */
function nextLifecycleStage(stage) {
	if (!stage) return null;
	const i = LIFECYCLE_STAGES.findIndex((s) => s.id === stage);
	if (i < 0 || i === LIFECYCLE_STAGES.length - 1) return null;
	return LIFECYCLE_STAGES[i + 1].id;
}
/**
* SOW analysis (POC). One read-only pass over the SOW already attached to an
* implementation: extract what the document actually says, then propose a
* journey. Nothing here is written back to the implementation automatically.
*/
var analyzeSowInput = objectType({ implementationId: stringType().uuid() });
var confidence = preprocessType((v) => {
	const s = typeof v === "string" ? v.toLowerCase().trim() : "";
	if (s === "stated" || s === "implied" || s === "uncertain") return s;
	if (s === "explicit" || s === "high") return "stated";
	if (s === "medium" || s === "inferred") return "implied";
	return "uncertain";
}, enumType([
	"stated",
	"implied",
	"uncertain"
]));
/** The model sometimes returns an object or a bare string where we expect text. */
function textOf(v, keys = [
	"text",
	"description",
	"value",
	"name",
	"item"
]) {
	if (typeof v === "string") return v;
	if (v && typeof v === "object") {
		const o = v;
		for (const k of keys) if (typeof o[k] === "string" && o[k] !== "") return o[k];
		const first = Object.values(o).find((x) => typeof x === "string" && x !== "");
		if (typeof first === "string") return first;
	}
	return "";
}
var looseString = preprocessType((v) => textOf(v), stringType());
/** One grounded finding. `quote` is the SOW wording it came from, when present. */
var finding = preprocessType((v) => {
	const o = v && typeof v === "object" ? v : {};
	const quote = textOf(o["quote"] ?? o["evidence"] ?? o["source"] ?? null, ["quote", "text"]);
	return {
		text: textOf(v),
		confidence: o["confidence"] ?? "uncertain",
		quote: quote === "" ? null : quote
	};
}, objectType({
	text: stringType(),
	confidence,
	quote: stringType().nullable()
}));
var num = preprocessType((v) => {
	if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
	if (typeof v === "string") {
		const m = /-?\d+(\.\d+)?/.exec(v);
		if (m) return Math.round(Number(m[0]));
	}
	return null;
}, numberType().int().min(0).max(520).nullable());
/** Timing for one stage: either stated by the SOW, estimated by the AI, or absent. */
var stageTiming = preprocessType((v) => {
	const o = v && typeof v === "object" ? v : {};
	const stated = textOf(o["statedText"] ?? o["stated"] ?? o["text"] ?? null, ["statedText", "text"]);
	const rationale = textOf(o["rationale"] ?? o["reason"] ?? null, ["rationale", "text"]);
	const driver = textOf(o["dependencyDriver"] ?? o["driver"] ?? null, ["dependencyDriver", "text"]);
	return {
		startWeek: o["startWeek"] ?? null,
		endWeek: o["endWeek"] ?? null,
		statedText: stated === "" ? null : stated,
		fromSow: o["fromSow"] === true || o["source"] === "sow",
		rationale: rationale === "" ? null : rationale,
		dependencyDriver: driver === "" ? null : driver,
		parallelWith: Array.isArray(o["parallelWith"]) ? o["parallelWith"].map((x) => textOf(x)).filter((s) => s !== "") : [],
		insufficientInfo: o["insufficientInfo"] === true
	};
}, objectType({
	startWeek: num,
	endWeek: num,
	/** The SOW's own wording for this stage's timing, when it has any. */
	statedText: stringType().nullable(),
	/** True when the SOW gives timing for this stage rather than it being estimated. */
	fromSow: preprocessType((v) => v === true, booleanType()),
	/** Why this duration is credible for the work described. */
	rationale: stringType().nullable(),
	/** The dependency that drives when this stage can run. */
	dependencyDriver: stringType().nullable(),
	/** Names of stages this one deliberately runs alongside. */
	parallelWith: arrayType(stringType()),
	/** True when the SOW gives too little to estimate this stage credibly. */
	insufficientInfo: preprocessType((v) => v === true, booleanType())
}));
var proposedStage = preprocessType((v) => {
	const o = v && typeof v === "object" ? v : {};
	const list = (x) => Array.isArray(x) ? x.map((i) => textOf(i)).filter((s) => s !== "") : [];
	return {
		name: textOf(o["name"] ?? o["stage"] ?? o["title"] ?? v),
		lifecycleStage: typeof o["lifecycleStage"] === "string" && o["lifecycleStage"] !== "" ? o["lifecycleStage"] : null,
		purpose: textOf(o["purpose"] ?? o["goal"] ?? o["description"] ?? ""),
		workstreams: list(o["workstreams"] ?? o["activities"]),
		dependencies: list(o["dependencies"] ?? o["dependsOn"]),
		customerResponsibilities: list(o["customerResponsibilities"] ?? o["customerActions"]),
		acceptanceCriteria: list(o["acceptanceCriteria"] ?? o["acceptance"]),
		timing: o["timing"] ?? {},
		confidence: o["confidence"] ?? "uncertain"
	};
}, objectType({
	/** Free-form: the SOW decides the stages, not our lifecycle list. */
	name: stringType(),
	/** Closest existing lifecycle stage id, or null when there is no good match. */
	lifecycleStage: stringType().nullable(),
	purpose: stringType(),
	workstreams: arrayType(stringType()),
	dependencies: arrayType(stringType()),
	/** What the customer has to do for this stage, taken from the SOW. */
	customerResponsibilities: arrayType(stringType()),
	/** How this stage is judged complete, where the SOW says so. */
	acceptanceCriteria: arrayType(stringType()),
	/** Proposed relative timing — planning only, never a commitment. */
	timing: stageTiming,
	confidence
}));
/** The delivery window the SOW states overall, e.g. "16 to 22 weeks". */
var deliveryWindow = preprocessType((v) => {
	const o = v && typeof v === "object" ? v : {};
	const stated = textOf(o["statedText"] ?? o["text"] ?? null, ["statedText", "text"]);
	const quote = textOf(o["quote"] ?? null, ["quote", "text"]);
	return {
		statedText: stated === "" ? null : stated,
		minWeeks: o["minWeeks"] ?? o["weeksMin"] ?? null,
		maxWeeks: o["maxWeeks"] ?? o["weeksMax"] ?? null,
		startDateStated: textOf(o["startDateStated"] ?? null) || null,
		startCondition: textOf(o["startCondition"] ?? o["startTrigger"] ?? null, ["startCondition", "text"]) || null,
		delayConditions: Array.isArray(o["delayConditions"]) ? o["delayConditions"].map((x) => textOf(x)).filter((s) => s !== "") : [],
		stageTimingProvided: o["stageTimingProvided"] === true,
		quote: quote === "" ? null : quote
	};
}, objectType({
	statedText: stringType().nullable(),
	minWeeks: num,
	maxWeeks: num,
	/** A calendar start the SOW names, if any (free text — never invented). */
	startDateStated: stringType().nullable(),
	/** What the SOW says the clock starts on, e.g. "signature and kickoff". */
	startCondition: stringType().nullable(),
	/** Conditions the SOW says would delay or extend delivery. */
	delayConditions: preprocessType((v) => Array.isArray(v) ? v : [], arrayType(looseString)),
	stageTimingProvided: preprocessType((v) => v === true, booleanType()),
	quote: stringType().nullable()
}));
var findings = preprocessType((v) => Array.isArray(v) ? v : [], arrayType(finding));
var strings = preprocessType((v) => Array.isArray(v) ? v : [], arrayType(looseString));
var sowAnalysisSchema = objectType({
	readable: preprocessType((v) => typeof v === "boolean" ? v : true, booleanType()),
	/** Present when the document could not be read or carried no SOW content. */
	problem: preprocessType((v) => typeof v === "string" && v !== "" ? v : null, stringType().nullable()),
	summary: looseString,
	extraction: preprocessType((v) => v && typeof v === "object" ? v : {}, objectType({
		objectives: findings,
		scope: findings,
		deliverables: findings,
		integrations: findings,
		customerResponsibilities: findings,
		providerResponsibilities: findings,
		trainingAndAdoption: findings,
		acceptanceCriteria: findings,
		timeline: findings,
		dependencies: findings,
		outOfScope: findings,
		requirements: findings,
		technicalSolutions: findings,
		successMeasures: findings,
		risksAndQuestions: findings
	})),
	proposedJourney: preprocessType((v) => Array.isArray(v) ? v : [], arrayType(proposedStage)),
	/** Delivery timing the SOW states overall. */
	deliveryWindow: preprocessType((v) => v && typeof v === "object" ? v : {}, deliveryWindow),
	assumptions: strings,
	gaps: strings
});
var EXTRACTION_SECTIONS = [
	{
		key: "objectives",
		label: "What the customer wants to achieve"
	},
	{
		key: "scope",
		label: "What is in scope"
	},
	{
		key: "outOfScope",
		label: "Explicitly out of scope"
	},
	{
		key: "requirements",
		label: "Requirements"
	},
	{
		key: "deliverables",
		label: "What has to be delivered"
	},
	{
		key: "integrations",
		label: "Systems and integrations"
	},
	{
		key: "technicalSolutions",
		label: "Where Technical Solutions is involved"
	},
	{
		key: "successMeasures",
		label: "How success is measured"
	},
	{
		key: "risksAndQuestions",
		label: "Risks and open questions"
	},
	{
		key: "customerResponsibilities",
		label: "What the customer has to do"
	},
	{
		key: "providerResponsibilities",
		label: "What we have to do"
	},
	{
		key: "trainingAndAdoption",
		label: "Training, rollout and adoption"
	},
	{
		key: "acceptanceCriteria",
		label: "How completion is judged"
	},
	{
		key: "timeline",
		label: "Dates, milestones and sequencing"
	},
	{
		key: "dependencies",
		label: "Dependencies the SOW names"
	}
];
function weekLabel(start, end) {
	return start === end ? `Week ${start}` : `Weeks ${start}–${end}`;
}
function addDays(iso, days) {
	const d = /* @__PURE__ */ new Date(`${iso.slice(0, 10)}T00:00:00Z`);
	if (Number.isNaN(d.getTime())) return null;
	d.setUTCDate(d.getUTCDate() + days);
	return d;
}
function dateRange(startDate, startWeek, endWeek) {
	const from = addDays(startDate, (startWeek - 1) * 7);
	const to = addDays(startDate, endWeek * 7 - 1);
	if (!from || !to) return null;
	const f = (d) => d.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		timeZone: "UTC"
	});
	return `${f(from)} – ${f(to)}`;
}
/** Total weeks the SOW allows, preferring the upper bound so the plan fits inside it. */
function sowTotalWeeks(analysis) {
	const { minWeeks, maxWeeks } = analysis.deliveryWindow;
	return maxWeeks ?? minWeeks ?? null;
}
/** One-line description of the delivery window the SOW states. */
function deliveryWindowLabel(analysis) {
	const w = analysis.deliveryWindow;
	if (w.statedText) return w.statedText;
	if (w.minWeeks && w.maxWeeks && w.minWeeks !== w.maxWeeks) return `${w.minWeeks}–${w.maxWeeks} weeks`;
	const total = sowTotalWeeks(analysis);
	return total ? `${total} weeks` : null;
}
/**
* Proposed timing per stage, in the same order as `analysis.proposedJourney`.
* Timing is used exactly as the SOW states it, or as the analysis estimated it
* from the described scope — nothing is spread evenly across the stages, and a
* stage with no credible estimate returns null rather than an invented span.
* Calendar ranges appear only when the implementation has a start date.
*/
function proposedTimings(analysis, startDate, overrides = {}) {
	const stages = analysis.proposedJourney;
	if (stages.length === 0) return [];
	const spans = stages.map((s, i) => {
		const o = overrides[i];
		if (o && o.startWeek >= 1 && o.endWeek >= o.startWeek) return {
			start: o.startWeek,
			end: o.endWeek,
			adjusted: true
		};
		if (s.timing.insufficientInfo) return null;
		const start = s.timing.startWeek;
		const end = s.timing.endWeek ?? start;
		if (start == null || end == null || start < 1 || end < start) return null;
		return {
			start,
			end,
			adjusted: false
		};
	});
	const total = sowTotalWeeks(analysis);
	return stages.map((s, i) => {
		const span = spans[i];
		if (!span) return null;
		const overlapsWith = stages.map((other, j) => {
			const o = spans[j];
			if (j === i || !o) return null;
			return o.start <= span.end && span.start <= o.end ? other.name : null;
		}).filter((n) => Boolean(n));
		return {
			startWeek: span.start,
			endWeek: span.end,
			weeks: weekLabel(span.start, span.end),
			dates: startDate ? dateRange(startDate, span.start, span.end) : null,
			statedText: s.timing.statedText,
			source: span.adjusted ? "adjusted" : s.timing.fromSow ? "sow" : "estimated",
			rationale: s.timing.rationale,
			dependencyDriver: s.timing.dependencyDriver,
			overlapsWith,
			beyondSowWindow: total != null && span.end > total
		};
	});
}
var TIMING_SOURCE_LABEL = {
	sow: "per SOW",
	estimated: "AI estimate",
	adjusted: "adjusted by TIS"
};
/**
* Applying a reviewed proposal. Every part is opt-in: the TIS ticks what should
* be written, and anything not ticked is left exactly as it is.
*/
var applySowProposalInput = objectType({
	implementationId: stringType().uuid(),
	authorId: stringType().uuid().nullable(),
	/** Appended to existing goals — never replaces them. */
	goals: stringType().trim().min(1).nullable(),
	requirements: arrayType(stringType().trim().min(1)).max(60),
	successMeasures: arrayType(stringType().trim().min(1)).max(60),
	/** The reviewed journey, saved as a working note. */
	journeyNote: stringType().trim().min(1).nullable()
});
var CONFIDENCE_LABEL = {
	stated: "Stated in the SOW",
	implied: "Implied",
	uncertain: "Uncertain"
};
/**
* The confirmed proposal is kept as a working note — no new tables, and the
* TIS stays the author of record.
*/
function proposalAsNote(analysis, sowName, startDate, overrides = {}) {
	const lines = [`Proposed implementation journey — AI-proposed from the SOW${sowName ? ` (${sowName})` : ""}, reviewed and saved by the TIS.`, ""];
	const window = deliveryWindowLabel(analysis);
	if (window) lines.push(`Delivery window stated in the SOW: ${window}.`);
	const dw = analysis.deliveryWindow;
	if (dw.startCondition) lines.push(`SOW start condition: ${dw.startCondition}.`);
	for (const d of dw.delayConditions) lines.push(`SOW delay condition: ${d}`);
	lines.push(startDate ? `Proposed dates below are counted from the recorded start date (${startDate.slice(0, 10)}) — AI planning recommendation, not committed dates.` : "Timing below is in relative weeks because no start date is recorded — AI planning recommendation, not committed dates.", "");
	const timings = proposedTimings(analysis, startDate ?? null, overrides);
	analysis.proposedJourney.forEach((stage, i) => {
		const t = timings[i];
		const when = t ? `${t.weeks}${t.dates ? ` · ${t.dates}` : ""} (${TIMING_SOURCE_LABEL[t.source]}) — ` : "timing not proposed — ";
		lines.push(`${String(i + 1).padStart(2, "0")} ${when}${stage.name} — ${stage.purpose}`);
		if (!t) lines.push("  Insufficient information in the SOW to propose a credible window.");
		if (t?.statedText) lines.push(`  SOW timing: ${t.statedText}`);
		if (t?.rationale) lines.push(`  why: ${t.rationale}`);
		if (t?.dependencyDriver) lines.push(`  timing depends on: ${t.dependencyDriver}`);
		if (t && t.overlapsWith.length > 0) lines.push(`  runs alongside: ${t.overlapsWith.join("; ")}`);
		if (t?.beyondSowWindow) lines.push("  note: extends past the SOW's stated delivery window");
		for (const w of stage.workstreams) lines.push(`  • ${w}`);
		for (const d of stage.dependencies) lines.push(`  depends on: ${d}`);
		for (const c of stage.customerResponsibilities) lines.push(`  customer: ${c}`);
		for (const a of stage.acceptanceCriteria) lines.push(`  accepted when: ${a}`);
	});
	if (analysis.extraction.outOfScope.length > 0) {
		lines.push("", "Out of scope per the SOW:");
		for (const o of analysis.extraction.outOfScope) lines.push(`  • ${o.text}`);
	}
	if (analysis.assumptions.length > 0) {
		lines.push("", "Assumptions carried over:");
		for (const a of analysis.assumptions) lines.push(`  • ${a}`);
	}
	if (analysis.gaps.length > 0) {
		lines.push("", "Still unclear from the SOW:");
		for (const g of analysis.gaps) lines.push(`  • ${g}`);
	}
	return lines.join("\n");
}
/** Replacing just the attached SOW document, without touching anything else. */
var setSowDocumentInput = objectType({
	implementationId: stringType().uuid(),
	documentUrl: stringType().min(1),
	documentName: stringType().min(1)
});
/** Live CHECK-constraint values for technical solution records. */
var SOLUTION_STATUSES = [
	"draft",
	"in_review",
	"approved",
	"built",
	"validated"
];
var NOTE_TYPES = [
	"assessment",
	"design",
	"build",
	"limitation",
	"handoff"
];
var TECHNICAL_SOLUTIONS_ROLE = "Technical Solutions";
/**
* field_mappings.status has no CHECK constraint and all seeded rows are NULL.
* These are the only status values already recognised by the existing derive
* layer (customer360-derive MAPPING_COMPLETE) — no new vocabulary invented.
* NULL is represented in the UI as "Not set".
*/
var FIELD_MAPPING_STATUSES = [
	"mapped",
	"validated",
	"complete"
];
/**
* A working note written from inside a solution. The solution is taken from the
* page the writer is on — never picked in the form — so the entry stays with the
* solution it was written against.
*/
var createSolutionNoteInput = objectType({
	technicalSolutionId: stringType().uuid(),
	noteType: enumType(NOTE_TYPES),
	content: stringType().trim().min(1),
	authorId: stringType().uuid().nullable(),
	/** One link per line. */
	links: stringType().trim().min(1).nullable(),
	attachmentUrl: stringType().trim().min(1).nullable(),
	attachmentName: stringType().trim().min(1).nullable()
});
var nullableText = stringType().trim().min(1).nullable();
var mappingFields = {
	sourceField: nullableText,
	sourceSystem: nullableText,
	targetField: nullableText,
	transformationNotes: nullableText,
	required: booleanType().nullable(),
	status: enumType(FIELD_MAPPING_STATUSES).nullable()
};
var createFieldMappingInput = objectType({
	technicalSolutionId: stringType().uuid(),
	...mappingFields
});
var updateFieldMappingInput = objectType({
	id: stringType().uuid(),
	...mappingFields
});
/** Maps the form shape onto the field_mappings columns. */
function toFieldMappingPatch(input) {
	return {
		source_field: input.sourceField,
		source_system: input.sourceSystem,
		target_field: input.targetField,
		transformation_notes: input.transformationNotes,
		required: input.required,
		status: input.status
	};
}
/** The design write-up kept against a solution. */
var updateSolutionDesignInput = objectType({
	id: stringType().uuid(),
	designSummary: stringType().trim().min(1).nullable(),
	configurationDetails: stringType().trim().min(1).nullable()
});
var STAGE_IDS = LIFECYCLE_STAGES.map((s) => s.id);
var optionalText$6 = stringType().trim().min(1).nullable();
/** Fields the Customer 360 criterion editor may write. measured_value / measured_at
*  / status are deliberately excluded — they belong to observation handling. */
var successCriterionInput = objectType({
	description: stringType().trim().min(1),
	metric: optionalText$6,
	baselineValue: optionalText$6,
	targetValue: optionalText$6,
	measurementSource: optionalText$6,
	dueStage: enumType(STAGE_IDS).nullable(),
	ownerId: stringType().uuid().nullable(),
	/** Kickoff intake — all optional. Blank means "not confirmed yet", never zero. */
	baselinePeriod: optionalText$6,
	targetDate: stringType().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
	customerOwnerContactId: stringType().uuid().nullable()
});
var createSuccessCriterionInput = successCriterionInput.extend({ implementationId: stringType().uuid() });
var updateSuccessCriterionInput = successCriterionInput.extend({ id: stringType().uuid() });
function toSuccessCriterionPatch(data) {
	return {
		description: data.description,
		metric: data.metric,
		baseline_value: data.baselineValue,
		target_value: data.targetValue,
		measurement_source: data.measurementSource,
		due_stage: data.dueStage,
		owner_id: data.ownerId,
		baseline_period: data.baselinePeriod,
		target_date: data.targetDate,
		customer_owner_contact_id: data.customerOwnerContactId
	};
}
/** The only assessment values the schema's CHECK constraint accepts. */
var OBSERVATION_ASSESSMENTS = [
	"improving",
	"met",
	"not_met",
	"inconclusive"
];
/** Approval statuses used for customer confirmation of a success criterion. */
var CONFIRMATION_STATUSES = [
	"pending",
	"approved",
	"rejected"
];
var optionalText$5 = stringType().trim().min(1).nullable();
var optionalUuid$3 = stringType().uuid().nullable();
/** Append-only observation write. observed_at is a date (YYYY-MM-DD) from the UI. */
var createObservationInput = objectType({
	successCriteriaId: stringType().uuid(),
	observedValue: stringType().trim().min(1),
	observedAt: stringType().regex(/^\d{4}-\d{2}-\d{2}$/),
	observedBy: optionalUuid$3,
	source: optionalText$5,
	assessment: enumType(OBSERVATION_ASSESSMENTS),
	notes: optionalText$5,
	evidenceId: optionalUuid$3
});
function toObservationRow(data) {
	return {
		success_criteria_id: data.successCriteriaId,
		observed_value: data.observedValue,
		observed_at: `${data.observedAt}T00:00:00Z`,
		observed_by: data.observedBy,
		source: data.source,
		assessment: data.assessment,
		notes: data.notes,
		evidence_id: data.evidenceId
	};
}
/** Customer confirmation is an approvals row scoped to one success criterion. */
var createConfirmationInput = objectType({
	implementationId: stringType().uuid(),
	successCriteriaId: stringType().uuid(),
	customerContactId: stringType().uuid(),
	evidenceId: optionalUuid$3,
	status: enumType(CONFIRMATION_STATUSES)
});
var updateConfirmationInput = objectType({
	id: stringType().uuid(),
	evidenceId: optionalUuid$3,
	status: enumType(CONFIRMATION_STATUSES)
});
/**
* Kickoff intake reuses the existing customer_contacts model — there is no
* separate stakeholder entity. `role` is the person's contact type and is
* constrained to the canonical vocabulary enforced by the database.
*
* Kickoff responsibilities (owning a success criterion or an adoption area)
* are NOT roles: they are expressed through the existing
* `customer_owner_contact_id` relationships on those records.
*/
var CONTACT_ROLES = [
	"exec_sponsor",
	"decision_maker",
	"primary_contact",
	"technical_contact",
	"end_user",
	"approver"
];
var CONTACT_ROLE_LABELS = {
	exec_sponsor: "Exec sponsor",
	decision_maker: "Decision maker",
	primary_contact: "Primary contact",
	technical_contact: "Technical contact",
	end_user: "End user",
	approver: "Approver"
};
function contactRoleLabel(role) {
	if (!role) return null;
	return CONTACT_ROLE_LABELS[role] ?? role;
}
var optionalText$4 = stringType().trim().min(1).nullable();
var customerContactInput = objectType({
	name: stringType().trim().min(1),
	role: enumType(CONTACT_ROLES),
	email: optionalText$4,
	notes: optionalText$4
});
var createCustomerContactInput = customerContactInput.extend({ customerId: stringType().uuid() });
var updateCustomerContactInput = customerContactInput.extend({ id: stringType().uuid() });
function toCustomerContactPatch(data) {
	return {
		name: data.name,
		role: data.role,
		email: data.email,
		notes: data.notes
	};
}
/**
* Adoption is behavioural: "are the intended users and workflows actually
* using the solution as intended?". It is deliberately separate from Prove
* Value ("did the intended business outcome happen?") — neither is derived
* from the other.
*/
var ADOPTION_KINDS = ["user_group", "workflow"];
var ADOPTION_KIND_LABEL = {
	user_group: "Users / team",
	workflow: "Workflow"
};
/** The only state values the schema's CHECK constraint accepts. */
var ADOPTION_STATES = [
	"not_started",
	"progressing",
	"established",
	"at_risk"
];
var optionalText$3 = stringType().trim().min(1).nullable();
var optionalUuid$2 = stringType().uuid().nullable();
var adoptionAreaInput = objectType({
	kind: enumType(ADOPTION_KINDS),
	name: stringType().trim().min(1),
	/** SOW-derived source context — preserved verbatim, never reinterpreted. */
	intendedUsage: optionalText$3,
	ownerId: optionalUuid$2,
	notes: optionalText$3,
	/** Kickoff intake — all optional. Blank means "not confirmed yet". */
	intendedUsers: optionalText$3,
	expectedFrequency: optionalText$3,
	inUseDefinition: optionalText$3,
	customerOwnerContactId: optionalUuid$2
});
var createAdoptionAreaInput = adoptionAreaInput.extend({ implementationId: stringType().uuid() });
var updateAdoptionAreaInput = adoptionAreaInput.extend({ id: stringType().uuid() });
function toAdoptionAreaPatch(data) {
	return {
		kind: data.kind,
		name: data.name,
		intended_usage: data.intendedUsage,
		owner_id: data.ownerId,
		notes: data.notes,
		intended_users: data.intendedUsers,
		expected_frequency: data.expectedFrequency,
		in_use_definition: data.inUseDefinition,
		customer_owner_contact_id: data.customerOwnerContactId
	};
}
/** Append-only: adoption observations are never updated or deleted. */
var createAdoptionObservationInput = objectType({
	adoptionAreaId: stringType().uuid(),
	observedAt: stringType().regex(/^\d{4}-\d{2}-\d{2}$/),
	observedBy: optionalUuid$2,
	state: enumType(ADOPTION_STATES),
	workaroundInUse: booleanType(),
	workaroundDescription: optionalText$3,
	source: optionalText$3,
	notes: optionalText$3,
	evidenceId: optionalUuid$2
});
function toAdoptionObservationRow(data) {
	return {
		adoption_area_id: data.adoptionAreaId,
		observed_at: `${data.observedAt}T00:00:00Z`,
		observed_by: data.observedBy,
		state: data.state,
		workaround_in_use: data.workaroundInUse,
		workaround_description: data.workaroundInUse ? data.workaroundDescription : null,
		source: data.source,
		notes: data.notes,
		evidence_id: data.evidenceId
	};
}
/**
* P0 Slice 3 — write paths for the six existing delivery records:
* requirements, risks, issues, escalations, decisions, commitments.
*
* Every enum below mirrors the table's own CHECK constraint exactly, so the
* UI can only offer values the database already accepts. No new columns, no
* new tables, no invented vocabulary. Optional stays optional: blank means
* "not known yet" and is stored as NULL, never as a fabricated default.
*/
var optionalText$2 = stringType().trim().min(1).nullable();
var optionalUuid$1 = stringType().uuid().nullable();
var optionalDate$2 = stringType().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date").nullable();
var REQUIREMENT_PRIORITIES = [
	"must_have",
	"should_have",
	"nice_to_have"
];
var REQUIREMENT_STATUSES = [
	"open",
	"in_design",
	"built",
	"validated",
	"approved",
	"rejected",
	"deferred"
];
var REQUIREMENT_SCOPE_STATUSES = [
	"original",
	"added",
	"modified",
	"removed"
];
var RISK_SEVERITIES = [
	"low",
	"medium",
	"high",
	"critical"
];
var RISK_LIKELIHOODS = [
	"low",
	"medium",
	"high"
];
var RISK_STATUSES = [
	"open",
	"mitigated",
	"accepted",
	"closed"
];
var ISSUE_SEVERITIES = [
	"low",
	"medium",
	"high",
	"critical"
];
var ISSUE_STATUSES = [
	"open",
	"in_progress",
	"resolved",
	"closed"
];
var ESCALATION_SEVERITIES = [
	"medium",
	"high",
	"critical"
];
var ESCALATION_STATUSES = [
	"open",
	"in_progress",
	"resolved"
];
var DECISION_STATUSES = [
	"active",
	"superseded",
	"reversed"
];
var COMMITMENT_AUDIENCES = ["customer", "internal"];
var COMMITMENT_STATUSES = [
	"open",
	"met",
	"missed",
	"renegotiated"
];
var requirementInput = objectType({
	title: stringType().trim().min(1, "Give the requirement a title"),
	description: optionalText$2,
	category: optionalText$2,
	priority: enumType(REQUIREMENT_PRIORITIES),
	status: enumType(REQUIREMENT_STATUSES),
	scopeStatus: enumType(REQUIREMENT_SCOPE_STATUSES),
	/** Where the requirement came from (SOW, kickoff, workshop) — free text. */
	source: optionalText$2,
	createdBy: optionalUuid$1
});
var createRequirementInput = requirementInput.extend({ implementationId: stringType().uuid() });
var updateRequirementInput = requirementInput.extend({ id: stringType().uuid() });
function toRequirementPatch(data) {
	return {
		title: data.title,
		description: data.description,
		category: data.category,
		priority: data.priority,
		status: data.status,
		scope_status: data.scopeStatus,
		source: data.source,
		created_by: data.createdBy
	};
}
var riskInput = objectType({
	title: stringType().trim().min(1, "Give the risk a title"),
	description: optionalText$2,
	severity: enumType(RISK_SEVERITIES),
	likelihood: enumType(RISK_LIKELIHOODS),
	status: enumType(RISK_STATUSES),
	ownerId: optionalUuid$1,
	impact: optionalText$2,
	mitigation: optionalText$2,
	/** Only recorded once the risk actually stops being live. */
	resolvedAt: optionalDate$2
});
var createRiskInput = riskInput.extend({ implementationId: stringType().uuid() });
var updateRiskInput = riskInput.extend({ id: stringType().uuid() });
function toRiskPatch(data) {
	return {
		title: data.title,
		description: data.description,
		severity: data.severity,
		likelihood: data.likelihood,
		status: data.status,
		owner_id: data.ownerId,
		impact: data.impact,
		mitigation: data.mitigation,
		resolved_at: data.resolvedAt ? `${data.resolvedAt}T00:00:00Z` : null
	};
}
var issueInput = objectType({
	title: stringType().trim().min(1, "Give the issue a title"),
	description: optionalText$2,
	severity: enumType(ISSUE_SEVERITIES),
	status: enumType(ISSUE_STATUSES),
	ownerId: optionalUuid$1,
	resolution: optionalText$2,
	resolvedAt: optionalDate$2
});
var createIssueInput = issueInput.extend({ implementationId: stringType().uuid() });
var updateIssueInput = issueInput.extend({ id: stringType().uuid() });
function toIssuePatch(data) {
	return {
		title: data.title,
		description: data.description,
		severity: data.severity,
		status: data.status,
		owner_id: data.ownerId,
		resolution: data.resolution,
		resolved_at: data.resolvedAt ? `${data.resolvedAt}T00:00:00Z` : null
	};
}
var escalationInput = objectType({
	title: stringType().trim().min(1, "Give the escalation a title"),
	description: optionalText$2,
	severity: enumType(ESCALATION_SEVERITIES),
	status: enumType(ESCALATION_STATUSES),
	/** Free text on the existing column (no constraint) — e.g. commercial, technical. */
	escalationType: optionalText$2,
	ownerId: optionalUuid$1,
	raisedBy: optionalUuid$1,
	/** Existing relationships to an already-recorded risk or issue. */
	relatedIssueId: optionalUuid$1,
	relatedRiskId: optionalUuid$1,
	resolutionSummary: optionalText$2,
	resolvedAt: optionalDate$2
});
var createEscalationInput = escalationInput.extend({ implementationId: stringType().uuid() });
var updateEscalationInput = escalationInput.extend({ id: stringType().uuid() });
function toEscalationPatch(data) {
	return {
		title: data.title,
		description: data.description,
		severity: data.severity,
		status: data.status,
		escalation_type: data.escalationType,
		owner_id: data.ownerId,
		raised_by: data.raisedBy,
		related_issue_id: data.relatedIssueId,
		related_risk_id: data.relatedRiskId,
		resolution_summary: data.resolutionSummary,
		resolved_at: data.resolvedAt ? `${data.resolvedAt}T00:00:00Z` : null
	};
}
var decisionInput = objectType({
	title: stringType().trim().min(1, "Give the decision a title"),
	description: optionalText$2,
	rationale: optionalText$2,
	/** Free text on the existing column: decisions can be made customer-side. */
	decidedBy: optionalText$2,
	decisionDate: optionalDate$2,
	status: enumType(DECISION_STATUSES)
});
var createDecisionInput = decisionInput.extend({ implementationId: stringType().uuid() });
var updateDecisionInput = decisionInput.extend({ id: stringType().uuid() });
function toDecisionPatch(data) {
	return {
		title: data.title,
		description: data.description,
		rationale: data.rationale,
		decided_by: data.decidedBy,
		decision_date: data.decisionDate,
		status: data.status
	};
}
var commitmentInput = objectType({
	description: stringType().trim().min(1, "Describe what was committed"),
	committedTo: enumType(COMMITMENT_AUDIENCES),
	ownerId: optionalUuid$1,
	madeBy: optionalUuid$1,
	dueDate: optionalDate$2,
	status: enumType(COMMITMENT_STATUSES),
	/** Only set when the commitment is actually fulfilled. */
	fulfilledAt: optionalDate$2
});
var createCommitmentInput = commitmentInput.extend({ implementationId: stringType().uuid() });
var updateCommitmentInput = commitmentInput.extend({ id: stringType().uuid() });
function toCommitmentPatch(data) {
	return {
		description: data.description,
		committed_to: data.committedTo,
		owner_id: data.ownerId,
		made_by: data.madeBy,
		due_date: data.dueDate,
		status: data.status,
		fulfilled_at: data.fulfilledAt ? `${data.fulfilledAt}T00:00:00Z` : null
	};
}
/**
* Slice 4 — write paths for the two existing records that carry proof:
* `evidence` and `approvals`. Enums mirror the tables' own CHECK constraints,
* relationships reuse the existing polymorphic (entity_type, entity_id) pairs,
* and blank optional fields stay NULL rather than being fabricated.
*/
var optionalText$1 = stringType().trim().min(1).nullable();
var optionalUuid = stringType().uuid().nullable();
var optionalDate$1 = stringType().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date").nullable();
var EVIDENCE_TYPES = [
	"document",
	"communication",
	"test_result",
	"screenshot",
	"approval_record",
	"other"
];
var APPROVAL_STATUSES = [
	"pending",
	"approved",
	"rejected"
];
/** Entity kinds the existing read surfaces already resolve labels for. */
var RELATED_ENTITY_TYPES = [
	"requirement",
	"decision",
	"risk",
	"issue",
	"escalation",
	"milestone",
	"technical_solution",
	"success_criterion"
];
var relation = {
	relatedEntityType: enumType(RELATED_ENTITY_TYPES).nullable(),
	relatedEntityId: optionalUuid
};
var evidenceInput = objectType({
	type: enumType(EVIDENCE_TYPES),
	title: stringType().trim().min(1, "Give the evidence a title"),
	description: optionalText$1,
	url: stringType().trim().url("Enter a valid link, or leave it blank").nullable(),
	uploadedBy: optionalUuid,
	...relation
});
var createEvidenceInput = evidenceInput.extend({ implementationId: stringType().uuid() });
var updateEvidenceInput = evidenceInput.extend({ id: stringType().uuid() });
function toEvidencePatch(data) {
	const linked = data.relatedEntityType && data.relatedEntityId;
	return {
		type: data.type,
		title: data.title,
		description: data.description,
		url: data.url,
		uploaded_by: data.uploadedBy,
		related_entity_type: linked ? data.relatedEntityType : null,
		related_entity_id: linked ? data.relatedEntityId : null
	};
}
var approvalInput = objectType({
	title: stringType().trim().min(1, "Say what is being approved"),
	status: enumType(APPROVAL_STATUSES),
	approverName: optionalText$1,
	approverRole: optionalText$1,
	customerContactId: optionalUuid,
	evidenceId: optionalUuid,
	decidedAt: optionalDate$1,
	approvedEntityType: enumType(RELATED_ENTITY_TYPES).nullable(),
	approvedEntityId: optionalUuid
});
var createApprovalInput = approvalInput.extend({ implementationId: stringType().uuid() });
var updateApprovalInput = approvalInput.extend({ id: stringType().uuid() });
function toApprovalPatch(data) {
	const linked = data.approvedEntityType && data.approvedEntityId;
	return {
		title: data.title,
		status: data.status,
		approver_name: data.approverName,
		approver_role: data.approverRole,
		customer_contact_id: data.customerContactId,
		evidence_id: data.evidenceId,
		decided_at: data.status === "pending" ? null : data.decidedAt ? `${data.decidedAt}T00:00:00Z` : (/* @__PURE__ */ new Date()).toISOString(),
		approved_entity_type: linked ? data.approvedEntityType : null,
		approved_entity_id: linked ? data.approvedEntityId : null
	};
}
/**
* Working notes on an implementation. The stage is never a form field — the
* server stamps whichever stage the implementation is in when the note is
* written, so historical notes stay attached to the stage they belong to.
*/
var createJournalEntryInput = objectType({
	implementationId: stringType().uuid(),
	note: stringType().trim().min(1),
	authorId: stringType().uuid().nullable(),
	/** One link per line. */
	links: stringType().trim().min(1).nullable(),
	attachmentUrl: stringType().trim().min(1).nullable(),
	attachmentName: stringType().trim().min(1).nullable()
});
/** File handed to the server as base64 — POC scale only. */
var uploadAttachmentInput = objectType({
	folder: enumType([
		"sow",
		"notes",
		"solution"
	]),
	fileName: stringType().trim().min(1).max(200),
	contentType: stringType().trim().min(1).max(200),
	/** ~6 MB of base64 ≈ 4.5 MB of file. */
	dataBase64: stringType().min(1).max(65e5)
});
var attachmentPathInput = objectType({ path: stringType().trim().min(1) });
function splitLinks(links) {
	if (!links) return [];
	return links.split(/[\n,]/).map((l) => l.trim()).filter((l) => l.length > 0);
}
/**
* Implementation creation (P0 Slice 1). The lifecycle always starts at Handoff —
* `current_stage` is not a form field and is hardcoded server-side.
* Everything except `name` is optional: blank means "not known yet", never zero.
*/
var optionalText = stringType().trim().min(1).nullable();
var optionalDate = stringType().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
var optionalNumber = numberType().finite().nullable();
/** New customer capture reuses the customers table exactly — no new columns. */
var newCustomerInput = objectType({
	name: stringType().trim().min(1),
	industry: optionalText,
	region: optionalText,
	segment: optionalText,
	arr: optionalNumber
});
var createImplementationInput = objectType({
	/** Exactly one of these two is provided. */
	customerId: stringType().uuid().nullable(),
	newCustomer: newCustomerInput.nullable(),
	name: stringType().trim().min(1),
	ownerId: stringType().uuid().nullable(),
	salesOwner: optionalText,
	tier: optionalText,
	sowReference: optionalText,
	/** Optional SOW document uploaded during creation. */
	sowDocumentUrl: optionalText.optional(),
	sowDocumentName: optionalText.optional(),
	sowValue: optionalNumber,
	sowSignedDate: optionalDate,
	contractStartDate: optionalDate,
	targetLaunchDate: optionalDate,
	customerGoals: optionalText,
	externalRef: optionalText
}).refine((v) => v.customerId === null !== (v.newCustomer === null), { message: "Provide either an existing customer or a new customer, not both" });
function toImplementationPatch(data) {
	return {
		name: data.name,
		owner_id: data.ownerId,
		sales_owner: data.salesOwner,
		tier: data.tier,
		sow_reference: data.sowReference,
		sow_document_url: data.sowDocumentUrl ?? null,
		sow_document_name: data.sowDocumentName ?? null,
		sow_value: data.sowValue,
		sow_signed_date: data.sowSignedDate,
		contract_start_date: data.contractStartDate,
		target_launch_date: data.targetLaunchDate,
		customer_goals: data.customerGoals,
		external_ref: data.externalRef
	};
}
function toCustomerPatch(data) {
	return {
		name: data.name,
		industry: data.industry,
		region: data.region,
		segment: data.segment,
		arr: data.arr
	};
}
/**
* Editing an existing implementation. `current_stage` and `stage_entered_at` are
* deliberately absent: stage movement only ever happens through stage
* advancement, so this editor can never disagree with the stage history.
*/
var updateImplementationInput = objectType({
	id: stringType().uuid(),
	name: stringType().trim().min(1),
	ownerId: stringType().uuid().nullable(),
	salesOwner: optionalText,
	tier: optionalText,
	status: enumType([
		"on_track",
		"at_risk",
		"blocked",
		"idle"
	]),
	sowReference: optionalText,
	/** Stored path of the uploaded SOW document, plus the name to show for it. */
	sowDocumentUrl: optionalText,
	sowDocumentName: optionalText,
	sowValue: optionalNumber,
	sowSignedDate: optionalDate,
	contractStartDate: optionalDate,
	targetLaunchDate: optionalDate,
	/** Blank until go-live actually happened — never pre-filled from the target. */
	actualLaunchDate: optionalDate,
	customerGoals: optionalText,
	/** Discovery/design board (Miro) for this implementation. Omitted keys are left untouched. */
	discoveryBoardUrl: optionalText.optional(),
	discoveryBoardImageUrl: optionalText.optional(),
	discoveryBoardImageName: optionalText.optional(),
	discoveryBoardNotes: optionalText.optional()
});
function toImplementationUpdatePatch(data) {
	const patch = {
		name: data.name,
		owner_id: data.ownerId,
		sales_owner: data.salesOwner,
		tier: data.tier,
		status: data.status,
		sow_reference: data.sowReference,
		sow_document_url: data.sowDocumentUrl,
		sow_document_name: data.sowDocumentName,
		sow_value: data.sowValue,
		sow_signed_date: data.sowSignedDate,
		contract_start_date: data.contractStartDate,
		target_launch_date: data.targetLaunchDate,
		actual_launch_date: data.actualLaunchDate,
		customer_goals: data.customerGoals
	};
	if (data.discoveryBoardUrl !== void 0) patch["discovery_board_url"] = data.discoveryBoardUrl;
	if (data.discoveryBoardImageUrl !== void 0) patch["discovery_board_image_url"] = data.discoveryBoardImageUrl;
	if (data.discoveryBoardImageName !== void 0) patch["discovery_board_image_name"] = data.discoveryBoardImageName;
	if (data.discoveryBoardNotes !== void 0) patch["discovery_board_notes"] = data.discoveryBoardNotes;
	return patch;
}
//#endregion
export { deliveryWindowLabel as $, advanceStageInput as A, updateEvidenceInput as At, createCustomerContactInput as B, REQUIREMENT_STATUSES as C, updateAdoptionAreaInput as Ct, SOLUTION_STATUSES as D, updateCustomerContactInput as Dt, RISK_STATUSES as E, updateConfirmationInput as Et, createAdoptionAreaInput as F, updateRiskInput as Ft, createImplementationInput as G, createEscalationInput as H, createAdoptionObservationInput as I, updateSolutionDesignInput as It, createObservationInput as J, createIssueInput as K, createApprovalInput as L, updateSuccessCriterionInput as Lt, applySowProposalInput as M, updateImplementationInput as Mt, attachmentPathInput as N, updateIssueInput as Nt, TECHNICAL_SOLUTIONS_ROLE as O, updateDecisionInput as Ot, contactRoleLabel as P, updateRequirementInput as Pt, createSuccessCriterionInput as Q, createCommitmentInput as R, uploadAttachmentInput as Rt, REQUIREMENT_SCOPE_STATUSES as S, toSuccessCriterionPatch as St, RISK_SEVERITIES as T, updateCommitmentInput as Tt, createEvidenceInput as U, createDecisionInput as V, createFieldMappingInput as W, createRiskInput as X, createRequirementInput as Y, createSolutionNoteInput as Z, ISSUE_SEVERITIES as _, toImplementationUpdatePatch as _t, COMMITMENT_AUDIENCES as a, splitLinks as at, OBSERVATION_ASSESSMENTS as b, toRequirementPatch as bt, CONFIRMATION_STATUSES as c, toApprovalPatch as ct, DECISION_STATUSES as d, toCustomerPatch as dt, nextLifecycleStage as et, ESCALATION_SEVERITIES as f, toDecisionPatch as ft, FIELD_MAPPING_STATUSES as g, toImplementationPatch as gt, EXTRACTION_SECTIONS as h, toFieldMappingPatch as ht, APPROVAL_STATUSES as i, sowAnalysisSchema as it, analyzeSowInput as j, updateFieldMappingInput as jt, TIMING_SOURCE_LABEL as k, updateEscalationInput as kt, CONTACT_ROLES as l, toCommitmentPatch as lt, EVIDENCE_TYPES as m, toEvidencePatch as mt, ADOPTION_KIND_LABEL as n, proposedTimings as nt, COMMITMENT_STATUSES as o, toAdoptionAreaPatch as ot, ESCALATION_STATUSES as p, toEscalationPatch as pt, createJournalEntryInput as q, ADOPTION_STATES as r, setSowDocumentInput as rt, CONFIDENCE_LABEL as s, toAdoptionObservationRow as st, ADOPTION_KINDS as t, proposalAsNote as tt, CONTACT_ROLE_LABELS as u, toCustomerContactPatch as ut, ISSUE_STATUSES as v, toIssuePatch as vt, RISK_LIKELIHOODS as w, updateApprovalInput as wt, REQUIREMENT_PRIORITIES as x, toRiskPatch as xt, NOTE_TYPES as y, toObservationRow as yt, createConfirmationInput as z };
