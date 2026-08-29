import { o as __toESM } from "../_runtime.mjs";
import { i as require_react } from "../_libs/dnd-kit__accessibility+react.mjs";
import { N as notFound, c as HeadContent, d as createRouter, f as Outlet, g as Link, h as createRootRouteWithContext, l as useRouterState, m as createFileRoute, p as lazyRouteComponent, s as Scripts, v as useRouter } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { n as LIFECYCLE_STAGES } from "./lifecycle-Cl8aBFg1.mjs";
import { o as humanize } from "./hub-format--ProSxvQ.mjs";
import { n as clsx } from "../_libs/class-variance-authority+clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { i as createServerFn, o as getServerFnById, t as TSS_SERVER_FUNCTION } from "./server-c8UtrfAP.mjs";
import { n as __exportAll } from "./server-c8UtrfAP2.mjs";
import { t as requireSupabaseAuth } from "./auth-middleware-BpiY3ogQ.mjs";
import { t as supabase } from "./client-CPrQaXre.mjs";
import { a as objectType, c as stringType, i as numberType, l as unknownType, n as booleanType, r as enumType, s as recordType, t as arrayType, u as ZodError } from "../_libs/zod.mjs";
import { A as advanceStageInput, At as updateEvidenceInput, B as createCustomerContactInput, Ct as updateAdoptionAreaInput, D as SOLUTION_STATUSES, Dt as updateCustomerContactInput, Et as updateConfirmationInput, F as createAdoptionAreaInput, Ft as updateRiskInput, G as createImplementationInput, H as createEscalationInput, I as createAdoptionObservationInput, It as updateSolutionDesignInput, J as createObservationInput, K as createIssueInput, L as createApprovalInput, Lt as updateSuccessCriterionInput, M as applySowProposalInput, Mt as updateImplementationInput, N as attachmentPathInput, Nt as updateIssueInput, Ot as updateDecisionInput, Pt as updateRequirementInput, Q as createSuccessCriterionInput, R as createCommitmentInput, Rt as uploadAttachmentInput, Tt as updateCommitmentInput, U as createEvidenceInput, V as createDecisionInput, W as createFieldMappingInput, X as createRiskInput, Y as createRequirementInput, Z as createSolutionNoteInput, j as analyzeSowInput, jt as updateFieldMappingInput, kt as updateEscalationInput, q as createJournalEntryInput, rt as setSowDocumentInput, wt as updateApprovalInput, z as createConfirmationInput } from "./implementation-input-BaYoTLwL.mjs";
import { t as STAGES } from "./presale-stages-BXcdOdDO.mjs";
import { a as QueryClientProvider, i as useQuery, n as queryOptions, o as useQueryClient } from "../_libs/tanstack__react-query.mjs";
import { t as QueryClient } from "../_libs/tanstack__query-core.mjs";
import { a as Trigger, i as Root3, n as Portal, r as Provider, t as Content2 } from "../_libs/@radix-ui/react-tooltip+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/utils-C_uf36nf.js
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
//#endregion
//#region node_modules/.nitro/vite/services/ssr/assets/createSsrRpc-D0bGruiu.js
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
//#endregion
//#region node_modules/.nitro/vite/services/ssr/assets/hub.functions-pR5g4Mi0.js
var getHome = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(createSsrRpc("13dc1b8fd2468a11b82f6d2bc86fc0364cfe815e9c99b89a2514facb71b39429"));
var getLeadership = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(createSsrRpc("5c6d004193619598fbbb89ff9b94ac2c6fc2acbd98871ee74e5cc4580969eb52"));
createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(createSsrRpc("c8cd6d7dc75d2ecf25bf5cdb907d168a6bd11653bab52ca4846f6769b0950043"));
var getCustomer360 = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	customerId: stringType().uuid(),
	implementationId: stringType().uuid().nullable().optional()
}).parse(data)).handler(createSsrRpc("3c61229202b2f4be3dcc8cb27247b39c8aa0870b9f3b9143e7364d75363eb777"));
var getTechnicalSolutions = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(createSsrRpc("9d65418daed7919c0b1782a71836f72c92ecc92e63edbaf35e96c7d24eb142b4"));
var getTechnicalSolution = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ id: stringType().uuid() }).parse(data)).handler(createSsrRpc("b1c9118a306cc30159031ceefdf26337b5d65b7ea47e04a268b99fca00e2aff6"));
var setTechnicalSolutionOwner = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	id: stringType().uuid(),
	ownerId: stringType().uuid().nullable()
}).parse(data)).handler(createSsrRpc("f0bb7607318ef3bd704521788535b86d37e09ddfe4d59667fe6d57140edd5e5d"));
var setTechnicalSolutionStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	id: stringType().uuid(),
	status: enumType(SOLUTION_STATUSES)
}).parse(data)).handler(createSsrRpc("b258480b97a7e32451686381f8f0b4cfc0a146a6eb4066dd229072fc05149019"));
var createTechnicalSolutionNote = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createSolutionNoteInput.parse(data)).handler(createSsrRpc("cb459560c6912636dec4c8a93c58665515751c0b76a37201ec688b3446bc79eb"));
var addFieldMapping = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createFieldMappingInput.parse(data)).handler(createSsrRpc("441b820851199862d713b7f305c58fc882b1b9ba989904766a15e700b432c450"));
var setFieldMapping = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateFieldMappingInput.parse(data)).handler(createSsrRpc("c62bf59cc4dae9a904fd6e47b71011562d70eb209cc07278153950471960ac03"));
var setSolutionDesign = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateSolutionDesignInput.parse(data)).handler(createSsrRpc("df54c52657da704be989eb1b958ff4bb357bb9de951cd94aa0e9634c45644f3b"));
var addSuccessCriterion = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createSuccessCriterionInput.parse(data)).handler(createSsrRpc("f9f3792b7b3cec8fedafaba631b40d58a0b9ba430b3fd46cfc6c81fb7a4c23bf"));
var setSuccessCriterion = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateSuccessCriterionInput.parse(data)).handler(createSsrRpc("402727e556aa8771aa6bf088bcf4725b1207d200ab951c1ed3b7d6943f84983c"));
var addSuccessCriterionObservation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createObservationInput.parse(data)).handler(createSsrRpc("6fc28acd1efb40838fa011f039f9804790514c66f954407b285d348bba6d1304"));
var addSuccessCriterionConfirmation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createConfirmationInput.parse(data)).handler(createSsrRpc("721462283efb14806ade3922560c46f17663d90765d8a67c71364aff57cb4d60"));
var setSuccessCriterionConfirmation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateConfirmationInput.parse(data)).handler(createSsrRpc("53fea0c9d65274973b8ae1e7e948df034518753513381aa8a7b5751cd6088db5"));
var addAdoptionArea = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createAdoptionAreaInput.parse(data)).handler(createSsrRpc("ce0255a44f503f19c97daa4f8eef635dda7249d86ba1ac61808534aae3b2cca3"));
var setAdoptionArea = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateAdoptionAreaInput.parse(data)).handler(createSsrRpc("0187744400f066c5b6a0bcaf17b42712270e54ff150503b8a8fbcb37eceae208"));
var addAdoptionObservation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createAdoptionObservationInput.parse(data)).handler(createSsrRpc("a87b2a0c4f3aca44d8aa4b645bec5f7c8f260d5e6a40db269a8d3731e0665493"));
var addCustomerContact = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createCustomerContactInput.parse(data)).handler(createSsrRpc("60d1bdc5efce4ac3a3aeb26e1ab51597401b4abf2af542bf321645bc866df14d"));
var setCustomerContact = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateCustomerContactInput.parse(data)).handler(createSsrRpc("75c17231fa0b298fa6cd42b8b6d977cfdbc055753cb3dbaa6703ffe2805874a7"));
var getTeamOptions = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(createSsrRpc("963759b666420f3b03c1340c5e65718d8a340f6d3e13538b8fa449a2fa4dd283"));
var addImplementation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createImplementationInput.parse(data)).handler(createSsrRpc("88968ee17fc5acd3cecff05331e2a171f0af4e96ee16fb6006f048c5fc1f2ded"));
var setImplementation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateImplementationInput.parse(data)).handler(createSsrRpc("1f1d701ee1a4483e96af7ff0740cf0613367d4b062dd141fcb4afa7f648982b0"));
var advanceImplementationStage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => advanceStageInput.parse(data)).handler(createSsrRpc("79dde2fb4f47878d24d5fc6b8280db82710f9ec23a79a5613af57a13e3fc35a8"));
var addRequirement = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createRequirementInput.parse(data)).handler(createSsrRpc("baa7367d7db491f02080d15c1c589637ef341f9c3d99ffeea2fe3a4fd043512b"));
var setRequirement = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateRequirementInput.parse(data)).handler(createSsrRpc("b62d543e2a43a062669f0453093d1463dc98a80a984e0f8842cf0c210202ae34"));
var addRisk = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createRiskInput.parse(data)).handler(createSsrRpc("e2888c3a97e855aa5c94590a2718a07135e19781ca39a47da3cb8f1a95927a1c"));
var setRisk = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateRiskInput.parse(data)).handler(createSsrRpc("48a012658d605fc967fef9b5a4691cea3c04452a31db6d14540a65b9e9c97599"));
var addIssue = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createIssueInput.parse(data)).handler(createSsrRpc("e6b0ecfc2e3c50a5c21219fefaf632c3399deb088d12d4b939565b5aab4ace6f"));
var setIssue = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateIssueInput.parse(data)).handler(createSsrRpc("e1e98ced09e2437b49567aa4f3cdfb1132bbe6d0d8f1b40800ab29cf1058bcf8"));
var addEscalation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createEscalationInput.parse(data)).handler(createSsrRpc("a4333bb243fe86bf22c56524a5909a84d9e737427df91a297d45be62b4aa2157"));
var setEscalation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateEscalationInput.parse(data)).handler(createSsrRpc("26557c331dadfa8aafba6ddc9dc136911a88cf5698106743ed35e42190234459"));
var addDecision = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createDecisionInput.parse(data)).handler(createSsrRpc("e9c74844498443df756b4ee254a8341f173c071f7c1959a558eb5aa6c038df9a"));
var setDecision = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateDecisionInput.parse(data)).handler(createSsrRpc("b453053c8e9c41a1375f73820b2f76e97d219c065a4b0740e5c9da0a488f2412"));
var addCommitment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createCommitmentInput.parse(data)).handler(createSsrRpc("7d7558b14af75ce05be517b32ce21e5b93ab7daa491886ff04707b29b92fd13a"));
var setCommitment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateCommitmentInput.parse(data)).handler(createSsrRpc("b5d08b3e985b554699b27c5722cea9d02542d1a0960bde4a6ab3777c618787d2"));
var addEvidence = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createEvidenceInput.parse(data)).handler(createSsrRpc("2f41fefed51250101276648b9ea2acc673684cc8c3d6ca6b70c7f73b1e5bf3ed"));
var setEvidence = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateEvidenceInput.parse(data)).handler(createSsrRpc("b3f7688085c80a85ccc6cfc3e934040210fd246963a42bdc8ed9b66aecccd264"));
var addApproval = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createApprovalInput.parse(data)).handler(createSsrRpc("d0e723e6dc0b4f7861d9f0bd04dcf8eb4e6f115c1911bda788443d2b7b227a38"));
var setApproval = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => updateApprovalInput.parse(data)).handler(createSsrRpc("d277f716bd7964653723385e9a0ad914fa91683f7e478d9fea75c0229c31a21f"));
var addJournalEntry = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => createJournalEntryInput.parse(data)).handler(createSsrRpc("11d984ee9b02c144eb3c8c2e999f0fd13ebbb65b1c869cc961e533afecc09156"));
var uploadAttachment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => uploadAttachmentInput.parse(data)).handler(createSsrRpc("84b454c2dbe298c49c29a3268a68d4a4862f1ada1cd0392664a1195bff082936"));
var getAttachmentLink = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => attachmentPathInput.parse(data)).handler(createSsrRpc("92b7a40f4738f3274df36a67f92c35bab2d0a0e5e3c666aa6d7f4c20cb03ae08"));
var analyzeSowDocument = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => analyzeSowInput.parse(data)).handler(createSsrRpc("8b6eb064180cb98b48193479ad205d04edb755a849de0be96282f139a0c24e5b"));
var applySowProposalToImplementation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => applySowProposalInput.parse(data)).handler(createSsrRpc("1b702ebbcfcc87f000465da994eafa6aebb41fe239b5d37a9f654f47c70193fd"));
var setSowDocumentForImplementation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => setSowDocumentInput.parse(data)).handler(createSsrRpc("2b4a00e75705048f3a099d71c2cf3aca1853709c4ef27d0276e4c6e9ef4adf63"));
//#endregion
//#region node_modules/.nitro/vite/services/ssr/assets/presale.functions-Jiirdckb.js
var getPipeline = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(createSsrRpc("d0c25d6e1184a7d22b6f6f82906a3805f6522e81cd67a9273bbf389849ae3e41"));
var addDeal = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	name: stringType().trim().min(1, "Name is required"),
	domain: stringType().trim().nullable(),
	salesforceId: stringType().trim().nullable(),
	arr: numberType().nonnegative().nullable(),
	summary: stringType().max(1e4).nullable()
}).parse(data)).handler(createSsrRpc("f1bda210b7f88725eaa3329e05abb11ab05ad8d5c06e9415eaaf2c933211c02c"));
var moveDealStage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	dealId: stringType().uuid(),
	toStage: enumType(STAGES),
	note: stringType().max(2e3).optional()
}).parse(data)).handler(createSsrRpc("68739b5f2f36c37d418264b239e45e8d941f9e750067a7de352687bd93f81e5f"));
var importDeals = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ csv: stringType().min(1, "The CSV file is empty").max(2097152) }).parse(data)).handler(createSsrRpc("3f9c8266ffc02b524c75bcd7d850197f1917d8dda5bfa1761f213f218a457aef"));
var getDeal = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ dealId: stringType().uuid() }).parse(data)).handler(createSsrRpc("90c860a0ac9b91a481bca73330335eb7b980da35389ecefed0b2b9f1e682c7c7"));
var addReport = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	dealId: stringType().uuid(),
	title: stringType().trim().min(1, "Title is required"),
	reportType: enumType(["call_notes", "account_map"]),
	contentMd: stringType().trim().min(1, "Paste or upload some content first")
}).parse(data)).handler(createSsrRpc("416c6bdfecd3543652edc8ca169a6e15ad8c0f44bca60572437f4eab30d1ee0e"));
var removeReport = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ reportId: stringType().uuid() }).parse(data)).handler(createSsrRpc("92bc4d4bd0b6a90017b54ef095377ac84fc6988095cba0c213bcd4ad5023783a"));
var generateBriefForDeal = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ dealId: stringType().uuid() }).parse(data)).handler(createSsrRpc("9270b2efa09bda8039db5c9d2e22a8e617827d479b76d4899d342673e84fc967"));
var getBriefDownloadUrl = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ briefId: stringType().uuid() }).parse(data)).handler(createSsrRpc("e6851a833b18b5e285ee72c016410e50543e5afb8fb77b39d8e81fbad3c2cf0c"));
var createTamRequestForDeal = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	dealId: stringType().uuid(),
	justification: stringType().trim().min(10, "Justification must be at least 10 characters"),
	urgency: enumType([
		"low",
		"medium",
		"high"
	])
}).parse(data)).handler(createSsrRpc("04d8d312fd96d422f837e68299453c70dff7b7beaba5236e792559ae7e88b096"));
var addNote = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	dealId: stringType().uuid(),
	bodyMd: stringType().trim().min(1, "Write something first")
}).parse(data)).handler(createSsrRpc("d2db611cceb79978daaa9867e11ecd2fa00f50af580e595a9435711e924d8f70"));
var setNoteReviewed = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	noteId: stringType().uuid(),
	reviewed: booleanType()
}).parse(data)).handler(createSsrRpc("e9521b0e5516449c9d80433ba3ec886a7c6abf826afb6a89f6ae3fd2b33789bd"));
var removeNote = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ noteId: stringType().uuid() }).parse(data)).handler(createSsrRpc("7e86340e87a5540dc46e752a31543a4388a5b1e11ca6981ef434b235234672fb"));
var startOnboardingForDeal = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ dealId: stringType().uuid() }).parse(data)).handler(createSsrRpc("e096c0b37026a1d5fc2221b2440f53440128ceb790b7a85010adcd5773f014c2"));
var getApiKeys = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(createSsrRpc("5cc789e9ba44cb02f6d2268a8872e7d0be76d398adf9b3892f21126172ac0eac"));
var createApiKey = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	name: stringType().trim().min(1, "Name is required"),
	scopes: arrayType(stringType()).min(1, "Pick at least one scope")
}).parse(data)).handler(createSsrRpc("c65783f3f42fd7f34c03e851331d6051234fea36acd6c16ec98ba56ac8814b77"));
var revokeApiKey = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({ keyId: stringType().uuid() }).parse(data)).handler(createSsrRpc("a1eadc39af54dc98b24aae239ad42d56b7b06c4a0bb6c54cd033091744b22afd"));
var getUsers = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(createSsrRpc("4d4c2f26853eb017feb152b6f4512fbe987385e94a5e68fe33e2576d48cb8368"));
var setUserRole = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => objectType({
	profileId: stringType().uuid(),
	role: enumType([
		"super_admin",
		"manager",
		"sales",
		"implementation",
		"tam_se",
		"customer"
	])
}).parse(data)).handler(createSsrRpc("f3cc722a09e8be0aa24a98c1b5da57dfbedabd7bbce73608e802df868ac4237a"));
//#endregion
//#region node_modules/.nitro/vite/services/ssr/assets/journeys.functions-D2AOS2hF.js
var getJourneys = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(createSsrRpc("fa898a0394b89dba72723153e4d2ca6cd8aef0b2236d6f05e3d1840b19be2ed0"));
var getJourneyDetail = createServerFn({ method: "GET" }).inputValidator((data) => objectType({ journeyId: stringType().uuid() }).parse(data)).middleware([requireSupabaseAuth]).handler(createSsrRpc("5c26e7664f17a27d74644755a6bacc9d1cb8f4a5815b8768c238294cb61cce2b"));
var addJourney = createServerFn({ method: "POST" }).inputValidator((data) => objectType({
	name: stringType().trim().min(2).max(120),
	description: stringType().trim().max(500).nullable().optional(),
	trigger_event: enumType([
		"manual",
		"customer_created",
		"stage_entered"
	])
}).parse(data)).middleware([requireSupabaseAuth]).handler(createSsrRpc("b48db3e3012cc6fa0004a89cf18b43d15bc95b3b38409b8fbffb00aab0a20cef"));
var toggleJourneyActive = createServerFn({ method: "POST" }).inputValidator((data) => objectType({
	journeyId: stringType().uuid(),
	active: booleanType()
}).parse(data)).middleware([requireSupabaseAuth]).handler(createSsrRpc("f9b496ddcf1eb017afaf9d90d929975137632b6a6865978bef512cb212306657"));
var stepInput = objectType({
	journeyId: stringType().uuid(),
	stepId: stringType().uuid().nullable().optional(),
	title: stringType().trim().min(2).max(200),
	content_item_id: stringType().uuid().nullable().optional(),
	email_subject: stringType().trim().min(2).max(300),
	email_body: stringType().trim().min(2).max(8e3),
	advance_on: enumType(["viewed", "delay"]),
	delay_hours: numberType().int().positive().nullable().optional()
});
var saveStep = createServerFn({ method: "POST" }).inputValidator((data) => stepInput.parse(data)).middleware([requireSupabaseAuth]).handler(createSsrRpc("b9ab53fa92483cfd9c53719f4ea83495837c13efe6466ed47605eff8798c40f6"));
var removeStep = createServerFn({ method: "POST" }).inputValidator((data) => objectType({
	journeyId: stringType().uuid(),
	stepId: stringType().uuid()
}).parse(data)).middleware([requireSupabaseAuth]).handler(createSsrRpc("5da415abfe5beb111c8a3b41827cf5f7994179d75f351a06caab85f97bd18263"));
var addContentItem = createServerFn({ method: "POST" }).inputValidator((data) => objectType({
	title: stringType().trim().min(2).max(200),
	kind: enumType([
		"video",
		"doc",
		"link"
	]),
	url: stringType().trim().url(),
	description: stringType().trim().max(500).nullable().optional()
}).parse(data)).middleware([requireSupabaseAuth]).handler(createSsrRpc("c6b7a512b6067bcc4ea1010dab38c42677c69288d07a4bd229ff803c3b4563d7"));
var enrollJourneyContact = createServerFn({ method: "POST" }).inputValidator((data) => objectType({
	journeyId: stringType().uuid(),
	customerId: stringType().uuid(),
	contactId: stringType().uuid().nullable().optional(),
	contactEmail: stringType().trim().email(),
	firstName: stringType().trim().max(80).nullable().optional()
}).parse(data)).middleware([requireSupabaseAuth]).handler(createSsrRpc("9a65757fd9c0dd78d5a6ed2f14db0294e7dcfc94dc193e403efe8a6c9f4be5f1"));
var recordJourneyView = createServerFn({ method: "POST" }).inputValidator((data) => objectType({ token: stringType().min(10) }).parse(data)).handler(createSsrRpc("3d01a0c121bfc82cf98501be0d7d0f6646bc015a07d8f1c88b2aa23b04cde85d"));
//#endregion
//#region node_modules/.nitro/vite/services/ssr/assets/ticket-ui-DJIqlUBP.js
var import_jsx_runtime = require_jsx_runtime();
var TICKET_CATEGORIES = [
	"technical",
	"training",
	"billing",
	"data",
	"integration",
	"other"
];
var TICKET_PRIORITIES = [
	"low",
	"normal",
	"high",
	"urgent"
];
var TICKET_STATUSES = [
	"open",
	"in_progress",
	"waiting_customer",
	"resolved",
	"closed"
];
/**
* First-response SLA countdown. Green while >12h remain, amber under 12h,
* red once overdue. A responded ticket shows the quiet "responded" state.
*/
function SlaChip({ slaDueAt, firstResponseAt, breached }) {
	if (firstResponseAt) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: "inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
		children: "Responded"
	});
	const msLeft = new Date(slaDueAt).getTime() - Date.now();
	const overdue = msLeft <= 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: cn("inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider", overdue ? "bg-status-blocked text-status-blocked-foreground" : msLeft < 432e5 ? "bg-status-risk text-status-risk-foreground" : "bg-status-ontrack text-status-ontrack-foreground"),
		children: [overdue ? `Overdue ${fmtDuration(-msLeft)}` : `${fmtDuration(msLeft)} left`, breached ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			title: "SLA breached",
			children: "·B"
		}) : null]
	});
}
function fmtDuration(ms) {
	const totalMinutes = Math.max(0, Math.floor(ms / 6e4));
	const h = Math.floor(totalMinutes / 60);
	const m = totalMinutes % 60;
	if (h >= 48) return `${Math.floor(h / 24)}d`;
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m`;
}
function BreachBadge() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: "inline-flex items-center rounded-sm bg-status-blocked px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-status-blocked-foreground",
		children: "Breach"
	});
}
var PRIORITY_CLASS = {
	urgent: "bg-status-blocked text-status-blocked-foreground",
	high: "bg-status-risk text-status-risk-foreground",
	normal: "bg-muted text-muted-foreground",
	low: "bg-muted text-muted-foreground/70"
};
function PriorityChip({ value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium", PRIORITY_CLASS[value] ?? "bg-muted text-muted-foreground"),
		children: humanize(value)
	});
}
var TICKET_STATUS_CLASS = {
	open: "bg-status-risk text-status-risk-foreground",
	in_progress: "bg-status-ontrack text-status-ontrack-foreground",
	waiting_customer: "bg-status-idle text-status-idle-foreground",
	resolved: "bg-muted text-muted-foreground",
	closed: "bg-muted text-muted-foreground/70"
};
function TicketStatusChip({ value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium", TICKET_STATUS_CLASS[value] ?? "bg-muted text-muted-foreground"),
		children: humanize(value)
	});
}
var inputClass = "w-full rounded-sm border border-border bg-background px-1.5 py-1 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var selectClass = "h-6 rounded-sm border border-border bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring";
var microLabelClass = "text-[10px] uppercase tracking-[0.1em] text-muted-foreground";
var buttonClass = "inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50";
var primaryButtonClass = "inline-flex items-center gap-1 rounded-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50";
//#endregion
//#region node_modules/.nitro/vite/services/ssr/assets/router-DuzTz6dO.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var styles_default = "/assets/styles-DPzq1-hS.css";
function reportLovableError(error, context = {}) {
	if (typeof window === "undefined") return;
	window.__lovableEvents?.captureException?.(error, {
		source: "react_error_boundary",
		route: window.location.pathname,
		...context
	}, {
		mechanism: "react_error_boundary",
		handled: false,
		severity: "error"
	});
	const message = error instanceof Response ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}` : error instanceof Error ? error.message : String(error);
	const stack = error instanceof Error ? error.stack : void 0;
	window.__lovableReportRuntimeError?.({
		message,
		...stack !== void 0 && { stack },
		filename: window.location.pathname
	});
}
var ROLE_LABELS = {
	admin: "Super admin",
	super_admin: "Super admin",
	manager: "Manager",
	sales: "Sales",
	implementation: "Implementation",
	tam_se: "TAM / SE",
	onboarding: "Implementation",
	am: "Sales",
	se: "TAM / SE",
	customer: "Customer"
};
function isSuperAdmin(role) {
	return role === "admin" || role === "super_admin";
}
function canManage(role) {
	return isSuperAdmin(role) || role === "manager";
}
function canEditSales(role) {
	return canManage(role) || role === "sales" || role === "am";
}
/** Live Supabase session; undefined while loading, null when signed out. */
function useSession() {
	const [session, setSession] = (0, import_react.useState)(void 0);
	const queryClient = useQueryClient();
	(0, import_react.useEffect)(() => {
		supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
		const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
			setSession(s ?? null);
			queryClient.invalidateQueries({ queryKey: ["profile"] });
		});
		return () => sub.subscription.unsubscribe();
	}, [queryClient]);
	return session;
}
function useProfile() {
	const session = useSession();
	const query = useQuery({
		queryKey: ["profile", session?.user?.id ?? "none"],
		enabled: Boolean(session?.user),
		queryFn: async () => {
			const { data } = await supabase.from("portal_profiles").select("id, email, full_name, role").eq("id", session.user.id).maybeSingle();
			return data ?? null;
		}
	});
	return {
		session,
		profile: query.data,
		loading: session === void 0 || Boolean(session) && query.isPending
	};
}
async function signOut() {
	await supabase.auth.signOut();
	window.location.href = "/login";
}
function AppSidebar({ profile }) {
	const role = profile?.role;
	const nav = [
		{
			to: "/",
			label: "Home",
			hint: "What needs attention",
			exact: true
		},
		{
			to: "/pipeline",
			label: "Pipeline",
			hint: "Deals & handoff"
		},
		{
			to: "/customers",
			label: "Customers",
			hint: "All implementations"
		},
		{
			to: "/technical-solutions",
			label: "Solutions",
			hint: "Technical work"
		},
		{
			to: "/tickets",
			label: "Tickets",
			hint: "Requests & SLA"
		},
		{
			to: "/journeys",
			label: "Journeys",
			hint: "Automated onboarding"
		},
		{
			to: "/access",
			label: "Customer access",
			hint: "Portal invites"
		},
		...canManage(role) ? [{
			to: "/portfolio",
			label: "Leadership",
			hint: "Team overview"
		}] : [],
		...canManage(role) ? [{
			to: "/settings",
			label: "Settings",
			hint: "Stages & defaults"
		}] : [],
		...isSuperAdmin(role) ? [{
			to: "/admin",
			label: "Admin",
			hint: "Keys, users, routing"
		}] : []
	];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
		className: "flex w-[228px] shrink-0 flex-col border-r border-border bg-surface",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex h-12 items-center gap-2 border-b border-border px-4",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[13px] font-semibold tracking-tight",
					children: "GoCanvas Handoff Hub"
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
				className: "flex flex-col gap-0.5 p-2",
				children: nav.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
					to: item.to,
					activeOptions: { exact: item.exact ?? false },
					className: "group flex flex-col rounded-sm px-2.5 py-1.5 transition-colors hover:bg-muted data-[status=active]:bg-muted",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[13px] font-medium text-muted-foreground transition-colors group-hover:text-foreground group-data-[status=active]:text-foreground",
						children: item.label
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[11px] text-muted-foreground/70",
						children: item.hint
					})]
				}, item.to))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-auto border-t border-border p-3",
				children: profile ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "truncate text-[12px] font-medium",
							children: profile.full_name || profile.email
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
							children: ROLE_LABELS[profile.role] ?? profile.role
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => void signOut(),
						className: "shrink-0 rounded-sm border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
						children: "Sign out"
					})]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
					children: "Internal · Sales → Implementation"
				})
			})
		]
	});
}
var TooltipProvider = Provider;
var Tooltip = Root3;
var TooltipTrigger = Trigger;
var TooltipContent = import_react.forwardRef(({ className, sideOffset = 4, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Portal, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Content2, {
	ref,
	sideOffset,
	className: cn("z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-tooltip-content-transform-origin)", className),
	...props
}) }));
TooltipContent.displayName = Content2.displayName;
function LifecycleRail({ activeStage, className }) {
	const activeIndex = activeStage ? LIFECYCLE_STAGES.findIndex((s) => s.id === activeStage) : -1;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipProvider, {
		delayDuration: 120,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: cn("flex items-center gap-px overflow-x-auto border-b border-border bg-surface px-4 py-1.5", className),
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "mr-3 shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
					children: "Implementation Lifecycle"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "mr-1.5 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70",
					title: "Closed / Won is the trigger into Handoff, not an implementation stage.",
					children: "Closed / Won →"
				}),
				LIFECYCLE_STAGES.map((stage, i) => {
					const isActive = i === activeIndex;
					const isPast = activeIndex > -1 && i < activeIndex;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
						asChild: true,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							"data-state": isActive ? "active" : isPast ? "past" : "future",
							className: cn("group relative shrink-0 px-2 py-1 font-mono text-[11px] tracking-tight transition-colors", "border-y border-r border-border first-of-type:border-l first-of-type:rounded-l-sm last-of-type:rounded-r-sm", isActive ? "bg-primary text-primary-foreground border-primary z-10" : isPast ? "bg-muted text-muted-foreground hover:text-foreground" : "bg-card text-muted-foreground hover:text-foreground"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mr-1.5 hidden opacity-50 xl:inline",
								children: String(i + 1).padStart(2, "0")
							}), stage.label]
						})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TooltipContent, {
						side: "bottom",
						className: "max-w-64",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-medium",
							children: stage.label
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-muted-foreground",
							children: stage.intent
						})]
					})] }, stage.id);
				})
			]
		})
	});
}
var PUBLIC_PREFIXES = [
	"/login",
	"/signup",
	"/forgot-password",
	"/auth",
	"/view",
	"/tam"
];
function isPublic(pathname) {
	return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
/**
* Client-side route guard. Server functions independently enforce auth via the
* Supabase bearer middleware — this gate only decides what shell to render.
*
* Renders:  public pages as-is · customers only under /portal · internal
* users everywhere else.
*/
function AuthGate({ children, renderShell }) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const { session, profile, loading } = useProfile();
	const publicPage = isPublic(pathname);
	const isCustomer = profile?.role === "customer";
	const onPortal = pathname === "/portal" || pathname.startsWith("/portal/");
	(0, import_react.useEffect)(() => {
		if (publicPage || loading) return;
		if (!session) {
			window.location.replace("/login");
			return;
		}
		if (profile && isCustomer && !onPortal) {
			window.location.replace("/portal");
			return;
		}
		if (profile && !isCustomer && onPortal) window.location.replace("/");
	}, [
		publicPage,
		loading,
		session,
		profile,
		isCustomer,
		onPortal
	]);
	if (publicPage) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children });
	if (loading || !session || isCustomer && !onPortal) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-h-screen items-center justify-center bg-background",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "font-mono text-[11px] uppercase tracking-wider text-muted-foreground",
			children: "Loading…"
		})
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: renderShell({ chrome: !onPortal }) });
}
function NotFoundComponent() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-h-screen items-center justify-center bg-background px-4",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "max-w-md text-center",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-7xl font-bold text-foreground",
					children: "404"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "mt-4 text-xl font-semibold text-foreground",
					children: "Page not found"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted-foreground",
					children: "The page you're looking for doesn't exist or has been moved."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-6",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/",
						className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
						children: "Go home"
					})
				})
			]
		})
	});
}
function ErrorComponent({ error, reset }) {
	console.error(error);
	const router = useRouter();
	(0, import_react.useEffect)(() => {
		reportLovableError(error, { boundary: "tanstack_root_error_component" });
	}, [error]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-h-screen items-center justify-center bg-background px-4",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "max-w-md text-center",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "text-xl font-semibold tracking-tight text-foreground",
					children: "This page didn't load"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted-foreground",
					children: "Something went wrong on our end. You can try refreshing or head back home."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-6 flex flex-wrap justify-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						onClick: () => {
							router.invalidate();
							reset();
						},
						className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
						children: "Try again"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
						href: "/",
						className: "inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent",
						children: "Go home"
					})]
				})
			]
		})
	});
}
var Route$42 = createRootRouteWithContext()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1"
			},
			{ title: "GoCanvas Handoff Hub" },
			{
				name: "description",
				content: "Internal Implementation Operating System for the Customer Onboarding & Implementation team."
			},
			{
				property: "og:title",
				content: "GoCanvas Handoff Hub"
			},
			{
				property: "og:description",
				content: "Internal operating system for customer implementations."
			},
			{
				property: "og:type",
				content: "website"
			},
			{
				name: "twitter:card",
				content: "summary_large_image"
			},
			{
				name: "robots",
				content: "noindex, nofollow"
			}
		],
		links: [
			{
				rel: "stylesheet",
				href: styles_default
			},
			{
				rel: "preconnect",
				href: "https://fonts.googleapis.com"
			},
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous"
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
			},
			{
				rel: "icon",
				href: "/favicon.png",
				type: "image/png"
			},
			{
				rel: "apple-touch-icon",
				href: "/favicon.png"
			}
		]
	}),
	shellComponent: RootShell,
	component: RootComponent,
	notFoundComponent: NotFoundComponent,
	errorComponent: ErrorComponent
});
function RootShell({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("html", {
		lang: "en",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("head", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadContent, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("body", { children: [children, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scripts, {})] })]
	});
}
function RootComponent() {
	const { queryClient } = Route$42.useRouteContext();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const showGlobalRail = !/^\/customers\/[^/]+/.test(pathname);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(QueryClientProvider, {
		client: queryClient,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AuthGate, {
			renderShell: ({ chrome }) => chrome ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShellWithSidebar, { showGlobalRail }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
				className: "min-h-screen bg-background text-foreground",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {})
			}),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {})
		})
	});
}
function ShellWithSidebar({ showGlobalRail }) {
	const { profile } = useProfile();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex min-h-screen w-full bg-background text-foreground",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppSidebar, { profile: profile ?? null }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex min-w-0 flex-1 flex-col",
			children: [showGlobalRail ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LifecycleRail, {}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
				className: "min-w-0 flex-1",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {})
			})]
		})]
	});
}
var homeQuery = queryOptions({
	queryKey: ["home"],
	queryFn: () => getHome()
});
var $$splitComponentImporter$32 = () => import("./routes-DiL3YMMx.mjs");
var $$splitNotFoundComponentImporter$5 = () => import("./routes-dVSos12T.mjs");
var $$splitErrorComponentImporter$15 = () => import("./routes-D1QDXJTp.mjs");
var Route$41 = createFileRoute("/")({
	head: () => ({ meta: [
		{ title: "Today — What needs my attention | Implementation Hub" },
		{
			name: "description",
			content: "Every implementation sorted by what needs doing: act now, needs attention, or moving — with the reason, the impact, the owner and the next action."
		},
		{
			property: "og:title",
			content: "Today — What needs my attention | Implementation Hub"
		},
		{
			property: "og:description",
			content: "The daily working list for the onboarding and implementation team."
		},
		{
			property: "og:type",
			content: "website"
		},
		{
			name: "twitter:card",
			content: "summary"
		}
	] }),
	loader: ({ context }) => {
		context.queryClient.ensureQueryData(homeQuery);
	},
	errorComponent: lazyRouteComponent($$splitErrorComponentImporter$15, "errorComponent"),
	notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter$5, "notFoundComponent"),
	component: lazyRouteComponent($$splitComponentImporter$32, "component")
});
var getAccessOverview = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(createSsrRpc("5f549ee541544819553c17e8f71e14a349e74384a83e8ed25a3081dc696a8e04"));
var inviteContact = createServerFn({ method: "POST" }).inputValidator((data) => objectType({
	customerId: stringType().uuid(),
	email: stringType().trim().email(),
	contactId: stringType().uuid().nullable().optional()
}).parse(data)).middleware([requireSupabaseAuth]).handler(createSsrRpc("93dc4808ed4403d44292164f9911900ce34f1ce88d3515273171700c23c60623"));
var revokeCustomerInvite = createServerFn({ method: "POST" }).inputValidator((data) => objectType({ inviteId: stringType().uuid() }).parse(data)).middleware([requireSupabaseAuth]).handler(createSsrRpc("c9b005c384ad3eb4a9f58f9d036e66bfbe44bd1f15fc91b5ea0b2d886a4a0097"));
var removeCustomerAccess = createServerFn({ method: "POST" }).inputValidator((data) => objectType({ linkId: stringType().uuid() }).parse(data)).middleware([requireSupabaseAuth]).handler(createSsrRpc("b53cb872ba3b4b5af5056d1d9ab89bc17f4bcb833512f08ad0b87a9a59bf6e4a"));
var accessQuery = queryOptions({
	queryKey: ["access"],
	queryFn: () => getAccessOverview()
});
var $$splitComponentImporter$31 = () => import("./access-DpZPv5Lw.mjs");
var $$splitErrorComponentImporter$14 = () => import("./access-mLRWk4-G.mjs");
var Route$40 = createFileRoute("/access")({
	head: () => ({ meta: [{ title: "Customer access — Implementation Hub" }, {
		name: "description",
		content: "Which customer contacts can sign in to the customer portal, and pending invites."
	}] }),
	loader: ({ context }) => {
		context.queryClient.ensureQueryData(accessQuery);
	},
	errorComponent: lazyRouteComponent($$splitErrorComponentImporter$14, "errorComponent"),
	component: lazyRouteComponent($$splitComponentImporter$31, "component")
});
var $$splitComponentImporter$30 = () => import("./admin-D7Vx0eya.mjs");
var Route$39 = createFileRoute("/admin")({
	head: () => ({ meta: [{ title: "Admin — GoCanvas Handoff Hub" }, {
		name: "description",
		content: "API keys, users and routing configuration."
	}] }),
	component: lazyRouteComponent($$splitComponentImporter$30, "component")
});
/**
* Client-side gate only decides what to render — every admin serverFn
* independently re-checks the caller's role server-side.
*/
var $$splitComponentImporter$29 = () => import("./alerts-r0BKlINM.mjs");
var Route$38 = createFileRoute("/alerts")({
	head: () => ({ meta: [{ title: "Alerts — Implementation Hub" }, {
		name: "description",
		content: "SLA breaches, stalled implementations, overdue milestones and external alerts."
	}] }),
	component: lazyRouteComponent($$splitComponentImporter$29, "component")
});
var $$splitComponentImporter$28 = () => import("./customers-D9s-8NG-.mjs");
var Route$37 = createFileRoute("/customers")({ component: lazyRouteComponent($$splitComponentImporter$28, "component") });
var $$splitComponentImporter$27 = () => import("./forgot-password-QexA4Sv8.mjs");
var Route$36 = createFileRoute("/forgot-password")({ component: lazyRouteComponent($$splitComponentImporter$27, "component") });
var $$splitComponentImporter$26 = () => import("./journeys-DEhSwm58.mjs");
var Route$35 = createFileRoute("/journeys")({ component: lazyRouteComponent($$splitComponentImporter$26, "component") });
var $$splitComponentImporter$25 = () => import("./login-CqUvhvhj.mjs");
var Route$34 = createFileRoute("/login")({ component: lazyRouteComponent($$splitComponentImporter$25, "component") });
var pipelineQuery = queryOptions({
	queryKey: ["pipeline"],
	queryFn: () => getPipeline()
});
var $$splitComponentImporter$24 = () => import("./pipeline-B0Vqw1Xl.mjs");
var $$splitErrorComponentImporter$13 = () => import("./pipeline-cn8sHdMU.mjs");
var Route$33 = createFileRoute("/pipeline")({
	head: () => ({ meta: [{ title: "Pipeline — GoCanvas Handoff Hub" }, {
		name: "description",
		content: "Presale deals across the five stages from Prospect to Onboarding Complete. Drag a deal to record a stage transition."
	}] }),
	loader: ({ context }) => {
		context.queryClient.ensureQueryData(pipelineQuery).catch(() => {});
	},
	errorComponent: lazyRouteComponent($$splitErrorComponentImporter$13, "errorComponent"),
	component: lazyRouteComponent($$splitComponentImporter$24, "component")
});
var $$splitComponentImporter$23 = () => import("./portal-2ileusUM.mjs");
var Route$32 = createFileRoute("/portal")({
	head: () => ({ meta: [{ title: "Your onboarding — GoCanvas" }, {
		name: "description",
		content: "Track your GoCanvas onboarding progress."
	}] }),
	component: lazyRouteComponent($$splitComponentImporter$23, "component")
});
/**
* Customer portal shell: minimal top bar, no internal sidebar. Warmer and
* simpler than the hub, same token system.
*/
var leadershipQuery$1 = queryOptions({
	queryKey: ["leadership"],
	queryFn: () => getLeadership()
});
var $$splitComponentImporter$22 = () => import("./portfolio-DfJTjTRw.mjs");
var $$splitErrorComponentImporter$12 = () => import("./portfolio-DsLvWvS6.mjs");
var Route$31 = createFileRoute("/portfolio")({
	head: () => ({ meta: [
		{ title: "Leadership — Where the team needs me | Implementation Hub" },
		{
			name: "description",
			content: "Portfolio management view: accounts needing intervention, owner workload, work getting stuck in a stage, launch risk, value-proof and adoption coverage, stuck work and readiness to hand over."
		},
		{
			property: "og:title",
			content: "Leadership — Where the team needs me | Implementation Hub"
		},
		{
			property: "og:description",
			content: "Management intervention view across the implementation portfolio — owner workload, work getting stuck in a stage, launch risk and readiness to hand over."
		},
		{
			property: "og:type",
			content: "website"
		},
		{
			name: "twitter:card",
			content: "summary"
		}
	] }),
	loader: ({ context }) => {
		context.queryClient.ensureQueryData(leadershipQuery$1);
	},
	errorComponent: lazyRouteComponent($$splitErrorComponentImporter$12, "errorComponent"),
	component: lazyRouteComponent($$splitComponentImporter$22, "component")
});
var $$splitComponentImporter$21 = () => import("./settings-Ctsnz7W7.mjs");
var Route$30 = createFileRoute("/settings")({
	head: () => ({ meta: [
		{ title: "Settings — Implementation Hub" },
		{
			name: "description",
			content: "The stages an implementation moves through, what has to be true to leave each one, and team defaults."
		},
		{
			property: "og:title",
			content: "Settings — Implementation Hub"
		},
		{
			property: "og:description",
			content: "Stages, what has to be true to leave each one, and team settings."
		}
	] }),
	component: lazyRouteComponent($$splitComponentImporter$21, "component")
});
var $$splitComponentImporter$20 = () => import("./signup-jFA8fuSD.mjs");
var Route$29 = createFileRoute("/signup")({ component: lazyRouteComponent($$splitComponentImporter$20, "component") });
var $$splitComponentImporter$19 = () => import("./technical-solutions-CkQJrwt4.mjs");
var Route$28 = createFileRoute("/technical-solutions")({ component: lazyRouteComponent($$splitComponentImporter$19, "component") });
var $$splitComponentImporter$18 = () => import("./tickets-D8qmmoDD.mjs");
var Route$27 = createFileRoute("/tickets")({ component: lazyRouteComponent($$splitComponentImporter$18, "component") });
var $$splitComponentImporter$17 = () => import("./admin.index-BRuRZT9S.mjs");
var Route$26 = createFileRoute("/admin/")({ component: lazyRouteComponent($$splitComponentImporter$17, "component") });
var keysQuery = queryOptions({
	queryKey: ["admin", "api-keys"],
	queryFn: () => getApiKeys()
});
var $$splitComponentImporter$16 = () => import("./admin.api-keys-CrZIjJZL.mjs");
var $$splitErrorComponentImporter$11 = () => import("./admin.api-keys-BqLTsGuy.mjs");
var Route$25 = createFileRoute("/admin/api-keys")({
	head: () => ({ meta: [{ title: "API keys — Admin | GoCanvas Handoff Hub" }] }),
	loader: ({ context }) => {
		context.queryClient.ensureQueryData(keysQuery).catch(() => {});
	},
	errorComponent: lazyRouteComponent($$splitErrorComponentImporter$11, "errorComponent"),
	component: lazyRouteComponent($$splitComponentImporter$16, "component")
});
/** Roles that can be assigned. Legacy roles (admin/am/se/onboarding) are shown
*  on existing rows but no longer offered. */
var usersQuery = queryOptions({
	queryKey: ["admin", "users"],
	queryFn: () => getUsers()
});
var $$splitComponentImporter$15 = () => import("./admin.users-BoY7s0Fs.mjs");
var $$splitErrorComponentImporter$10 = () => import("./admin.users-CXGPlQme.mjs");
var Route$24 = createFileRoute("/admin/users")({
	head: () => ({ meta: [{ title: "Users — Admin | GoCanvas Handoff Hub" }] }),
	loader: ({ context }) => {
		context.queryClient.ensureQueryData(usersQuery).catch(() => {});
	},
	errorComponent: lazyRouteComponent($$splitErrorComponentImporter$10, "errorComponent"),
	component: lazyRouteComponent($$splitComponentImporter$15, "component")
});
var $$splitComponentImporter$14 = () => import("./auth.callback-C0-Ea2Y7.mjs");
var Route$23 = createFileRoute("/auth/callback")({ component: lazyRouteComponent($$splitComponentImporter$14, "component") });
var implementationsQuery = queryOptions({
	queryKey: ["home"],
	queryFn: () => getHome()
});
var $$splitComponentImporter$13 = () => import("./customers.index-Q762rqWT.mjs");
var $$splitNotFoundComponentImporter$4 = () => import("./customers.index-3ccSNrCe.mjs");
var $$splitErrorComponentImporter$9 = () => import("./customers.index-BkxreHyD.mjs");
var SORTS$1 = [
	"customer",
	"stage",
	"status",
	"owner",
	"tier",
	"launch",
	"days"
];
var Route$22 = createFileRoute("/customers/")({
	head: () => ({ meta: [
		{ title: "Customers — Implementation Hub" },
		{
			name: "description",
			content: "Every customer implementation with its stage, health, owner, tier, target launch date and time in the current stage."
		},
		{
			property: "og:title",
			content: "Customers — Implementation Hub"
		},
		{
			property: "og:description",
			content: "The full list of customer implementations."
		}
	] }),
	validateSearch: (search) => {
		const raw = search;
		const out = {
			sort: SORTS$1.includes(String(raw.sort)) ? raw.sort : "days",
			dir: raw.dir === "asc" ? "asc" : "desc"
		};
		if (typeof raw.stage === "string") out.stage = raw.stage;
		if (typeof raw.status === "string") out.status = raw.status;
		return out;
	},
	loader: ({ context }) => {
		context.queryClient.ensureQueryData(implementationsQuery);
	},
	errorComponent: lazyRouteComponent($$splitErrorComponentImporter$9, "errorComponent"),
	notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter$4, "notFoundComponent"),
	component: lazyRouteComponent($$splitComponentImporter$13, "component")
});
/** Derived health levels, matching deriveHealth output. */
var TABS = [
	"overview",
	"journey",
	"solution",
	"requirements",
	"decisions",
	"risks",
	"evidence",
	"history"
];
var customerQuery = (customerId, implementationId) => queryOptions({
	queryKey: [
		"customer360",
		customerId,
		implementationId ?? null
	],
	queryFn: () => getCustomer360({ data: {
		customerId,
		implementationId: implementationId ?? null
	} })
});
var $$splitComponentImporter$12 = () => import("./customers._customerId-UC9RCzsm.mjs");
var $$splitNotFoundComponentImporter$3 = () => import("./customers._customerId-cqhAwM9w.mjs");
var $$splitErrorComponentImporter$8 = () => import("./customers._customerId-B9b8qcDo.mjs");
var Route$21 = createFileRoute("/customers/$customerId")({
	validateSearch: (search) => {
		const raw = String(search["tab"] ?? "overview");
		const impl = typeof search["impl"] === "string" ? search["impl"] : void 0;
		return {
			tab: TABS.includes(raw) ? raw : "overview",
			...impl ? { impl } : {}
		};
	},
	head: () => ({ meta: [
		{ title: "Customer implementation — Implementation Hub" },
		{
			name: "description",
			content: "Structured implementation record: current state, journey, solution, requirements, decisions, risks and full change history."
		},
		{
			property: "og:title",
			content: "Customer implementation — Implementation Hub"
		},
		{
			property: "og:description",
			content: "Current state and historical context for one customer implementation."
		},
		{
			property: "og:type",
			content: "website"
		},
		{
			name: "twitter:card",
			content: "summary"
		}
	] }),
	loaderDeps: ({ search }) => ({ impl: search.impl ?? null }),
	loader: async ({ context, params, deps }) => {
		if (!await context.queryClient.ensureQueryData(customerQuery(params.customerId, deps.impl))) throw notFound();
	},
	errorComponent: lazyRouteComponent($$splitErrorComponentImporter$8, "errorComponent"),
	notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter$3, "notFoundComponent"),
	component: lazyRouteComponent($$splitComponentImporter$12, "component")
});
/**
* Every implementation this customer has. Selecting one reloads this page for
* that record — each keeps its own stage, owner, dates and notes.
*/
/** Prove Value presentation for one success criterion, with observation + confirmation writes. */
/** Adoption presentation for one intended user group / workflow. */
var dealQuery = (dealId) => queryOptions({
	queryKey: ["deal", dealId],
	queryFn: () => getDeal({ data: { dealId } })
});
var $$splitComponentImporter$11 = () => import("./deals._dealId-BS30lVyc.mjs");
var $$splitErrorComponentImporter$7 = () => import("./deals._dealId-SLilMO5l.mjs");
var Route$20 = createFileRoute("/deals/$dealId")({
	head: () => ({ meta: [{ title: "Deal — GoCanvas Handoff Hub" }, {
		name: "description",
		content: "Presale deal record: notes, Gong reports, account briefs, TAM requests and stage history."
	}] }),
	loader: ({ context, params }) => {
		const { dealId } = params;
		context.queryClient.ensureQueryData(dealQuery(dealId)).catch(() => {});
	},
	errorComponent: lazyRouteComponent($$splitErrorComponentImporter$7, "errorComponent"),
	component: lazyRouteComponent($$splitComponentImporter$11, "component")
});
var journeysQuery = queryOptions({
	queryKey: ["journeys"],
	queryFn: () => getJourneys()
});
var $$splitComponentImporter$10 = () => import("./journeys.index-5PcvgSlK.mjs");
var $$splitErrorComponentImporter$6 = () => import("./journeys.index-l3a1t4sO.mjs");
var Route$19 = createFileRoute("/journeys/")({
	head: () => ({ meta: [{ title: "Journeys — Implementation Hub" }, {
		name: "description",
		content: "Automated customer email journeys: welcome sequences, training tracks and engagement."
	}] }),
	loader: ({ context }) => {
		context.queryClient.ensureQueryData(journeysQuery);
	},
	errorComponent: lazyRouteComponent($$splitErrorComponentImporter$6, "errorComponent"),
	component: lazyRouteComponent($$splitComponentImporter$10, "component")
});
var detailQuery = (journeyId) => queryOptions({
	queryKey: ["journeys", journeyId],
	queryFn: () => getJourneyDetail({ data: { journeyId } })
});
var $$splitComponentImporter$9 = () => import("./journeys._journeyId-tdsszJmS.mjs");
var $$splitErrorComponentImporter$5 = () => import("./journeys._journeyId-BvXhUAx-.mjs");
var Route$18 = createFileRoute("/journeys/$journeyId")({
	head: () => ({ meta: [{ title: "Journey — Implementation Hub" }] }),
	loader: ({ context, params }) => {
		context.queryClient.ensureQueryData(detailQuery(params.journeyId));
	},
	errorComponent: lazyRouteComponent($$splitErrorComponentImporter$5, "errorComponent"),
	component: lazyRouteComponent($$splitComponentImporter$9, "component")
});
var leadershipQuery = queryOptions({
	queryKey: ["leadership"],
	queryFn: () => getLeadership()
});
var $$splitComponentImporter$8 = () => import("./owners._owner-FW9W7cTF.mjs");
var $$splitNotFoundComponentImporter$2 = () => import("./owners._owner-_ojZDgYS.mjs");
var $$splitErrorComponentImporter$4 = () => import("./owners._owner-Do_otVop.mjs");
var Route$17 = createFileRoute("/owners/$owner")({
	head: ({ params }) => {
		const owner = decodeURIComponent(params.owner);
		const title = `${owner} — Owner portfolio | Implementation Hub`;
		const description = `What ${owner} is carrying: active implementations, ARR represented, accounts needing intervention, blocked and at-risk work.`;
		return { meta: [
			{ title },
			{
				name: "description",
				content: description
			},
			{
				property: "og:title",
				content: title
			},
			{
				property: "og:description",
				content: description
			},
			{
				property: "og:type",
				content: "profile"
			},
			{
				name: "twitter:card",
				content: "summary"
			}
		] };
	},
	loader: ({ context }) => {
		context.queryClient.ensureQueryData(leadershipQuery);
	},
	errorComponent: lazyRouteComponent($$splitErrorComponentImporter$4, "errorComponent"),
	notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter$2, "notFoundComponent"),
	component: lazyRouteComponent($$splitComponentImporter$8, "component")
});
var getPortalHome = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(createSsrRpc("0253184b9f13ff5ce6b502a3c98b39a5a7b1bef16a18aad8823a8a37d649a9b9"));
var getPortalTickets = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(createSsrRpc("36253ad40f40add008af5c78f92e7c4c71b4c63cd02ad976e718e72dec6eae61"));
var submitTicketInput = objectType({
	customerId: stringType().uuid(),
	category: enumType([
		"technical",
		"training",
		"billing",
		"data",
		"integration",
		"other"
	]),
	subject: stringType().trim().min(3).max(200),
	body: stringType().trim().min(5).max(8e3),
	priority: enumType([
		"low",
		"normal",
		"high",
		"urgent"
	]).optional()
});
var submitTicket = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => submitTicketInput.parse(data)).handler(createSsrRpc("f0a5f75c3eb380f3951453454690dd010f714f66f6b35a770f943ef423dae899"));
var replyTicketInput = objectType({
	ticketId: stringType().uuid(),
	body: stringType().trim().min(1).max(8e3)
});
var replyTicket = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => replyTicketInput.parse(data)).handler(createSsrRpc("0b0abf92a4b03ccac8f3b7b253ce9aa4d71a19e66cd0b4883dcd9bf97576066c"));
var portalHomeQuery = queryOptions({
	queryKey: ["portal", "home"],
	queryFn: () => getPortalHome()
});
var portalTicketsQuery = queryOptions({
	queryKey: ["portal", "tickets"],
	queryFn: () => getPortalTickets()
});
var $$splitComponentImporter$7 = () => import("./portal.index-BjgiaVJV.mjs");
var $$splitErrorComponentImporter$3 = () => import("./portal.index-ChHavYqU.mjs");
var Route$16 = createFileRoute("/portal/")({
	loader: ({ context }) => {
		context.queryClient.ensureQueryData(portalHomeQuery);
	},
	errorComponent: lazyRouteComponent($$splitErrorComponentImporter$3, "errorComponent"),
	component: lazyRouteComponent($$splitComponentImporter$7, "component")
});
var $$splitComponentImporter$6 = () => import("./portal.tickets-XadfRBLe.mjs");
var $$splitErrorComponentImporter$2 = () => import("./portal.tickets-PdMsoBrP.mjs");
var Route$15 = createFileRoute("/portal/tickets")({
	loader: ({ context }) => {
		context.queryClient.ensureQueryData(portalTicketsQuery);
	},
	errorComponent: lazyRouteComponent($$splitErrorComponentImporter$2, "errorComponent"),
	component: lazyRouteComponent($$splitComponentImporter$6, "component")
});
var solutionsQuery = queryOptions({
	queryKey: ["technical-solutions"],
	queryFn: () => getTechnicalSolutions()
});
var $$splitComponentImporter$5 = () => import("./technical-solutions.index-BYujMz7E.mjs");
var $$splitNotFoundComponentImporter$1 = () => import("./technical-solutions.index-Dg3FEjA8.mjs");
var $$splitErrorComponentImporter$1 = () => import("./technical-solutions.index-CEBheHFi.mjs");
var SORTS = [
	"customer",
	"solution",
	"requirement",
	"owner",
	"status"
];
var Route$14 = createFileRoute("/technical-solutions/")({
	head: () => ({ meta: [
		{ title: "Technical Solutions — Implementation Hub" },
		{
			name: "description",
			content: "Every technical solution across customer implementations, with owner, status, the requirement it implements and what is needed next."
		},
		{
			property: "og:title",
			content: "Technical Solutions — Implementation Hub"
		},
		{
			property: "og:description",
			content: "Cross-customer technical solutions queue."
		},
		{
			property: "og:type",
			content: "website"
		},
		{
			name: "twitter:card",
			content: "summary"
		}
	] }),
	validateSearch: (search) => {
		const raw = search;
		const out = {
			sort: SORTS.includes(String(raw.sort)) ? raw.sort : "customer",
			dir: raw.dir === "desc" ? "desc" : "asc"
		};
		if (typeof raw.owner === "string") out.owner = raw.owner;
		if (typeof raw.status === "string") out.status = raw.status;
		return out;
	},
	loader: ({ context }) => {
		context.queryClient.ensureQueryData(solutionsQuery);
	},
	errorComponent: lazyRouteComponent($$splitErrorComponentImporter$1, "errorComponent"),
	notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter$1, "notFoundComponent"),
	component: lazyRouteComponent($$splitComponentImporter$5, "component")
});
var solutionQuery = (id) => queryOptions({
	queryKey: ["technical-solution", id],
	queryFn: () => getTechnicalSolution({ data: { id } })
});
var $$splitComponentImporter$4 = () => import("./technical-solutions._id-CcrzZP8m.mjs");
var $$splitNotFoundComponentImporter = () => import("./technical-solutions._id--T0CpUoz.mjs");
var $$splitErrorComponentImporter = () => import("./technical-solutions._id-BX2QtMsX.mjs");
var Route$13 = createFileRoute("/technical-solutions/$id")({
	head: () => ({ meta: [
		{ title: "Technical Solution — Implementation Hub" },
		{
			name: "description",
			content: "Technical solution record: design, configuration, field mapping, journal, ownership history and traceability."
		},
		{
			property: "og:title",
			content: "Technical Solution — Implementation Hub"
		},
		{
			property: "og:description",
			content: "Current state and history for one technical solution record."
		},
		{
			property: "og:type",
			content: "website"
		},
		{
			name: "twitter:card",
			content: "summary"
		}
	] }),
	loader: async ({ context, params }) => {
		if (!await context.queryClient.ensureQueryData(solutionQuery(params.id))) throw notFound();
	},
	errorComponent: lazyRouteComponent($$splitErrorComponentImporter, "errorComponent"),
	notFoundComponent: lazyRouteComponent($$splitNotFoundComponentImporter, "notFoundComponent"),
	component: lazyRouteComponent($$splitComponentImporter$4, "component")
});
var $$splitComponentImporter$3 = () => import("./tickets.index-Cpv5bvlm.mjs");
var Route$12 = createFileRoute("/tickets/")({
	head: () => ({ meta: [{ title: "Tickets — Implementation Hub" }, {
		name: "description",
		content: "Support queue with first-response SLA countdowns, routing and breach flags."
	}] }),
	validateSearch: (search) => {
		const out = {};
		const category = search["category"];
		if (typeof category === "string" && TICKET_CATEGORIES.includes(category)) out.category = category;
		if (search["assignee"] === "mine") out.assignee = "mine";
		return out;
	},
	component: lazyRouteComponent($$splitComponentImporter$3, "component")
});
var $$splitComponentImporter$2 = () => import("./tickets._ticketId-BzF2BKoe.mjs");
var Route$11 = createFileRoute("/tickets/$ticketId")({
	head: () => ({ meta: [{ title: "Ticket — Implementation Hub" }] }),
	component: lazyRouteComponent($$splitComponentImporter$2, "component")
});
var $$splitComponentImporter$1 = () => import("./tickets.routing-CMOneNHW.mjs");
var Route$10 = createFileRoute("/tickets/routing")({
	head: () => ({ meta: [{ title: "Ticket routing — Implementation Hub" }] }),
	component: lazyRouteComponent($$splitComponentImporter$1, "component")
});
/** Roles a category can route to. Aliases resolve to the same pool server-side. */
var $$splitComponentImporter = () => import("./view._token-BH90x8wK.mjs");
var Route$9 = createFileRoute("/view/$token")({
	head: () => ({ meta: [{ title: "Opening your content — GoCanvas" }, {
		name: "robots",
		content: "noindex, nofollow"
	}] }),
	component: lazyRouteComponent($$splitComponentImporter, "component")
});
/**
* PUBLIC tracked-link landing (AuthGate exempts /view). Records the view —
* which may advance the journey — then forwards the visitor to the real
* content URL. recordJourneyView never throws: on any failure it returns the
* app root so the visitor always lands somewhere.
*/
/**
* Cron endpoint: advances delay-based journey steps and auto-enrolls contacts
* for 'customer_created' journeys. Auth: Authorization: Bearer ${CRON_SECRET}.
*
* Server-route convention (TanStack Start v1.168): raw HTTP handlers live on
* the route's `server.handlers` option and receive ({ request }) → Response.
*/
async function handleCron(request) {
	const secret = process.env["CRON_SECRET"];
	if (!secret) return new Response("Server configuration error", { status: 500 });
	const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
	if (!token) return new Response("Unauthorized", { status: 401 });
	const { createHash, timingSafeEqual } = await import("node:crypto");
	const digest = (v) => createHash("sha256").update(v, "utf8").digest();
	if (!timingSafeEqual(digest(token), digest(secret))) return new Response("Unauthorized", { status: 401 });
	const { advanceDelayedSteps, autoEnrollNewCustomers } = await import("./journeys.server-2Kfn9DiL.mjs");
	const delayed = await advanceDelayedSteps();
	const enrolled = await autoEnrollNewCustomers();
	return Response.json({
		ok: true,
		advanced: delayed.advanced,
		completed: delayed.completed,
		auto_enrolled: enrolled.enrolled
	});
}
var Route$8 = createFileRoute("/api/cron/journeys")({ server: { handlers: {
	GET: ({ request }) => handleCron(request),
	POST: ({ request }) => handleCron(request)
} } });
/**
* GET/POST /api/cron/sla — hourly sweep (see vercel.json):
*   1. Warn:   open/in_progress tickets past 50% of the first-response window,
*              not yet warned → email the assignee (or role pool), stamp sla_warned_at.
*   2. Breach: tickets past sla_due_at with no first response → set sla_breached,
*              insert a critical sla_breach alert, email managers + super admins.
*   3. Stall:  implementations sitting in a non-terminal stage for >14 days with no
*              open stalled_implementation alert → warning alert + manager email.
*   4. Slip:   milestones past target_date and not complete, deduped per milestone →
*              overdue_milestone alert.
* Every pass is guarded (sla_warned_at / sla_breached / existing unacknowledged
* alert) so re-runs never double-email.
*
* Auth: `Authorization: Bearer ${CRON_SECRET}` (or the Lovable cron secret).
*/
async function authorizeCron(request) {
	const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
	const secret = process.env["CRON_SECRET"];
	if (secret && token) {
		const { createHash, timingSafeEqual } = await import("node:crypto");
		const digest = (v) => createHash("sha256").update(v, "utf8").digest();
		if (timingSafeEqual(digest(token), digest(secret))) return null;
	}
	if (process.env["LOVABLE_CRON_SECRET"]) {
		const { authenticateCronRequest } = await import("./cron-auth-Y83P2Slf.mjs");
		return authenticateCronRequest(request);
	}
	return new Response("Unauthorized", { status: 401 });
}
async function runSlaSweep() {
	const { supabaseAdmin } = await import("./client.server-KzwUIAkW.mjs");
	const { sendEmail } = await import("./email-D82hv4FK.mjs").then((n) => n.t).then((n) => n.t);
	const { audit } = await import("./audit-D9QQPMll.mjs").then((n) => n.n).then((n) => n.n);
	const { createAlert, managerProfiles, rolePool, escapeHtml } = await import("./tickets.server-uG27zEr0.mjs");
	const { normalizeStage } = await import("./hub-format--ProSxvQ.mjs").then((n) => n.a).then((n) => n.a);
	const db = supabaseAdmin;
	const now = Date.now();
	const nowIso = new Date(now).toISOString();
	const appUrl = process.env["APP_URL"] ?? "http://localhost:3000";
	const summary = {
		warned: 0,
		breached: 0,
		stalled: 0,
		overdue_milestones: 0
	};
	const safeSend = async (to, subject, html) => {
		try {
			await sendEmail({
				to,
				subject,
				html
			});
		} catch (e) {
			console.error(`cron email to ${to} failed`, e);
		}
	};
	const { data: warnCandidates } = await db.from("tickets").select("*").in("status", ["open", "in_progress"]).is("sla_warned_at", null).is("first_response_at", null).eq("sla_breached", false);
	for (const t of warnCandidates ?? []) {
		const start = new Date(t.created_at).getTime();
		const due = new Date(t.sla_due_at).getTime();
		if (now < start + (due - start) / 2 || now >= due) continue;
		const { data: stamped } = await db.from("tickets").update({ sla_warned_at: nowIso }).eq("id", t.id).is("sla_warned_at", null).select("id");
		if (!stamped || stamped.length === 0) continue;
		let recipients = [];
		if (t.assigned_to) {
			const { data: p } = await db.from("portal_profiles").select("email").eq("id", t.assigned_to).maybeSingle();
			if (p) recipients = [p];
		}
		if (recipients.length === 0 && t.assigned_role) {
			const { data: pool } = await db.from("portal_profiles").select("email").in("role", rolePool(t.assigned_role));
			recipients = pool ?? [];
		}
		if (recipients.length === 0) recipients = await managerProfiles();
		const hoursLeft = Math.max(0, Math.round((due - now) / 36e5));
		for (const r of recipients) await safeSend(r.email, `SLA warning: ${t.subject}`, `<div style="font-family:sans-serif;max-width:540px">
          <h2 style="color:#B45309;font-size:17px">First response due in ~${hoursLeft}h</h2>
          <p style="font-size:14px"><b>${escapeHtml(t.subject)}</b> has had no first response and is past half its SLA window.</p>
          <p style="font-size:14px"><a href="${appUrl}/tickets/${t.id}">Open the ticket</a></p>
        </div>`);
		summary.warned += 1;
	}
	const { data: breachCandidates } = await db.from("tickets").select("*").lt("sla_due_at", nowIso).is("first_response_at", null).eq("sla_breached", false).in("status", [
		"open",
		"in_progress",
		"waiting_customer"
	]);
	for (const t of breachCandidates ?? []) {
		const { data: flagged } = await db.from("tickets").update({ sla_breached: true }).eq("id", t.id).eq("sla_breached", false).select("id");
		if (!flagged || flagged.length === 0) continue;
		await createAlert({
			kind: "sla_breach",
			severity: "critical",
			title: `SLA breach: ${t.subject}`,
			detail: `Ticket from ${t.submitter_email ?? "unknown"} got no first response within 24 hours. ${appUrl}/tickets/${t.id}`,
			customerId: t.customer_id,
			implementationId: t.implementation_id,
			payload: { ticket_id: t.id },
			notify: true,
			actor: { type: "system" }
		});
		summary.breached += 1;
	}
	const { data: openAlerts } = await db.from("alerts").select("kind, implementation_id, payload").in("kind", ["stalled_implementation", "overdue_milestone"]).is("acknowledged_at", null);
	const stalledFlagged = new Set((openAlerts ?? []).filter((a) => a.kind === "stalled_implementation").map((a) => a.implementation_id));
	const milestoneFlagged = new Set((openAlerts ?? []).filter((a) => a.kind === "overdue_milestone").map((a) => a.payload?.milestone_id).filter(Boolean));
	const cutoff = (/* @__PURE__ */ new Date(now - 12096e5)).toISOString();
	const { data: impls } = await db.from("implementations").select("id, name, customer_id, current_stage, stage_entered_at, status").lt("stage_entered_at", cutoff);
	const stalled = (impls ?? []).filter((i) => normalizeStage(i.current_stage) !== "graduate-to-cs" && !stalledFlagged.has(i.id));
	const customerIds = [...new Set(stalled.map((i) => i.customer_id).filter(Boolean))];
	const { data: customers } = customerIds.length ? await db.from("customers").select("id, name").in("id", customerIds) : { data: [] };
	const customerName = new Map((customers ?? []).map((c) => [c.id, c.name]));
	for (const impl of stalled) {
		const days = Math.floor((now - new Date(impl.stage_entered_at).getTime()) / 864e5);
		await createAlert({
			kind: "stalled_implementation",
			severity: "warning",
			title: `Stalled: ${customerName.get(impl.customer_id) ?? impl.name} — ${days}d in ${impl.current_stage}`,
			detail: `Implementation "${impl.name}" has been in stage "${impl.current_stage}" for ${days} days with no advance.`,
			customerId: impl.customer_id,
			implementationId: impl.id,
			notify: true,
			actor: { type: "system" }
		});
		summary.stalled += 1;
	}
	const today = new Date(now).toISOString().slice(0, 10);
	const { data: milestones } = await db.from("milestones").select("id, name, implementation_id, target_date, completed_date, status").lt("target_date", today).is("completed_date", null);
	const overdue = (milestones ?? []).filter((m) => ![
		"completed",
		"complete",
		"done"
	].includes((m.status ?? "").toLowerCase()) && !milestoneFlagged.has(m.id));
	const implIds = [...new Set(overdue.map((m) => m.implementation_id).filter(Boolean))];
	const { data: milestoneImpls } = implIds.length ? await db.from("implementations").select("id, customer_id, name").in("id", implIds) : { data: [] };
	const implById = new Map((milestoneImpls ?? []).map((i) => [i.id, i]));
	for (const m of overdue) {
		const impl = implById.get(m.implementation_id);
		await createAlert({
			kind: "overdue_milestone",
			severity: "warning",
			title: `Overdue milestone: ${m.name}`,
			detail: `Milestone "${m.name}"${impl ? ` on "${impl.name}"` : ""} was due ${m.target_date} and is not complete.`,
			customerId: impl?.customer_id ?? null,
			implementationId: m.implementation_id,
			payload: { milestone_id: m.id },
			notify: false,
			actor: { type: "system" }
		});
		summary.overdue_milestones += 1;
	}
	await audit({
		actor_type: "system",
		action: "cron.sla_sweep",
		payload: summary
	});
	return Response.json({
		ok: true,
		...summary
	});
}
async function handle(request) {
	const denied = await authorizeCron(request);
	if (denied) return denied;
	try {
		return await runSlaSweep();
	} catch (e) {
		console.error("cron /api/cron/sla failed", e);
		return Response.json({
			ok: false,
			error: "sweep_failed"
		}, { status: 500 });
	}
}
var Route$7 = createFileRoute("/api/cron/sla")({ server: { handlers: {
	GET: ({ request }) => handle(request),
	POST: ({ request }) => handle(request)
} } });
function resultPage(status) {
	const copy = {
		approved: {
			title: "TAM request approved",
			body: "The requester has been notified. You can close this tab."
		},
		declined: {
			title: "TAM request declined",
			body: "The requester has been notified. You can close this tab."
		},
		expired: {
			title: "This link has already been used",
			body: "The request was already decided, or the link expired. Check the portal for its current status."
		},
		invalid: {
			title: "This link is not valid",
			body: "The decision link could not be verified. Ask for a fresh request email or decide in the portal."
		}
	};
	const c = copy[status] ?? copy["invalid"];
	const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${c.title}</title></head>
<body style="font-family:sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#fafaf9">
  <div style="max-width:26rem;text-align:center">
    <h1 style="font-size:18px;margin-bottom:8px">${c.title}</h1>
    <p style="font-size:14px;color:#555">${c.body}</p>
  </div>
</body></html>`;
	return new Response(html, {
		status: status === "invalid" || status === "expired" ? 400 : 200,
		headers: { "content-type": "text/html; charset=utf-8" }
	});
}
var Route$6 = createFileRoute("/api/tam/decision")({ server: { handlers: {
	GET: async ({ request }) => {
		const { verifyDecisionToken } = await import("./tokens-Dl8HVXbD.mjs").then((n) => n.n).then((n) => n.n);
		const token = new URL(request.url).searchParams.get("token") ?? "";
		const verified = await verifyDecisionToken(token);
		if (!verified) return resultPage("invalid");
		const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Confirming…</title></head>
<body style="font-family:sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center">
  <form method="POST" action="/api/tam/decision" id="f">
    <input type="hidden" name="token" value="${token.replaceAll("\"", "&quot;")}">
    <p>Recording your decision…</p>
    <noscript><button type="submit">Confirm ${verified.action}</button></noscript>
  </form>
  <script>document.getElementById("f").submit();<\/script>
</body></html>`;
		return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
	},
	POST: async ({ request }) => {
		const { randomUUID } = await import("crypto");
		const { verifyDecisionToken } = await import("./tokens-Dl8HVXbD.mjs").then((n) => n.n).then((n) => n.n);
		const { supabaseAdmin } = await import("./client.server-KzwUIAkW.mjs");
		const { notifyRequesterOfDecision } = await import("./tam-C6ai85F3.mjs");
		const { audit } = await import("./audit-D9QQPMll.mjs").then((n) => n.n).then((n) => n.n);
		const form = await request.formData();
		const verified = await verifyDecisionToken(String(form.get("token") ?? ""));
		if (!verified) return resultPage("invalid");
		const admin = supabaseAdmin;
		const { data: tamRequest } = await admin.from("portal_tam_requests").update({
			status: verified.action === "approve" ? "approved" : "declined",
			decided_at: (/* @__PURE__ */ new Date()).toISOString(),
			decided_via: "email",
			token_jti: randomUUID()
		}).eq("id", verified.requestId).eq("status", "pending").eq("token_jti", verified.jti).select("*").maybeSingle();
		if (!tamRequest) return resultPage("expired");
		await audit({
			actor_type: "email_token",
			actor_id: tamRequest.id,
			action: `tam.${verified.action}`,
			entity_type: "tam_request",
			entity_id: tamRequest.id,
			payload: { via: "email" }
		});
		const { data: account } = await admin.from("portal_accounts").select("name").eq("id", tamRequest.account_id).single();
		await notifyRequesterOfDecision(tamRequest, account?.name ?? "your account");
		return resultPage(tamRequest.status);
	}
} } });
var Route$5 = createFileRoute("/api/v1/accounts")({ server: { handlers: {
	POST: async ({ request }) => {
		const { requireApiKey, apiError } = await import("./api-auth-CEicC0tV.mjs");
		const { upsertAccount } = await import("./accounts-DqR2G5Th.mjs");
		const { accountUpsertSchema } = await import("./schemas-DUHo3qXr.mjs");
		const auth = await requireApiKey(request, "accounts:write");
		if (auth instanceof Response) return auth;
		let body;
		try {
			body = await request.json();
		} catch {
			return apiError(422, "invalid_json", "Body must be JSON");
		}
		const parsed = accountUpsertSchema.safeParse(body);
		if (!parsed.success) return apiError(422, "validation_failed", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
		try {
			const result = await upsertAccount(parsed.data, {
				source: "api",
				actorApiKeyId: auth.apiKeyId
			});
			return Response.json({
				account: result.account,
				created: result.created,
				stage_changed: result.stage_changed
			}, { status: result.created ? 201 : 200 });
		} catch (e) {
			return apiError(500, "upsert_failed", e instanceof Error ? e.message : "Unknown error");
		}
	},
	GET: async ({ request }) => {
		const { requireApiKey, apiError } = await import("./api-auth-CEicC0tV.mjs");
		const { isStage } = await import("./presale-stages-BXcdOdDO.mjs").then((n) => n.i).then((n) => n.i);
		const { supabaseAdmin } = await import("./client.server-KzwUIAkW.mjs");
		const { audit } = await import("./audit-D9QQPMll.mjs").then((n) => n.n).then((n) => n.n);
		const auth = await requireApiKey(request, "accounts:read");
		if (auth instanceof Response) return auth;
		const url = new URL(request.url);
		const stage = url.searchParams.get("stage");
		const updatedSince = url.searchParams.get("updated_since");
		let query = supabaseAdmin.from("portal_accounts").select("*").order("updated_at", { ascending: false }).limit(500);
		if (stage) {
			if (!isStage(stage)) return apiError(422, "invalid_stage", `Unknown stage '${stage}'`);
			query = query.eq("stage", stage);
		}
		if (updatedSince) {
			if (Number.isNaN(Date.parse(updatedSince))) return apiError(422, "invalid_timestamp", "updated_since must be ISO-8601");
			query = query.gte("updated_at", updatedSince);
		}
		const { data, error } = await query;
		if (error) return apiError(500, "query_failed", error.message);
		await audit({
			actor_type: "api_key",
			actor_id: auth.apiKeyId,
			action: "accounts.list",
			payload: {
				stage,
				updated_since: updatedSince
			}
		});
		return Response.json({ accounts: data });
	}
} } });
/**
* POST /api/v1/alerts — report that something is out of spec from an external
* system. Inserts an alerts row and emails every manager + super admin when
* severity is not 'info'.
* Auth: API key with the 'alerts:write' scope.
*/
var createAlertBody = objectType({
	kind: stringType().min(1).max(60).optional(),
	severity: enumType([
		"info",
		"warning",
		"critical"
	]).optional(),
	title: stringType().min(1).max(300),
	detail: stringType().max(2e4).nullable().optional(),
	customer_id: stringType().uuid().nullable().optional(),
	implementation_id: stringType().uuid().nullable().optional(),
	payload: recordType(stringType(), unknownType()).nullable().optional()
});
var Route$4 = createFileRoute("/api/v1/alerts")({ server: { handlers: { POST: async ({ request }) => {
	const { requireApiKey, apiError } = await import("./api-auth-CEicC0tV.mjs");
	const auth = await requireApiKey(request, "alerts:write");
	if (auth instanceof Response) return auth;
	let parsed;
	try {
		parsed = createAlertBody.parse(await request.json());
	} catch (e) {
		return apiError(422, "invalid_body", e instanceof ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : "Body must be valid JSON");
	}
	try {
		const { createAlert } = await import("./tickets.server-uG27zEr0.mjs");
		const alert = await createAlert({
			kind: parsed.kind ?? "external",
			severity: parsed.severity,
			title: parsed.title,
			detail: parsed.detail ?? null,
			customerId: parsed.customer_id ?? null,
			implementationId: parsed.implementation_id ?? null,
			source: "api",
			payload: parsed.payload ?? null,
			notify: true,
			actor: {
				type: "api_key",
				id: auth.apiKeyId
			}
		});
		return Response.json({ alert_id: alert.id }, { status: 201 });
	} catch (e) {
		console.error("POST /api/v1/alerts failed", e);
		return apiError(500, "alert_create_failed", "Could not create the alert");
	}
} } } });
var Route$3 = createFileRoute("/api/v1/tam-requests")({ server: { handlers: { POST: async ({ request }) => {
	const { requireApiKey, apiError } = await import("./api-auth-CEicC0tV.mjs");
	const { resolveAccountId } = await import("./accounts-DqR2G5Th.mjs");
	const { createTamRequest } = await import("./tam-C6ai85F3.mjs");
	const { tamRequestCreateSchema } = await import("./schemas-DUHo3qXr.mjs");
	const auth = await requireApiKey(request, "tam:write");
	if (auth instanceof Response) return auth;
	let body;
	try {
		body = await request.json();
	} catch {
		return apiError(422, "invalid_json", "Body must be JSON");
	}
	const parsed = tamRequestCreateSchema.safeParse(body);
	if (!parsed.success) return apiError(422, "validation_failed", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
	const accountId = await resolveAccountId(parsed.data.account_id);
	if (!accountId) return apiError(404, "not_found", "No account matches account_id");
	try {
		const request_ = await createTamRequest({
			accountId,
			requesterEmail: parsed.data.requester_email,
			justification: parsed.data.justification,
			urgency: parsed.data.urgency,
			actorApiKeyId: auth.apiKeyId
		});
		return Response.json({
			tam_request_id: request_.id,
			status: request_.status
		}, { status: 201 });
	} catch (e) {
		return apiError(500, "create_failed", e instanceof Error ? e.message : "Unknown error");
	}
} } } });
/**
* POST /api/v1/tickets — create a ticket from an external system.
* Auth: API key with the 'tickets:write' scope.
*/
var createTicketBody = objectType({
	customer_id: stringType().uuid().nullable().optional(),
	implementation_id: stringType().uuid().nullable().optional(),
	category: enumType([
		"technical",
		"training",
		"billing",
		"data",
		"integration",
		"other"
	]),
	subject: stringType().min(1).max(300),
	body: stringType().min(1).max(2e4),
	priority: enumType([
		"low",
		"normal",
		"high",
		"urgent"
	]).optional(),
	submitter_email: stringType().email()
});
var Route$2 = createFileRoute("/api/v1/tickets")({ server: { handlers: { POST: async ({ request }) => {
	const { requireApiKey, apiError } = await import("./api-auth-CEicC0tV.mjs");
	const auth = await requireApiKey(request, "tickets:write");
	if (auth instanceof Response) return auth;
	let parsed;
	try {
		parsed = createTicketBody.parse(await request.json());
	} catch (e) {
		return apiError(422, "invalid_body", e instanceof ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : "Body must be valid JSON");
	}
	if (parsed.customer_id) {
		const { supabaseAdmin } = await import("./client.server-KzwUIAkW.mjs");
		const { data: customer } = await supabaseAdmin.from("customers").select("id").eq("id", parsed.customer_id).maybeSingle();
		if (!customer) return apiError(422, "unknown_customer", "No customer with that id");
	}
	try {
		const { createTicket } = await import("./tickets.server-uG27zEr0.mjs");
		const ticket = await createTicket({
			customerId: parsed.customer_id ?? null,
			implementationId: parsed.implementation_id ?? null,
			category: parsed.category,
			subject: parsed.subject,
			body: parsed.body,
			priority: parsed.priority,
			submittedBy: null,
			submitterEmail: parsed.submitter_email,
			actor: {
				type: "api_key",
				id: auth.apiKeyId
			}
		});
		return Response.json({
			ticket_id: ticket.id,
			status: ticket.status,
			sla_due_at: ticket.sla_due_at
		}, { status: 201 });
	} catch (e) {
		console.error("POST /api/v1/tickets failed", e);
		return apiError(500, "ticket_create_failed", "Could not create the ticket");
	}
} } } });
var Route$1 = createFileRoute("/api/v1/accounts/$id")({ server: { handlers: { GET: async ({ request, params }) => {
	const { requireApiKey, apiError } = await import("./api-auth-CEicC0tV.mjs");
	const { resolveAccountId } = await import("./accounts-DqR2G5Th.mjs");
	const { supabaseAdmin } = await import("./client.server-KzwUIAkW.mjs");
	const auth = await requireApiKey(request, "accounts:read");
	if (auth instanceof Response) return auth;
	const { id } = params;
	const accountId = await resolveAccountId(id);
	if (!accountId) return apiError(404, "not_found", "No account matches that id");
	const admin = supabaseAdmin;
	const [{ data: account }, { data: transitions }] = await Promise.all([admin.from("portal_accounts").select("*").eq("id", accountId).single(), admin.from("portal_stage_transitions").select("from_stage, to_stage, source, note, occurred_at").eq("account_id", accountId).order("occurred_at", { ascending: false }).limit(50)]);
	if (!account) return apiError(404, "not_found", "No account matches that id");
	return Response.json({
		account,
		stage_history: transitions ?? []
	});
} } } });
var Route = createFileRoute("/api/v1/accounts/$id/transition")({ server: { handlers: { POST: async ({ request, params }) => {
	const { requireApiKey, apiError } = await import("./api-auth-CEicC0tV.mjs");
	const { resolveAccountId, transitionStage } = await import("./accounts-DqR2G5Th.mjs");
	const { transitionSchema } = await import("./schemas-DUHo3qXr.mjs");
	const auth = await requireApiKey(request, "transitions:write");
	if (auth instanceof Response) return auth;
	const { id } = params;
	const accountId = await resolveAccountId(id);
	if (!accountId) return apiError(404, "not_found", "No account matches that id");
	let body;
	try {
		body = await request.json();
	} catch {
		return apiError(422, "invalid_json", "Body must be JSON");
	}
	const parsed = transitionSchema.safeParse(body);
	if (!parsed.success) return apiError(422, "validation_failed", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
	try {
		const { changed } = await transitionStage(accountId, parsed.data.to_stage, {
			source: "api",
			actorApiKeyId: auth.apiKeyId
		}, parsed.data.note, parsed.data.occurred_at);
		return Response.json({
			changed,
			account_id: accountId,
			stage: parsed.data.to_stage
		});
	} catch (e) {
		return apiError(500, "transition_failed", e instanceof Error ? e.message : "Unknown error");
	}
} } } });
var IndexRoute = Route$41.update({
	id: "/",
	path: "/",
	getParentRoute: () => Route$42
});
var AccessRoute = Route$40.update({
	id: "/access",
	path: "/access",
	getParentRoute: () => Route$42
});
var AdminRoute = Route$39.update({
	id: "/admin",
	path: "/admin",
	getParentRoute: () => Route$42
});
var AlertsRoute = Route$38.update({
	id: "/alerts",
	path: "/alerts",
	getParentRoute: () => Route$42
});
var CustomersRoute = Route$37.update({
	id: "/customers",
	path: "/customers",
	getParentRoute: () => Route$42
});
var ForgotPasswordRoute = Route$36.update({
	id: "/forgot-password",
	path: "/forgot-password",
	getParentRoute: () => Route$42
});
var JourneysRoute = Route$35.update({
	id: "/journeys",
	path: "/journeys",
	getParentRoute: () => Route$42
});
var LoginRoute = Route$34.update({
	id: "/login",
	path: "/login",
	getParentRoute: () => Route$42
});
var PipelineRoute = Route$33.update({
	id: "/pipeline",
	path: "/pipeline",
	getParentRoute: () => Route$42
});
var PortalRoute = Route$32.update({
	id: "/portal",
	path: "/portal",
	getParentRoute: () => Route$42
});
var PortfolioRoute = Route$31.update({
	id: "/portfolio",
	path: "/portfolio",
	getParentRoute: () => Route$42
});
var SettingsRoute = Route$30.update({
	id: "/settings",
	path: "/settings",
	getParentRoute: () => Route$42
});
var SignupRoute = Route$29.update({
	id: "/signup",
	path: "/signup",
	getParentRoute: () => Route$42
});
var TechnicalSolutionsRoute = Route$28.update({
	id: "/technical-solutions",
	path: "/technical-solutions",
	getParentRoute: () => Route$42
});
var TicketsRoute = Route$27.update({
	id: "/tickets",
	path: "/tickets",
	getParentRoute: () => Route$42
});
var AdminIndexRoute = Route$26.update({
	id: "/",
	path: "/",
	getParentRoute: () => AdminRoute
});
var AdminApiKeysRoute = Route$25.update({
	id: "/api-keys",
	path: "/api-keys",
	getParentRoute: () => AdminRoute
});
var AdminUsersRoute = Route$24.update({
	id: "/users",
	path: "/users",
	getParentRoute: () => AdminRoute
});
var AuthCallbackRoute = Route$23.update({
	id: "/auth/callback",
	path: "/auth/callback",
	getParentRoute: () => Route$42
});
var CustomersIndexRoute = Route$22.update({
	id: "/",
	path: "/",
	getParentRoute: () => CustomersRoute
});
var CustomersCustomerIdRoute = Route$21.update({
	id: "/$customerId",
	path: "/$customerId",
	getParentRoute: () => CustomersRoute
});
var DealsDealIdRoute = Route$20.update({
	id: "/deals/$dealId",
	path: "/deals/$dealId",
	getParentRoute: () => Route$42
});
var JourneysIndexRoute = Route$19.update({
	id: "/",
	path: "/",
	getParentRoute: () => JourneysRoute
});
var JourneysJourneyIdRoute = Route$18.update({
	id: "/$journeyId",
	path: "/$journeyId",
	getParentRoute: () => JourneysRoute
});
var OwnersOwnerRoute = Route$17.update({
	id: "/owners/$owner",
	path: "/owners/$owner",
	getParentRoute: () => Route$42
});
var PortalIndexRoute = Route$16.update({
	id: "/",
	path: "/",
	getParentRoute: () => PortalRoute
});
var PortalTicketsRoute = Route$15.update({
	id: "/tickets",
	path: "/tickets",
	getParentRoute: () => PortalRoute
});
var TechnicalSolutionsIndexRoute = Route$14.update({
	id: "/",
	path: "/",
	getParentRoute: () => TechnicalSolutionsRoute
});
var TechnicalSolutionsIdRoute = Route$13.update({
	id: "/$id",
	path: "/$id",
	getParentRoute: () => TechnicalSolutionsRoute
});
var TicketsIndexRoute = Route$12.update({
	id: "/",
	path: "/",
	getParentRoute: () => TicketsRoute
});
var TicketsTicketIdRoute = Route$11.update({
	id: "/$ticketId",
	path: "/$ticketId",
	getParentRoute: () => TicketsRoute
});
var TicketsRoutingRoute = Route$10.update({
	id: "/routing",
	path: "/routing",
	getParentRoute: () => TicketsRoute
});
var ViewTokenRoute = Route$9.update({
	id: "/view/$token",
	path: "/view/$token",
	getParentRoute: () => Route$42
});
var ApiCronJourneysRoute = Route$8.update({
	id: "/api/cron/journeys",
	path: "/api/cron/journeys",
	getParentRoute: () => Route$42
});
var ApiCronSlaRoute = Route$7.update({
	id: "/api/cron/sla",
	path: "/api/cron/sla",
	getParentRoute: () => Route$42
});
var ApiTamDecisionRoute = Route$6.update({
	id: "/api/tam/decision",
	path: "/api/tam/decision",
	getParentRoute: () => Route$42
});
var ApiV1AccountsRoute = Route$5.update({
	id: "/api/v1/accounts",
	path: "/api/v1/accounts",
	getParentRoute: () => Route$42
});
var ApiV1AlertsRoute = Route$4.update({
	id: "/api/v1/alerts",
	path: "/api/v1/alerts",
	getParentRoute: () => Route$42
});
var ApiV1TamRequestsRoute = Route$3.update({
	id: "/api/v1/tam-requests",
	path: "/api/v1/tam-requests",
	getParentRoute: () => Route$42
});
var ApiV1TicketsRoute = Route$2.update({
	id: "/api/v1/tickets",
	path: "/api/v1/tickets",
	getParentRoute: () => Route$42
});
var ApiV1AccountsIdRoute = Route$1.update({
	id: "/$id",
	path: "/$id",
	getParentRoute: () => ApiV1AccountsRoute
});
var ApiV1AccountsIdTransitionRoute = Route.update({
	id: "/transition",
	path: "/transition",
	getParentRoute: () => ApiV1AccountsIdRoute
});
var AdminRouteChildren = {
	AdminApiKeysRoute,
	AdminUsersRoute,
	AdminIndexRoute
};
var AdminRouteWithChildren = AdminRoute._addFileChildren(AdminRouteChildren);
var CustomersRouteChildren = {
	CustomersCustomerIdRoute,
	CustomersIndexRoute
};
var CustomersRouteWithChildren = CustomersRoute._addFileChildren(CustomersRouteChildren);
var JourneysRouteChildren = {
	JourneysJourneyIdRoute,
	JourneysIndexRoute
};
var JourneysRouteWithChildren = JourneysRoute._addFileChildren(JourneysRouteChildren);
var PortalRouteChildren = {
	PortalTicketsRoute,
	PortalIndexRoute
};
var PortalRouteWithChildren = PortalRoute._addFileChildren(PortalRouteChildren);
var TechnicalSolutionsRouteChildren = {
	TechnicalSolutionsIdRoute,
	TechnicalSolutionsIndexRoute
};
var TechnicalSolutionsRouteWithChildren = TechnicalSolutionsRoute._addFileChildren(TechnicalSolutionsRouteChildren);
var TicketsRouteChildren = {
	TicketsTicketIdRoute,
	TicketsRoutingRoute,
	TicketsIndexRoute
};
var TicketsRouteWithChildren = TicketsRoute._addFileChildren(TicketsRouteChildren);
var ApiV1AccountsIdRouteChildren = { ApiV1AccountsIdTransitionRoute };
var ApiV1AccountsRouteChildren = { ApiV1AccountsIdRoute: ApiV1AccountsIdRoute._addFileChildren(ApiV1AccountsIdRouteChildren) };
var rootRouteChildren = {
	IndexRoute,
	AccessRoute,
	AdminRoute: AdminRouteWithChildren,
	AlertsRoute,
	CustomersRoute: CustomersRouteWithChildren,
	ForgotPasswordRoute,
	JourneysRoute: JourneysRouteWithChildren,
	LoginRoute,
	PipelineRoute,
	PortalRoute: PortalRouteWithChildren,
	PortfolioRoute,
	SettingsRoute,
	SignupRoute,
	TechnicalSolutionsRoute: TechnicalSolutionsRouteWithChildren,
	TicketsRoute: TicketsRouteWithChildren,
	AuthCallbackRoute,
	DealsDealIdRoute,
	OwnersOwnerRoute,
	ViewTokenRoute,
	ApiCronJourneysRoute,
	ApiCronSlaRoute,
	ApiTamDecisionRoute,
	ApiV1AccountsRoute: ApiV1AccountsRoute._addFileChildren(ApiV1AccountsRouteChildren),
	ApiV1AlertsRoute,
	ApiV1TamRequestsRoute,
	ApiV1TicketsRoute
};
var routeTree = Route$42._addFileChildren(rootRouteChildren)._addFileTypes();
var router_exports = /* @__PURE__ */ __exportAll({ getRouter: () => getRouter });
var getRouter = () => {
	const queryClient = new QueryClient();
	return createRouter({
		routeTree,
		context: { queryClient },
		scrollRestoration: true,
		defaultPreloadStaleTime: 0
	});
};
//#endregion
export { addContentItem as $, setImplementation as $t, inviteContact as A, addImplementation as At, useProfile as B, applySowProposalToImplementation as Bt, Route$22 as C, addApproval as Ct, leadershipQuery$1 as D, addEscalation as Dt, keysQuery as E, addDecision as Et, ROLE_LABELS as F, addSuccessCriterion as Ft, TICKET_PRIORITIES as G, setAdoptionArea as Gt, PriorityChip as H, getAttachmentLink as Ht, canEditSales as I, addSuccessCriterionConfirmation as It, buttonClass as J, setCustomerContact as Jt, TICKET_STATUSES as K, setApproval as Kt, canManage as L, addSuccessCriterionObservation as Lt, revokeCustomerInvite as M, addJournalEntry as Mt, homeQuery as N, addRequirement as Nt, pipelineQuery as O, addEvidence as Ot, LifecycleRail as P, addRisk as Pt, selectClass as Q, setFieldMapping as Qt, isSuperAdmin as R, advanceImplementationStage as Rt, customerQuery as S, addAdoptionObservation as St, usersQuery as T, addCustomerContact as Tt, SlaChip as U, getHome as Ut, BreachBadge as V, createTechnicalSolutionNote as Vt, TICKET_CATEGORIES as W, getTeamOptions as Wt, microLabelClass as X, setEscalation as Xt, inputClass as Y, setDecision as Yt, primaryButtonClass as Z, setEvidence as Zt, journeysQuery as _, revokeApiKey as _t, Route$13 as a, setSuccessCriterion as an, toggleJourneyActive as at, Route$21 as b, startOnboardingForDeal as bt, solutionsQuery as c, setTechnicalSolutionStatus as cn, addReport as ct, replyTicket as d, cn as dn, generateBriefForDeal as dt, setIssue as en, addJourney as et, submitTicket as f, getBriefDownloadUrl as ft, detailQuery as g, removeReport as gt, Route$18 as h, removeNote as ht, Route$12 as i, setSowDocumentForImplementation as in, saveStep as it, removeCustomerAccess as j, addIssue as jt, accessQuery as k, addFieldMapping as kt, portalHomeQuery as l, uploadAttachment as ln, createApiKey as lt, leadershipQuery as m, moveDealStage as mt, Route$9 as n, setRisk as nn, recordJourneyView as nt, solutionQuery as o, setSuccessCriterionConfirmation as on, addDeal as ot, Route$17 as p, importDeals as pt, TicketStatusChip as q, setCommitment as qt, Route$11 as r, setSolutionDesign as rn, removeStep as rt, Route$14 as s, setTechnicalSolutionOwner as sn, addNote as st, router_exports as t, setRequirement as tn, enrollJourneyContact as tt, portalTicketsQuery as u, createSsrRpc as un, createTamRequestForDeal as ut, Route$20 as v, setNoteReviewed as vt, implementationsQuery as w, addCommitment as wt, TABS as x, addAdoptionArea as xt, dealQuery as y, setUserRole as yt, signOut as z, analyzeSowDocument as zt };
