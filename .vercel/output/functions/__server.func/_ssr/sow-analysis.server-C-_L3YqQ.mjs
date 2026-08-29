import { n as LIFECYCLE_STAGES } from "./lifecycle-Cl8aBFg1.mjs";
import { it as sowAnalysisSchema } from "./implementation-input-BaYoTLwL.mjs";
import { supabaseAdmin } from "./client.server-KzwUIAkW.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/sow-analysis.server-C-_L3YqQ.js
var ATTACHMENT_BUCKET = "attachments";
var MODEL = "google/gemini-3.7-flash";
var GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
/** How much of a text SOW we hand to the model — POC scale. */
var MAX_TEXT_CHARS = 12e4;
/** ~8 MB of PDF; larger documents are rejected with a clear message. */
var MAX_FILE_BYTES = 8e6;
var db = () => supabaseAdmin;
function extensionOf(name) {
	const m = /\.([A-Za-z0-9]+)$/.exec(name.trim());
	return m ? m[1].toLowerCase() : "";
}
var SYSTEM_PROMPT = `You read Statements of Work for a B2B SaaS implementation team and return structured JSON only.

Rules you must not break:
- Only report what the document supports. Never invent objectives, deliverables, integrations, dates or criteria.
- Mark every finding with confidence: "stated" (the document says it plainly), "implied" (a reasonable reading), "uncertain" (ambiguous or thin).
- Include a short verbatim quote for a finding whenever one exists, otherwise null.
- Propose journey stages ONLY where the document justifies them. Omit a stage rather than padding the journey.
- Where a proposed stage lines up with the team's existing lifecycle stage, set lifecycleStage to that id; otherwise null.
- For each proposed stage, carry across only the customer responsibilities and acceptance criteria the SOW ties to that work. Empty arrays where the SOW says nothing.
- Capture anything the SOW marks as excluded in extraction.outOfScope, and named dependencies in extraction.dependencies.
- extraction.requirements: concrete things that must be delivered or configured. extraction.technicalSolutions: work needing technical/solution-engineering involvement (integrations, data migration, custom configuration). extraction.successMeasures: how the customer will judge value, with the metric where stated. extraction.risksAndQuestions: risks the SOW names plus anything genuinely unclear that a delivery lead would need to ask.
- Every proposed stage MUST set lifecycleStage to one of the existing lifecycle stage ids below. Use the closest fit; do not invent stages that map to nothing.
- Timing: capture the overall delivery window in deliveryWindow. statedText is the SOW's own wording (e.g. "16 to 22 weeks"). minWeeks/maxWeeks are that window in whole weeks, null when the SOW gives no duration. startDateStated is a calendar start the SOW names, otherwise null — never invent one. startCondition is what the SOW says the clock starts on (signature, kickoff, environment access), otherwise null. delayConditions are the conditions the SOW says would delay or extend delivery. stageTimingProvided is true only when the SOW gives timing per phase or stage.
- Stage timing must be a credible planning estimate of the actual work, NOT an even division of the total. Do not give every stage a similar duration. Weight the weeks by the scope, complexity, integration and migration load, customer responsibilities and sequencing the SOW describes: effort concentrates where the SOW describes the most work. Where the SOW states timing for a phase, use it exactly, set timing.fromSow=true and put the SOW wording in timing.statedText.
- Stages may and should overlap where the work can genuinely run in parallel (e.g. enablement content prepared during build). List the other stage names in timing.parallelWith. Do not overlap work that depends on an earlier output.
- Make dependencies explicit: timing.dependencyDriver is the one dependency that governs when the stage can start (e.g. "customer sandbox credentials", "a usable build to test against"). timing.rationale is one short sentence saying why that duration is credible for the described work.
- Keep the last stage's endWeek inside the stated window where the described work plausibly fits. If it genuinely does not fit, still give your honest estimate and add an assumption saying it exceeds the SOW window.
- If the SOW gives too little detail to estimate a stage credibly, set timing.insufficientInfo=true and leave startWeek/endWeek null. Never manufacture a schedule just because an overall duration exists — an honest "insufficient information" is required rather than invented precision. If the SOW supports no stage timing at all, say so in gaps.
- Never output calendar dates for stages. Weeks only, counted from week 1 as the first week of delivery.
- Add an assumption entry for anything you inferred about timing, sequencing or overlap.
- If the document is not a SOW, is empty, or cannot be read as text, set readable=false and explain in "problem", and leave the arrays empty.

Existing lifecycle stage ids: ${LIFECYCLE_STAGES.map((s) => s.id).join(", ")}.

Return JSON exactly in this shape:
{"readable":true,"problem":null,"summary":"","extraction":{"objectives":[{"text":"","confidence":"stated","quote":null}],"scope":[],"deliverables":[],"integrations":[],"customerResponsibilities":[],"providerResponsibilities":[],"trainingAndAdoption":[],"acceptanceCriteria":[],"timeline":[],"dependencies":[],"outOfScope":[],"requirements":[],"technicalSolutions":[],"successMeasures":[],"risksAndQuestions":[]},"deliveryWindow":{"statedText":null,"minWeeks":null,"maxWeeks":null,"startDateStated":null,"startCondition":null,"delayConditions":[],"stageTimingProvided":false,"quote":null},"proposedJourney":[{"name":"","lifecycleStage":"handoff","purpose":"","workstreams":[],"dependencies":[],"customerResponsibilities":[],"acceptanceCriteria":[],"timing":{"startWeek":null,"endWeek":null,"statedText":null,"fromSow":false,"rationale":null,"dependencyDriver":null,"parallelWith":[],"insufficientInfo":false},"confidence":"stated"}],"assumptions":[],"gaps":[]}`;
/** Build the user message content from the stored file, by type. */
async function sowContent(bytes, fileName) {
	const ext = extensionOf(fileName);
	const instruction = {
		type: "text",
		text: "Read this Statement of Work and return the JSON described in the system message. Ground everything in the document."
	};
	if (ext === "pdf") return [instruction, {
		type: "file",
		file: {
			filename: fileName,
			file_data: `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`
		}
	}];
	if ([
		"txt",
		"md",
		"markdown",
		"csv",
		"json",
		"html",
		"rtf"
	].includes(ext) || ext === "") {
		const text = new TextDecoder().decode(bytes).slice(0, MAX_TEXT_CHARS).trim();
		if (text.length < 40) throw new Error("The attached SOW looks empty — there is no readable text to analyse.");
		return [instruction, {
			type: "text",
			text
		}];
	}
	throw new Error(`The attached SOW is a .${ext} file, which this preview cannot read. Attach the SOW as a PDF or a text file and try again.`);
}
function tryParseAnalysis(raw) {
	const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
	let json;
	try {
		json = JSON.parse(cleaned);
	} catch {
		console.error("[sow-analysis] not json", cleaned.slice(0, 300));
		return null;
	}
	const parsed = sowAnalysisSchema.safeParse(json);
	if (!parsed.success) {
		console.error("[sow-analysis] shape mismatch", JSON.stringify(parsed.error.issues).slice(0, 800));
		return null;
	}
	return parsed.data;
}
/**
* Read the SOW already attached to an implementation and propose a journey.
* Read-only: nothing is written to the implementation here.
*/
async function analyzeSow(implementationId) {
	const { data: impl, error } = await db().from("implementations").select("id,sow_document_url,sow_document_name").eq("id", implementationId).maybeSingle();
	if (error) throw new Error("Could not load the implementation.");
	if (!impl) throw new Error("That implementation no longer exists.");
	if (!impl.sow_document_url) throw new Error("No SOW is attached to this implementation yet — attach one first.");
	const download = await db().storage.from(ATTACHMENT_BUCKET).download(impl.sow_document_url);
	if (download.error || !download.data) throw new Error("Could not open the attached SOW file.");
	const bytes = new Uint8Array(await download.data.arrayBuffer());
	if (bytes.byteLength === 0) throw new Error("The attached SOW file is empty.");
	if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("The attached SOW is too large for this preview to analyse.");
	const apiKey = process.env["LOVABLE_API_KEY"];
	if (!apiKey) throw new Error("AI analysis is not configured for this project.");
	const content = await sowContent(bytes, impl.sow_document_name ?? impl.sow_document_url);
	const requestAnalysis = () => fetch(GATEWAY, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Lovable-API-Key": apiKey,
			"X-Lovable-AIG-SDK": "fetch"
		},
		body: JSON.stringify({
			model: MODEL,
			response_format: { type: "json_object" },
			messages: [{
				role: "system",
				content: SYSTEM_PROMPT
			}, {
				role: "user",
				content
			}]
		})
	});
	let res = await requestAnalysis();
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		if (res.status === 429) throw new Error("The AI service is busy — try again in a moment.");
		if (res.status === 402) throw new Error("AI credits for this workspace are used up, so analysis cannot run.");
		if (res.status === 403) throw new Error("AI analysis is blocked for this workspace by an administrator setting.");
		console.error("[sow-analysis] gateway error", res.status, body.slice(0, 500));
		throw new Error("The SOW analysis failed. Nothing has been changed.");
	}
	const readText = async (r) => {
		return (await r.json()).choices?.[0]?.message?.content ?? "";
	};
	let analysis = tryParseAnalysis(await readText(res));
	if (!analysis) {
		res = await requestAnalysis();
		if (res.ok) analysis = tryParseAnalysis(await readText(res));
	}
	if (!analysis) throw new Error("The analysis came back incomplete. Run it again.");
	if (!analysis.readable) throw new Error(analysis.problem ?? "The attached document could not be read as a Statement of Work.");
	if (analysis.proposedJourney.length === 0) throw new Error("The SOW did not contain enough detail to propose a journey. Nothing has been changed.");
	return {
		sowName: impl.sow_document_name ?? null,
		sowPath: impl.sow_document_url,
		analysis
	};
}
/**
* Apply a reviewed SOW proposal. Additive only: goals are appended, records are
* inserted, and nothing already recorded is updated or removed.
*/
async function applySowProposal(input) {
	const { data: impl, error } = await db().from("implementations").select("id,customer_goals").eq("id", input.implementationId).maybeSingle();
	if (error) throw new Error("Could not load the implementation.");
	if (!impl) throw new Error("That implementation no longer exists.");
	const applied = {
		goals: false,
		requirements: 0,
		successMeasures: 0,
		note: false
	};
	if (input.goals) {
		const existing = impl.customer_goals?.trim() ?? "";
		const next = existing === "" ? input.goals : `${existing}\n\nFrom the SOW analysis:\n${input.goals}`;
		const { error: goalError } = await db().from("implementations").update({ customer_goals: next }).eq("id", input.implementationId);
		if (goalError) throw new Error("Could not save the customer goals.");
		applied.goals = true;
	}
	if (input.requirements.length > 0) {
		const rows = input.requirements.map((title) => ({
			implementation_id: input.implementationId,
			title,
			priority: "should_have",
			status: "open",
			scope_status: "original",
			source: "SOW analysis"
		}));
		const { error: reqError } = await db().from("requirements").insert(rows);
		if (reqError) throw new Error("Could not save the requirements.");
		applied.requirements = rows.length;
	}
	if (input.successMeasures.length > 0) {
		const rows = input.successMeasures.map((description) => ({
			implementation_id: input.implementationId,
			description,
			status: "pending",
			measurement_source: "SOW analysis"
		}));
		const { error: scError } = await db().from("success_criteria").insert(rows);
		if (scError) throw new Error("Could not save the success measures.");
		applied.successMeasures = rows.length;
	}
	if (input.journeyNote) {
		const { createJournalEntry } = await import("./hub.server-BTxjhvqi.mjs");
		await createJournalEntry({
			implementationId: input.implementationId,
			note: input.journeyNote,
			authorId: input.authorId,
			links: null,
			attachmentUrl: null,
			attachmentName: null
		});
		applied.note = true;
	}
	return applied;
}
/** Points the implementation at a newly uploaded SOW file. Nothing else changes. */
async function setSowDocument(input) {
	const { error } = await db().from("implementations").update({
		sow_document_url: input.documentUrl,
		sow_document_name: input.documentName
	}).eq("id", input.implementationId);
	if (error) throw new Error("Could not attach that SOW.");
	return { ok: true };
}
//#endregion
export { analyzeSow, applySowProposal, setSowDocument };
