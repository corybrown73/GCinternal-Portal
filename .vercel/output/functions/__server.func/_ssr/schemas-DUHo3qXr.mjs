import { a as objectType, c as stringType, i as numberType, r as enumType, t as arrayType } from "../_libs/zod.mjs";
import { t as STAGES } from "./presale-stages-BXcdOdDO.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/schemas-DUHo3qXr.js
var stageSchema = enumType(STAGES);
var isoDate = stringType().refine((v) => !Number.isNaN(Date.parse(v)), "must be an ISO-8601 timestamp");
var accountUpsertSchema = objectType({
	salesforce_id: stringType().trim().min(1).optional(),
	name: stringType().trim().min(1, "name is required"),
	domain: stringType().trim().toLowerCase().optional(),
	stage: stageSchema.optional(),
	arr: numberType().nonnegative().optional(),
	products: arrayType(stringType().trim()).optional(),
	am_owner_email: stringType().email().optional(),
	se_owner_email: stringType().email().optional(),
	summary: stringType().max(1e4).optional()
});
var transitionSchema = objectType({
	to_stage: stageSchema,
	note: stringType().max(2e3).optional(),
	occurred_at: isoDate.optional()
});
var tamRequestCreateSchema = objectType({
	account_id: stringType().trim().min(1),
	requester_email: stringType().email(),
	justification: stringType().trim().min(10, "justification must be at least 10 characters"),
	urgency: enumType([
		"low",
		"medium",
		"high"
	]).default("medium")
});
var briefJsonSchema = objectType({
	account_name: stringType(),
	one_liner: stringType(),
	current_process: arrayType(objectType({
		title: stringType(),
		bullets: arrayType(stringType())
	})),
	goals: arrayType(stringType()),
	what_we_know: arrayType(objectType({
		topic: stringType(),
		detail: stringType()
	})),
	stakeholders: arrayType(objectType({
		name: stringType(),
		role: stringType(),
		notes: stringType()
	})),
	risks_open_items: arrayType(stringType()),
	discovery_questions: arrayType(objectType({
		question: stringType(),
		why_it_matters: stringType(),
		category: stringType()
	})),
	process_gaps: arrayType(stringType())
});
//#endregion
export { accountUpsertSchema, briefJsonSchema, tamRequestCreateSchema, transitionSchema };
