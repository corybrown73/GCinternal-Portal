import { i as createServerFn } from "./server-c8UtrfAP.mjs";
import { t as requireSupabaseAuth } from "./auth-middleware-BpiY3ogQ.mjs";
import { a as objectType, c as stringType, r as enumType } from "../_libs/zod.mjs";
import { A as advanceStageInput, At as updateEvidenceInput, B as createCustomerContactInput, Ct as updateAdoptionAreaInput, D as SOLUTION_STATUSES, Dt as updateCustomerContactInput, Et as updateConfirmationInput, F as createAdoptionAreaInput, Ft as updateRiskInput, G as createImplementationInput, H as createEscalationInput, I as createAdoptionObservationInput, It as updateSolutionDesignInput, J as createObservationInput, K as createIssueInput, L as createApprovalInput, Lt as updateSuccessCriterionInput, M as applySowProposalInput, Mt as updateImplementationInput, N as attachmentPathInput, Nt as updateIssueInput, Ot as updateDecisionInput, Pt as updateRequirementInput, Q as createSuccessCriterionInput, R as createCommitmentInput, Rt as uploadAttachmentInput, St as toSuccessCriterionPatch, Tt as updateCommitmentInput, U as createEvidenceInput, V as createDecisionInput, W as createFieldMappingInput, X as createRiskInput, Y as createRequirementInput, Z as createSolutionNoteInput, _t as toImplementationUpdatePatch, bt as toRequirementPatch, ct as toApprovalPatch, dt as toCustomerPatch, ft as toDecisionPatch, gt as toImplementationPatch, ht as toFieldMappingPatch, j as analyzeSowInput, jt as updateFieldMappingInput, kt as updateEscalationInput, lt as toCommitmentPatch, mt as toEvidencePatch, ot as toAdoptionAreaPatch, pt as toEscalationPatch, q as createJournalEntryInput, rt as setSowDocumentInput, st as toAdoptionObservationRow, ut as toCustomerContactPatch, vt as toIssuePatch, wt as updateApprovalInput, xt as toRiskPatch, yt as toObservationRow, z as createConfirmationInput } from "./implementation-input-BaYoTLwL.mjs";
import { t as createServerRpc } from "./createServerRpc-CXcvml6V.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/hub.functions-V_619X01.js
var getHome_createServerFn_handler = createServerRpc({
	id: "13dc1b8fd2468a11b82f6d2bc86fc0364cfe815e9c99b89a2514facb71b39429",
	name: "getHome",
	filename: "src/lib/hub.functions.ts"
}, (opts) => getHome.__executeServer(opts));
var getHome = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(getHome_createServerFn_handler, async () => {
	const { loadHome } = await import("./hub.server-BTxjhvqi.mjs");
	return loadHome();
});
var getLeadership_createServerFn_handler = createServerRpc({
	id: "5c6d004193619598fbbb89ff9b94ac2c6fc2acbd98871ee74e5cc4580969eb52",
	name: "getLeadership",
	filename: "src/lib/hub.functions.ts"
}, (opts) => getLeadership.__executeServer(opts));
var getLeadership = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(getLeadership_createServerFn_handler, async () => {
	const { loadLeadership } = await import("./hub.server-BTxjhvqi.mjs");
	return loadLeadership();
});
var getImplementations_createServerFn_handler = createServerRpc({
	id: "c8cd6d7dc75d2ecf25bf5cdb907d168a6bd11653bab52ca4846f6769b0950043",
	name: "getImplementations",
	filename: "src/lib/hub.functions.ts"
}, (opts) => getImplementations.__executeServer(opts));
var getImplementations = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(getImplementations_createServerFn_handler, async () => {
	const { loadImplementations } = await import("./hub.server-BTxjhvqi.mjs");
	return loadImplementations();
});
var getCustomer360_createServerFn_handler = createServerRpc({
	id: "3c61229202b2f4be3dcc8cb27247b39c8aa0870b9f3b9143e7364d75363eb777",
	name: "getCustomer360",
	filename: "src/lib/hub.functions.ts"
}, (opts) => getCustomer360.__executeServer(opts));
var getCustomer360 = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	customerId: stringType().uuid(),
	implementationId: stringType().uuid().nullable().optional()
}).parse(data)).handler(getCustomer360_createServerFn_handler, async ({ data }) => {
	const { loadCustomer360 } = await import("./hub.server-BTxjhvqi.mjs");
	return loadCustomer360(data.customerId, data.implementationId ?? null);
});
var getTechnicalSolutions_createServerFn_handler = createServerRpc({
	id: "9d65418daed7919c0b1782a71836f72c92ecc92e63edbaf35e96c7d24eb142b4",
	name: "getTechnicalSolutions",
	filename: "src/lib/hub.functions.ts"
}, (opts) => getTechnicalSolutions.__executeServer(opts));
var getTechnicalSolutions = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(getTechnicalSolutions_createServerFn_handler, async () => {
	const { loadTechnicalSolutions } = await import("./hub.server-BTxjhvqi.mjs");
	return loadTechnicalSolutions();
});
var getTechnicalSolution_createServerFn_handler = createServerRpc({
	id: "b1c9118a306cc30159031ceefdf26337b5d65b7ea47e04a268b99fca00e2aff6",
	name: "getTechnicalSolution",
	filename: "src/lib/hub.functions.ts"
}, (opts) => getTechnicalSolution.__executeServer(opts));
var getTechnicalSolution = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ id: stringType().uuid() }).parse(data)).handler(getTechnicalSolution_createServerFn_handler, async ({ data }) => {
	const { loadTechnicalSolution } = await import("./hub.server-BTxjhvqi.mjs");
	return loadTechnicalSolution(data.id);
});
var setTechnicalSolutionOwner_createServerFn_handler = createServerRpc({
	id: "f0bb7607318ef3bd704521788535b86d37e09ddfe4d59667fe6d57140edd5e5d",
	name: "setTechnicalSolutionOwner",
	filename: "src/lib/hub.functions.ts"
}, (opts) => setTechnicalSolutionOwner.__executeServer(opts));
var setTechnicalSolutionOwner = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	id: stringType().uuid(),
	ownerId: stringType().uuid().nullable()
}).parse(data)).handler(setTechnicalSolutionOwner_createServerFn_handler, async ({ data }) => {
	const { updateTechnicalSolutionOwner } = await import("./hub.server-BTxjhvqi.mjs");
	return updateTechnicalSolutionOwner(data.id, data.ownerId);
});
var setTechnicalSolutionStatus_createServerFn_handler = createServerRpc({
	id: "b258480b97a7e32451686381f8f0b4cfc0a146a6eb4066dd229072fc05149019",
	name: "setTechnicalSolutionStatus",
	filename: "src/lib/hub.functions.ts"
}, (opts) => setTechnicalSolutionStatus.__executeServer(opts));
var setTechnicalSolutionStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	id: stringType().uuid(),
	status: enumType(SOLUTION_STATUSES)
}).parse(data)).handler(setTechnicalSolutionStatus_createServerFn_handler, async ({ data }) => {
	const { updateTechnicalSolutionStatus } = await import("./hub.server-BTxjhvqi.mjs");
	return updateTechnicalSolutionStatus(data.id, data.status);
});
var createTechnicalSolutionNote_createServerFn_handler = createServerRpc({
	id: "cb459560c6912636dec4c8a93c58665515751c0b76a37201ec688b3446bc79eb",
	name: "createTechnicalSolutionNote",
	filename: "src/lib/hub.functions.ts"
}, (opts) => createTechnicalSolutionNote.__executeServer(opts));
var createTechnicalSolutionNote = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createSolutionNoteInput.parse(data)).handler(createTechnicalSolutionNote_createServerFn_handler, async ({ data }) => {
	const { addTechnicalSolutionNote } = await import("./hub.server-BTxjhvqi.mjs");
	return addTechnicalSolutionNote(data);
});
var addFieldMapping_createServerFn_handler = createServerRpc({
	id: "441b820851199862d713b7f305c58fc882b1b9ba989904766a15e700b432c450",
	name: "addFieldMapping",
	filename: "src/lib/hub.functions.ts"
}, (opts) => addFieldMapping.__executeServer(opts));
var addFieldMapping = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createFieldMappingInput.parse(data)).handler(addFieldMapping_createServerFn_handler, async ({ data }) => {
	const { createFieldMapping } = await import("./hub.server-BTxjhvqi.mjs");
	const { technicalSolutionId, ...rest } = data;
	return createFieldMapping(technicalSolutionId, toFieldMappingPatch(rest));
});
var setFieldMapping_createServerFn_handler = createServerRpc({
	id: "c62bf59cc4dae9a904fd6e47b71011562d70eb209cc07278153950471960ac03",
	name: "setFieldMapping",
	filename: "src/lib/hub.functions.ts"
}, (opts) => setFieldMapping.__executeServer(opts));
var setFieldMapping = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateFieldMappingInput.parse(data)).handler(setFieldMapping_createServerFn_handler, async ({ data }) => {
	const { updateFieldMapping } = await import("./hub.server-BTxjhvqi.mjs");
	const { id, ...rest } = data;
	return updateFieldMapping(id, toFieldMappingPatch(rest));
});
var setSolutionDesign_createServerFn_handler = createServerRpc({
	id: "df54c52657da704be989eb1b958ff4bb357bb9de951cd94aa0e9634c45644f3b",
	name: "setSolutionDesign",
	filename: "src/lib/hub.functions.ts"
}, (opts) => setSolutionDesign.__executeServer(opts));
var setSolutionDesign = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateSolutionDesignInput.parse(data)).handler(setSolutionDesign_createServerFn_handler, async ({ data }) => {
	const { updateTechnicalSolutionDesign } = await import("./hub.server-BTxjhvqi.mjs");
	return updateTechnicalSolutionDesign(data.id, {
		design_summary: data.designSummary,
		configuration_details: data.configurationDetails
	});
});
var addSuccessCriterion_createServerFn_handler = createServerRpc({
	id: "f9f3792b7b3cec8fedafaba631b40d58a0b9ba430b3fd46cfc6c81fb7a4c23bf",
	name: "addSuccessCriterion",
	filename: "src/lib/hub.functions.ts"
}, (opts) => addSuccessCriterion.__executeServer(opts));
var addSuccessCriterion = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createSuccessCriterionInput.parse(data)).handler(addSuccessCriterion_createServerFn_handler, async ({ data }) => {
	const { createSuccessCriterion } = await import("./hub.server-BTxjhvqi.mjs");
	const { implementationId, ...rest } = data;
	return createSuccessCriterion(implementationId, toSuccessCriterionPatch(rest));
});
var setSuccessCriterion_createServerFn_handler = createServerRpc({
	id: "402727e556aa8771aa6bf088bcf4725b1207d200ab951c1ed3b7d6943f84983c",
	name: "setSuccessCriterion",
	filename: "src/lib/hub.functions.ts"
}, (opts) => setSuccessCriterion.__executeServer(opts));
var setSuccessCriterion = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateSuccessCriterionInput.parse(data)).handler(setSuccessCriterion_createServerFn_handler, async ({ data }) => {
	const { updateSuccessCriterion } = await import("./hub.server-BTxjhvqi.mjs");
	const { id, ...rest } = data;
	return updateSuccessCriterion(id, toSuccessCriterionPatch(rest));
});
var addSuccessCriterionObservation_createServerFn_handler = createServerRpc({
	id: "6fc28acd1efb40838fa011f039f9804790514c66f954407b285d348bba6d1304",
	name: "addSuccessCriterionObservation",
	filename: "src/lib/hub.functions.ts"
}, (opts) => addSuccessCriterionObservation.__executeServer(opts));
var addSuccessCriterionObservation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createObservationInput.parse(data)).handler(addSuccessCriterionObservation_createServerFn_handler, async ({ data }) => {
	const { createSuccessCriterionObservation } = await import("./hub.server-BTxjhvqi.mjs");
	return createSuccessCriterionObservation(toObservationRow(data));
});
var addSuccessCriterionConfirmation_createServerFn_handler = createServerRpc({
	id: "721462283efb14806ade3922560c46f17663d90765d8a67c71364aff57cb4d60",
	name: "addSuccessCriterionConfirmation",
	filename: "src/lib/hub.functions.ts"
}, (opts) => addSuccessCriterionConfirmation.__executeServer(opts));
var addSuccessCriterionConfirmation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createConfirmationInput.parse(data)).handler(addSuccessCriterionConfirmation_createServerFn_handler, async ({ data }) => {
	const { createSuccessCriterionConfirmation } = await import("./hub.server-BTxjhvqi.mjs");
	return createSuccessCriterionConfirmation(data);
});
var setSuccessCriterionConfirmation_createServerFn_handler = createServerRpc({
	id: "53fea0c9d65274973b8ae1e7e948df034518753513381aa8a7b5751cd6088db5",
	name: "setSuccessCriterionConfirmation",
	filename: "src/lib/hub.functions.ts"
}, (opts) => setSuccessCriterionConfirmation.__executeServer(opts));
var setSuccessCriterionConfirmation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateConfirmationInput.parse(data)).handler(setSuccessCriterionConfirmation_createServerFn_handler, async ({ data }) => {
	const { updateSuccessCriterionConfirmation } = await import("./hub.server-BTxjhvqi.mjs");
	return updateSuccessCriterionConfirmation(data.id, {
		status: data.status,
		evidenceId: data.evidenceId
	});
});
var addAdoptionArea_createServerFn_handler = createServerRpc({
	id: "ce0255a44f503f19c97daa4f8eef635dda7249d86ba1ac61808534aae3b2cca3",
	name: "addAdoptionArea",
	filename: "src/lib/hub.functions.ts"
}, (opts) => addAdoptionArea.__executeServer(opts));
var addAdoptionArea = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createAdoptionAreaInput.parse(data)).handler(addAdoptionArea_createServerFn_handler, async ({ data }) => {
	const { createAdoptionArea } = await import("./hub.server-BTxjhvqi.mjs");
	const { implementationId, ...rest } = data;
	return createAdoptionArea(implementationId, toAdoptionAreaPatch(rest));
});
var setAdoptionArea_createServerFn_handler = createServerRpc({
	id: "0187744400f066c5b6a0bcaf17b42712270e54ff150503b8a8fbcb37eceae208",
	name: "setAdoptionArea",
	filename: "src/lib/hub.functions.ts"
}, (opts) => setAdoptionArea.__executeServer(opts));
var setAdoptionArea = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateAdoptionAreaInput.parse(data)).handler(setAdoptionArea_createServerFn_handler, async ({ data }) => {
	const { updateAdoptionArea } = await import("./hub.server-BTxjhvqi.mjs");
	const { id, ...rest } = data;
	return updateAdoptionArea(id, toAdoptionAreaPatch(rest));
});
var addAdoptionObservation_createServerFn_handler = createServerRpc({
	id: "a87b2a0c4f3aca44d8aa4b645bec5f7c8f260d5e6a40db269a8d3731e0665493",
	name: "addAdoptionObservation",
	filename: "src/lib/hub.functions.ts"
}, (opts) => addAdoptionObservation.__executeServer(opts));
var addAdoptionObservation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createAdoptionObservationInput.parse(data)).handler(addAdoptionObservation_createServerFn_handler, async ({ data }) => {
	const { createAdoptionObservation } = await import("./hub.server-BTxjhvqi.mjs");
	return createAdoptionObservation(toAdoptionObservationRow(data));
});
var addCustomerContact_createServerFn_handler = createServerRpc({
	id: "60d1bdc5efce4ac3a3aeb26e1ab51597401b4abf2af542bf321645bc866df14d",
	name: "addCustomerContact",
	filename: "src/lib/hub.functions.ts"
}, (opts) => addCustomerContact.__executeServer(opts));
var addCustomerContact = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createCustomerContactInput.parse(data)).handler(addCustomerContact_createServerFn_handler, async ({ data }) => {
	const { createCustomerContact } = await import("./hub.server-BTxjhvqi.mjs");
	const { customerId, ...rest } = data;
	return createCustomerContact(customerId, toCustomerContactPatch(rest));
});
var setCustomerContact_createServerFn_handler = createServerRpc({
	id: "75c17231fa0b298fa6cd42b8b6d977cfdbc055753cb3dbaa6703ffe2805874a7",
	name: "setCustomerContact",
	filename: "src/lib/hub.functions.ts"
}, (opts) => setCustomerContact.__executeServer(opts));
var setCustomerContact = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateCustomerContactInput.parse(data)).handler(setCustomerContact_createServerFn_handler, async ({ data }) => {
	const { updateCustomerContact } = await import("./hub.server-BTxjhvqi.mjs");
	const { id, ...rest } = data;
	return updateCustomerContact(id, toCustomerContactPatch(rest));
});
var getTeamOptions_createServerFn_handler = createServerRpc({
	id: "963759b666420f3b03c1340c5e65718d8a340f6d3e13538b8fa449a2fa4dd283",
	name: "getTeamOptions",
	filename: "src/lib/hub.functions.ts"
}, (opts) => getTeamOptions.__executeServer(opts));
var getTeamOptions = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(getTeamOptions_createServerFn_handler, async () => {
	const { loadTeamOptions } = await import("./hub.server-BTxjhvqi.mjs");
	return loadTeamOptions();
});
var addImplementation_createServerFn_handler = createServerRpc({
	id: "88968ee17fc5acd3cecff05331e2a171f0af4e96ee16fb6006f048c5fc1f2ded",
	name: "addImplementation",
	filename: "src/lib/hub.functions.ts"
}, (opts) => addImplementation.__executeServer(opts));
var addImplementation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createImplementationInput.parse(data)).handler(addImplementation_createServerFn_handler, async ({ data }) => {
	const { createImplementation } = await import("./hub.server-BTxjhvqi.mjs");
	return createImplementation({
		customerId: data.customerId,
		newCustomer: data.newCustomer ? toCustomerPatch(data.newCustomer) : null,
		patch: toImplementationPatch(data)
	});
});
var setImplementation_createServerFn_handler = createServerRpc({
	id: "1f1d701ee1a4483e96af7ff0740cf0613367d4b062dd141fcb4afa7f648982b0",
	name: "setImplementation",
	filename: "src/lib/hub.functions.ts"
}, (opts) => setImplementation.__executeServer(opts));
var setImplementation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateImplementationInput.parse(data)).handler(setImplementation_createServerFn_handler, async ({ data }) => {
	const { updateImplementation } = await import("./hub.server-BTxjhvqi.mjs");
	return updateImplementation(data.id, toImplementationUpdatePatch(data));
});
var advanceImplementationStage_createServerFn_handler = createServerRpc({
	id: "79dde2fb4f47878d24d5fc6b8280db82710f9ec23a79a5613af57a13e3fc35a8",
	name: "advanceImplementationStage",
	filename: "src/lib/hub.functions.ts"
}, (opts) => advanceImplementationStage.__executeServer(opts));
var advanceImplementationStage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => advanceStageInput.parse(data)).handler(advanceImplementationStage_createServerFn_handler, async ({ data }) => {
	const { advanceStage } = await import("./hub.server-BTxjhvqi.mjs");
	return advanceStage({
		implementationId: data.implementationId,
		toStage: data.toStage,
		enteredBy: data.enteredBy,
		notes: data.notes
	});
});
var addRequirement_createServerFn_handler = createServerRpc({
	id: "baa7367d7db491f02080d15c1c589637ef341f9c3d99ffeea2fe3a4fd043512b",
	name: "addRequirement",
	filename: "src/lib/hub.functions.ts"
}, (opts) => addRequirement.__executeServer(opts));
var addRequirement = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createRequirementInput.parse(data)).handler(addRequirement_createServerFn_handler, async ({ data }) => {
	const { createRequirement } = await import("./hub.server-BTxjhvqi.mjs");
	const { implementationId, ...rest } = data;
	return createRequirement(implementationId, toRequirementPatch(rest));
});
var setRequirement_createServerFn_handler = createServerRpc({
	id: "b62d543e2a43a062669f0453093d1463dc98a80a984e0f8842cf0c210202ae34",
	name: "setRequirement",
	filename: "src/lib/hub.functions.ts"
}, (opts) => setRequirement.__executeServer(opts));
var setRequirement = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateRequirementInput.parse(data)).handler(setRequirement_createServerFn_handler, async ({ data }) => {
	const { updateRequirement } = await import("./hub.server-BTxjhvqi.mjs");
	const { id, ...rest } = data;
	return updateRequirement(id, toRequirementPatch(rest));
});
var addRisk_createServerFn_handler = createServerRpc({
	id: "e2888c3a97e855aa5c94590a2718a07135e19781ca39a47da3cb8f1a95927a1c",
	name: "addRisk",
	filename: "src/lib/hub.functions.ts"
}, (opts) => addRisk.__executeServer(opts));
var addRisk = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createRiskInput.parse(data)).handler(addRisk_createServerFn_handler, async ({ data }) => {
	const { createRisk } = await import("./hub.server-BTxjhvqi.mjs");
	const { implementationId, ...rest } = data;
	return createRisk(implementationId, toRiskPatch(rest));
});
var setRisk_createServerFn_handler = createServerRpc({
	id: "48a012658d605fc967fef9b5a4691cea3c04452a31db6d14540a65b9e9c97599",
	name: "setRisk",
	filename: "src/lib/hub.functions.ts"
}, (opts) => setRisk.__executeServer(opts));
var setRisk = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateRiskInput.parse(data)).handler(setRisk_createServerFn_handler, async ({ data }) => {
	const { updateRisk } = await import("./hub.server-BTxjhvqi.mjs");
	const { id, ...rest } = data;
	return updateRisk(id, toRiskPatch(rest));
});
var addIssue_createServerFn_handler = createServerRpc({
	id: "e6b0ecfc2e3c50a5c21219fefaf632c3399deb088d12d4b939565b5aab4ace6f",
	name: "addIssue",
	filename: "src/lib/hub.functions.ts"
}, (opts) => addIssue.__executeServer(opts));
var addIssue = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createIssueInput.parse(data)).handler(addIssue_createServerFn_handler, async ({ data }) => {
	const { createIssue } = await import("./hub.server-BTxjhvqi.mjs");
	const { implementationId, ...rest } = data;
	return createIssue(implementationId, toIssuePatch(rest));
});
var setIssue_createServerFn_handler = createServerRpc({
	id: "e1e98ced09e2437b49567aa4f3cdfb1132bbe6d0d8f1b40800ab29cf1058bcf8",
	name: "setIssue",
	filename: "src/lib/hub.functions.ts"
}, (opts) => setIssue.__executeServer(opts));
var setIssue = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateIssueInput.parse(data)).handler(setIssue_createServerFn_handler, async ({ data }) => {
	const { updateIssue } = await import("./hub.server-BTxjhvqi.mjs");
	const { id, ...rest } = data;
	return updateIssue(id, toIssuePatch(rest));
});
var addEscalation_createServerFn_handler = createServerRpc({
	id: "a4333bb243fe86bf22c56524a5909a84d9e737427df91a297d45be62b4aa2157",
	name: "addEscalation",
	filename: "src/lib/hub.functions.ts"
}, (opts) => addEscalation.__executeServer(opts));
var addEscalation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createEscalationInput.parse(data)).handler(addEscalation_createServerFn_handler, async ({ data }) => {
	const { createEscalation } = await import("./hub.server-BTxjhvqi.mjs");
	const { implementationId, ...rest } = data;
	return createEscalation(implementationId, toEscalationPatch(rest));
});
var setEscalation_createServerFn_handler = createServerRpc({
	id: "26557c331dadfa8aafba6ddc9dc136911a88cf5698106743ed35e42190234459",
	name: "setEscalation",
	filename: "src/lib/hub.functions.ts"
}, (opts) => setEscalation.__executeServer(opts));
var setEscalation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateEscalationInput.parse(data)).handler(setEscalation_createServerFn_handler, async ({ data }) => {
	const { updateEscalation } = await import("./hub.server-BTxjhvqi.mjs");
	const { id, ...rest } = data;
	return updateEscalation(id, toEscalationPatch(rest));
});
var addDecision_createServerFn_handler = createServerRpc({
	id: "e9c74844498443df756b4ee254a8341f173c071f7c1959a558eb5aa6c038df9a",
	name: "addDecision",
	filename: "src/lib/hub.functions.ts"
}, (opts) => addDecision.__executeServer(opts));
var addDecision = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createDecisionInput.parse(data)).handler(addDecision_createServerFn_handler, async ({ data }) => {
	const { createDecision } = await import("./hub.server-BTxjhvqi.mjs");
	const { implementationId, ...rest } = data;
	return createDecision(implementationId, toDecisionPatch(rest));
});
var setDecision_createServerFn_handler = createServerRpc({
	id: "b453053c8e9c41a1375f73820b2f76e97d219c065a4b0740e5c9da0a488f2412",
	name: "setDecision",
	filename: "src/lib/hub.functions.ts"
}, (opts) => setDecision.__executeServer(opts));
var setDecision = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateDecisionInput.parse(data)).handler(setDecision_createServerFn_handler, async ({ data }) => {
	const { updateDecision } = await import("./hub.server-BTxjhvqi.mjs");
	const { id, ...rest } = data;
	return updateDecision(id, toDecisionPatch(rest));
});
var addCommitment_createServerFn_handler = createServerRpc({
	id: "7d7558b14af75ce05be517b32ce21e5b93ab7daa491886ff04707b29b92fd13a",
	name: "addCommitment",
	filename: "src/lib/hub.functions.ts"
}, (opts) => addCommitment.__executeServer(opts));
var addCommitment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createCommitmentInput.parse(data)).handler(addCommitment_createServerFn_handler, async ({ data }) => {
	const { createCommitment } = await import("./hub.server-BTxjhvqi.mjs");
	const { implementationId, ...rest } = data;
	return createCommitment(implementationId, toCommitmentPatch(rest));
});
var setCommitment_createServerFn_handler = createServerRpc({
	id: "b5d08b3e985b554699b27c5722cea9d02542d1a0960bde4a6ab3777c618787d2",
	name: "setCommitment",
	filename: "src/lib/hub.functions.ts"
}, (opts) => setCommitment.__executeServer(opts));
var setCommitment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateCommitmentInput.parse(data)).handler(setCommitment_createServerFn_handler, async ({ data }) => {
	const { updateCommitment } = await import("./hub.server-BTxjhvqi.mjs");
	const { id, ...rest } = data;
	return updateCommitment(id, toCommitmentPatch(rest));
});
var addEvidence_createServerFn_handler = createServerRpc({
	id: "2f41fefed51250101276648b9ea2acc673684cc8c3d6ca6b70c7f73b1e5bf3ed",
	name: "addEvidence",
	filename: "src/lib/hub.functions.ts"
}, (opts) => addEvidence.__executeServer(opts));
var addEvidence = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createEvidenceInput.parse(data)).handler(addEvidence_createServerFn_handler, async ({ data }) => {
	const { createEvidence } = await import("./hub.server-BTxjhvqi.mjs");
	const { implementationId, ...rest } = data;
	return createEvidence(implementationId, toEvidencePatch(rest));
});
var setEvidence_createServerFn_handler = createServerRpc({
	id: "b3f7688085c80a85ccc6cfc3e934040210fd246963a42bdc8ed9b66aecccd264",
	name: "setEvidence",
	filename: "src/lib/hub.functions.ts"
}, (opts) => setEvidence.__executeServer(opts));
var setEvidence = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateEvidenceInput.parse(data)).handler(setEvidence_createServerFn_handler, async ({ data }) => {
	const { updateEvidence } = await import("./hub.server-BTxjhvqi.mjs");
	const { id, ...rest } = data;
	return updateEvidence(id, toEvidencePatch(rest));
});
var addApproval_createServerFn_handler = createServerRpc({
	id: "d0e723e6dc0b4f7861d9f0bd04dcf8eb4e6f115c1911bda788443d2b7b227a38",
	name: "addApproval",
	filename: "src/lib/hub.functions.ts"
}, (opts) => addApproval.__executeServer(opts));
var addApproval = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createApprovalInput.parse(data)).handler(addApproval_createServerFn_handler, async ({ data }) => {
	const { createApproval } = await import("./hub.server-BTxjhvqi.mjs");
	const { implementationId, ...rest } = data;
	return createApproval(implementationId, toApprovalPatch(rest));
});
var setApproval_createServerFn_handler = createServerRpc({
	id: "d277f716bd7964653723385e9a0ad914fa91683f7e478d9fea75c0229c31a21f",
	name: "setApproval",
	filename: "src/lib/hub.functions.ts"
}, (opts) => setApproval.__executeServer(opts));
var setApproval = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateApprovalInput.parse(data)).handler(setApproval_createServerFn_handler, async ({ data }) => {
	const { updateApproval } = await import("./hub.server-BTxjhvqi.mjs");
	const { id, ...rest } = data;
	return updateApproval(id, toApprovalPatch(rest));
});
var addJournalEntry_createServerFn_handler = createServerRpc({
	id: "11d984ee9b02c144eb3c8c2e999f0fd13ebbb65b1c869cc961e533afecc09156",
	name: "addJournalEntry",
	filename: "src/lib/hub.functions.ts"
}, (opts) => addJournalEntry.__executeServer(opts));
var addJournalEntry = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createJournalEntryInput.parse(data)).handler(addJournalEntry_createServerFn_handler, async ({ data }) => {
	const { createJournalEntry } = await import("./hub.server-BTxjhvqi.mjs");
	return createJournalEntry(data);
});
var uploadAttachment_createServerFn_handler = createServerRpc({
	id: "84b454c2dbe298c49c29a3268a68d4a4862f1ada1cd0392664a1195bff082936",
	name: "uploadAttachment",
	filename: "src/lib/hub.functions.ts"
}, (opts) => uploadAttachment.__executeServer(opts));
var uploadAttachment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => uploadAttachmentInput.parse(data)).handler(uploadAttachment_createServerFn_handler, async ({ data }) => {
	const { storeAttachment } = await import("./hub.server-BTxjhvqi.mjs");
	return storeAttachment(data);
});
var getAttachmentLink_createServerFn_handler = createServerRpc({
	id: "92b7a40f4738f3274df36a67f92c35bab2d0a0e5e3c666aa6d7f4c20cb03ae08",
	name: "getAttachmentLink",
	filename: "src/lib/hub.functions.ts"
}, (opts) => getAttachmentLink.__executeServer(opts));
var getAttachmentLink = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => attachmentPathInput.parse(data)).handler(getAttachmentLink_createServerFn_handler, async ({ data }) => {
	const { attachmentLink } = await import("./hub.server-BTxjhvqi.mjs");
	return attachmentLink(data.path);
});
var analyzeSowDocument_createServerFn_handler = createServerRpc({
	id: "8b6eb064180cb98b48193479ad205d04edb755a849de0be96282f139a0c24e5b",
	name: "analyzeSowDocument",
	filename: "src/lib/hub.functions.ts"
}, (opts) => analyzeSowDocument.__executeServer(opts));
var analyzeSowDocument = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => analyzeSowInput.parse(data)).handler(analyzeSowDocument_createServerFn_handler, async ({ data }) => {
	const { analyzeSow } = await import("./sow-analysis.server-C-_L3YqQ.mjs");
	return analyzeSow(data.implementationId);
});
var applySowProposalToImplementation_createServerFn_handler = createServerRpc({
	id: "1b702ebbcfcc87f000465da994eafa6aebb41fe239b5d37a9f654f47c70193fd",
	name: "applySowProposalToImplementation",
	filename: "src/lib/hub.functions.ts"
}, (opts) => applySowProposalToImplementation.__executeServer(opts));
var applySowProposalToImplementation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => applySowProposalInput.parse(data)).handler(applySowProposalToImplementation_createServerFn_handler, async ({ data }) => {
	const { applySowProposal } = await import("./sow-analysis.server-C-_L3YqQ.mjs");
	return applySowProposal(data);
});
var setSowDocumentForImplementation_createServerFn_handler = createServerRpc({
	id: "2b4a00e75705048f3a099d71c2cf3aca1853709c4ef27d0276e4c6e9ef4adf63",
	name: "setSowDocumentForImplementation",
	filename: "src/lib/hub.functions.ts"
}, (opts) => setSowDocumentForImplementation.__executeServer(opts));
var setSowDocumentForImplementation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => setSowDocumentInput.parse(data)).handler(setSowDocumentForImplementation_createServerFn_handler, async ({ data }) => {
	const { setSowDocument } = await import("./sow-analysis.server-C-_L3YqQ.mjs");
	return setSowDocument(data);
});
//#endregion
export { addAdoptionArea_createServerFn_handler, addAdoptionObservation_createServerFn_handler, addApproval_createServerFn_handler, addCommitment_createServerFn_handler, addCustomerContact_createServerFn_handler, addDecision_createServerFn_handler, addEscalation_createServerFn_handler, addEvidence_createServerFn_handler, addFieldMapping_createServerFn_handler, addImplementation_createServerFn_handler, addIssue_createServerFn_handler, addJournalEntry_createServerFn_handler, addRequirement_createServerFn_handler, addRisk_createServerFn_handler, addSuccessCriterionConfirmation_createServerFn_handler, addSuccessCriterionObservation_createServerFn_handler, addSuccessCriterion_createServerFn_handler, advanceImplementationStage_createServerFn_handler, analyzeSowDocument_createServerFn_handler, applySowProposalToImplementation_createServerFn_handler, createTechnicalSolutionNote_createServerFn_handler, getAttachmentLink_createServerFn_handler, getCustomer360_createServerFn_handler, getHome_createServerFn_handler, getImplementations_createServerFn_handler, getLeadership_createServerFn_handler, getTeamOptions_createServerFn_handler, getTechnicalSolution_createServerFn_handler, getTechnicalSolutions_createServerFn_handler, setAdoptionArea_createServerFn_handler, setApproval_createServerFn_handler, setCommitment_createServerFn_handler, setCustomerContact_createServerFn_handler, setDecision_createServerFn_handler, setEscalation_createServerFn_handler, setEvidence_createServerFn_handler, setFieldMapping_createServerFn_handler, setImplementation_createServerFn_handler, setIssue_createServerFn_handler, setRequirement_createServerFn_handler, setRisk_createServerFn_handler, setSolutionDesign_createServerFn_handler, setSowDocumentForImplementation_createServerFn_handler, setSuccessCriterionConfirmation_createServerFn_handler, setSuccessCriterion_createServerFn_handler, setTechnicalSolutionOwner_createServerFn_handler, setTechnicalSolutionStatus_createServerFn_handler, uploadAttachment_createServerFn_handler };
