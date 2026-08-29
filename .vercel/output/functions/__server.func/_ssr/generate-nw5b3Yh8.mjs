import { supabaseAdmin } from "./client.server-KzwUIAkW.mjs";
import { n as Anthropic, t as zodOutputFormat } from "../_libs/@anthropic-ai/sdk+[...].mjs";
import { t as audit } from "./audit-D9QQPMll.mjs";
import { briefJsonSchema } from "./schemas-DUHo3qXr.mjs";
import { t as PptxGenJS } from "../_libs/pptxgenjs.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/generate-nw5b3Yh8.js
var BRIEF_SYSTEM_PROMPT = `You are a presales solutions engineer at GoCanvas preparing an implementation handoff brief for the onboarding team. GoCanvas sells mobile forms, workflows, and data-collection software that replaces paper processes.

You will receive an account's details plus Gong call notes (and possibly onboarding notes). Produce the account brief as structured data.

Rules:
- Only state facts that are present in the provided notes. Never invent stakeholders, systems, numbers, or commitments.
- Anything important that is UNKNOWN or ambiguous becomes a discovery_question, with why_it_matters explaining what the implementation team risks by not knowing it. Use categories like "process", "integrations", "users", "data", "timeline", "success".
- process_gaps are places where the client's current process is broken, manual, or lossy — the pain GoCanvas is being bought to fix.
- current_process sections walk through how the client operates today, step by step, in the client's own vocabulary where possible.
- one_liner is a single sentence an exec could read: who the client is and what they bought GoCanvas to do.
- Keep bullets tight (under 20 words each). Aim for 5-12 discovery questions.`;
function buildBriefUserPrompt(account, reports, notes) {
	const parts = [];
	parts.push(`# Account: ${account.name}`);
	const facts = [];
	if (account.domain) facts.push(`Domain: ${account.domain}`);
	if (account.arr != null) facts.push(`ARR: $${account.arr}`);
	if (account.products.length) facts.push(`Products: ${account.products.join(", ")}`);
	facts.push(`Current stage: ${account.stage}`);
	if (account.summary) facts.push(`Summary: ${account.summary}`);
	parts.push(facts.join("\n"));
	for (const r of reports) parts.push(`## ${r.report_type === "account_map" ? "Account map" : "Gong call notes"}: ${r.title} (${r.created_at.slice(0, 10)})\n\n${r.content_md}`);
	for (const n of notes) parts.push(`## Onboarding note (${n.created_at.slice(0, 10)})\n\n${n.body_md}`);
	return parts.join("\n\n---\n\n");
}
function llmAvailable() {
	return Boolean(process.env["ANTHROPIC_API_KEY"]);
}
async function generateBriefWithLLM(account, reports, notes) {
	const client = new Anthropic();
	const userPrompt = buildBriefUserPrompt(account, reports, notes);
	for (let attempt = 0; attempt < 2; attempt++) {
		const response = await client.messages.parse({
			model: "claude-opus-5",
			max_tokens: 16e3,
			system: BRIEF_SYSTEM_PROMPT,
			messages: [{
				role: "user",
				content: userPrompt
			}],
			output_config: { format: zodOutputFormat(briefJsonSchema) }
		});
		if (response.stop_reason === "refusal") return null;
		const checked = briefJsonSchema.safeParse(response.parsed_output);
		if (checked.success) return checked.data;
	}
	return null;
}
var STATIC_DISCOVERY = [
	{
		question: "Which forms/processes are in scope for go-live, and in what order?",
		why_it_matters: "Sets the rollout plan and first-value milestone.",
		category: "process"
	},
	{
		question: "How many field users and office users will be active in the first 90 days?",
		why_it_matters: "Licensing, training plan, and adoption tracking depend on it.",
		category: "users"
	},
	{
		question: "Do field teams need offline data capture?",
		why_it_matters: "Changes form design and sync expectations.",
		category: "process"
	},
	{
		question: "Where does submitted data need to land (email, ERP, BI, file share)?",
		why_it_matters: "Determines integration work and data destinations.",
		category: "integrations"
	},
	{
		question: "Are there approval or multi-step dispatch workflows today?",
		why_it_matters: "Workflow configuration is the largest implementation variable.",
		category: "process"
	},
	{
		question: "What reference data (customers, assets, price lists) must be loaded and how often does it change?",
		why_it_matters: "Drives reference-data setup and refresh automation.",
		category: "data"
	},
	{
		question: "Who signs off on go-live, and what does success look like to them in 90 days?",
		why_it_matters: "Aligns onboarding to the exec sponsor's definition of value.",
		category: "success"
	},
	{
		question: "What is the target go-live date, and is it tied to an external event?",
		why_it_matters: "Anchors the onboarding timeline.",
		category: "timeline"
	},
	{
		question: "Which existing systems (ERP, CMMS, CRM) must GoCanvas exchange data with?",
		why_it_matters: "Scopes integration effort and sequencing.",
		category: "integrations"
	},
	{
		question: "Are there compliance or audit requirements on the collected data?",
		why_it_matters: "Affects form design, signatures, and retention settings.",
		category: "data"
	}
];
function sectionize(md) {
	const sections = [];
	let current = null;
	for (const line of md.split("\n")) {
		const heading = line.match(/^#{1,3}\s+(.*)/);
		if (heading) {
			if (current && current.bullets.length) sections.push(current);
			current = {
				title: (heading[1] ?? "").trim(),
				bullets: []
			};
		} else {
			const text = line.replace(/^[-*]\s+/, "").trim();
			if (text && current) current.bullets.push(text.slice(0, 160));
		}
	}
	if (current && current.bullets.length) sections.push(current);
	return sections.slice(0, 6).map((s) => ({
		...s,
		bullets: s.bullets.slice(0, 6)
	}));
}
function buildTemplateBrief(account, reports) {
	const allSections = reports.flatMap((r) => sectionize(r.content_md));
	return {
		account_name: account.name,
		one_liner: account.summary ?? `${account.name} is adopting GoCanvas — see the attached call notes for context.`,
		current_process: allSections.length ? allSections : reports.map((r) => ({
			title: r.title,
			bullets: [r.content_md.slice(0, 300)]
		})),
		goals: [],
		what_we_know: reports.map((r) => ({
			topic: r.title,
			detail: r.content_md.slice(0, 400)
		})),
		stakeholders: [],
		risks_open_items: ["This brief was generated without AI synthesis — review the raw Gong notes for nuance."],
		discovery_questions: STATIC_DISCOVERY,
		process_gaps: ["Confirm with the client which current process steps are manual or paper-based."]
	};
}
var BRAND = {
	green: "237A4B",
	greenDark: "1C5E3A",
	ink: "1C2620",
	slate: "5E6E64",
	paper: "FAFBF9",
	line: "DCE4DE",
	amber: "A66B12",
	fontHead: "Arial",
	fontBody: "Arial"
};
var MASTER = "GC_MASTER";
function chunk(items, size) {
	const out = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out.length ? out : [[]];
}
function addBulletSlide(pptx, title, bullets) {
	const slide = pptx.addSlide({ masterName: MASTER });
	slide.addText(title, {
		x: .5,
		y: .35,
		w: 9,
		h: .6,
		fontSize: 24,
		bold: true,
		color: BRAND.green,
		fontFace: BRAND.fontHead
	});
	slide.addText(bullets.map((b) => ({
		text: b,
		options: {
			bullet: true,
			breakLine: true
		}
	})), {
		x: .6,
		y: 1.2,
		w: 8.8,
		h: 3.9,
		fontSize: 14,
		color: BRAND.ink,
		fontFace: BRAND.fontBody,
		valign: "top"
	});
}
function addTableSlide(pptx, title, header, rows) {
	const slide = pptx.addSlide({ masterName: MASTER });
	slide.addText(title, {
		x: .5,
		y: .35,
		w: 9,
		h: .6,
		fontSize: 24,
		bold: true,
		color: BRAND.green,
		fontFace: BRAND.fontHead
	});
	slide.addTable([header.map((h) => ({
		text: h,
		options: {
			bold: true,
			color: "FFFFFF",
			fill: { color: BRAND.green }
		}
	})), ...rows.map((r) => r.map((c) => ({ text: c })))], {
		x: .5,
		y: 1.2,
		w: 9,
		fontSize: 12,
		color: BRAND.ink,
		fontFace: BRAND.fontBody,
		border: {
			type: "solid",
			color: BRAND.line,
			pt: .5
		},
		autoPage: true,
		autoPageRepeatHeader: true
	});
}
async function buildBriefDeck(brief) {
	const pptx = new PptxGenJS();
	pptx.layout = "LAYOUT_16x9";
	pptx.defineSlideMaster({
		title: MASTER,
		background: { color: "FFFFFF" },
		objects: [{ rect: {
			x: 0,
			y: 5.32,
			w: "100%",
			h: .31,
			fill: { color: BRAND.green }
		} }, { text: {
			text: "GoCanvas Internal — Account Brief",
			options: {
				x: .5,
				y: 5.32,
				w: 6,
				h: .3,
				fontSize: 9,
				color: "FFFFFF",
				fontFace: BRAND.fontBody
			}
		} }]
	});
	const title = pptx.addSlide({ masterName: MASTER });
	title.addText("Account Brief", {
		x: .5,
		y: 1.2,
		w: 9,
		h: .6,
		fontSize: 20,
		color: BRAND.slate,
		fontFace: BRAND.fontHead
	});
	title.addText(brief.account_name, {
		x: .5,
		y: 1.7,
		w: 9,
		h: 1,
		fontSize: 40,
		bold: true,
		color: BRAND.green,
		fontFace: BRAND.fontHead
	});
	title.addText(brief.one_liner, {
		x: .5,
		y: 2.9,
		w: 9,
		h: 1.2,
		fontSize: 16,
		color: BRAND.ink,
		fontFace: BRAND.fontBody
	});
	title.addText(`Prepared ${(/* @__PURE__ */ new Date()).toLocaleDateString("en-US", { dateStyle: "long" })}`, {
		x: .5,
		y: 4.4,
		w: 9,
		h: .4,
		fontSize: 12,
		color: BRAND.slate,
		fontFace: BRAND.fontBody
	});
	if (brief.goals.length) addBulletSlide(pptx, "Goals & Why They Bought", brief.goals);
	for (const section of brief.current_process) addBulletSlide(pptx, `Current Process — ${section.title}`, section.bullets);
	if (brief.what_we_know.length) for (const group of chunk(brief.what_we_know, 6)) addTableSlide(pptx, "What We Know Today", ["Topic", "Detail"], group.map((w) => [w.topic, w.detail]));
	if (brief.stakeholders.length) addTableSlide(pptx, "Stakeholders", [
		"Name",
		"Role",
		"Notes"
	], brief.stakeholders.map((s) => [
		s.name,
		s.role,
		s.notes
	]));
	if (brief.risks_open_items.length) addBulletSlide(pptx, "Risks & Open Items", brief.risks_open_items);
	for (const group of chunk(brief.discovery_questions, 5)) addTableSlide(pptx, "Discovery Questions for Onboarding", [
		"Question",
		"Why it matters",
		"Category"
	], group.map((q) => [
		q.question,
		q.why_it_matters,
		q.category
	]));
	if (brief.process_gaps.length) addBulletSlide(pptx, "Process Gaps to Solve", brief.process_gaps);
	return await pptx.write({ outputType: "nodebuffer" });
}
var createAdminClient = () => supabaseAdmin;
async function generateBrief(accountId, createdBy) {
	const admin = createAdminClient();
	await admin.from("portal_briefs").update({
		status: "failed",
		error: "Generation timed out"
	}).eq("account_id", accountId).eq("status", "generating").lt("updated_at", (/* @__PURE__ */ new Date(Date.now() - 6e5)).toISOString());
	const { data: account } = await admin.from("portal_accounts").select("*").eq("id", accountId).maybeSingle();
	if (!account) throw new Error("Account not found");
	const [{ data: reports }, { data: notes }] = await Promise.all([admin.from("portal_gong_reports").select("*").eq("account_id", accountId).order("created_at", { ascending: false }).returns(), admin.from("portal_onboarding_notes").select("*").eq("account_id", accountId).eq("review_status", "reviewed").order("created_at", { ascending: false }).returns()]);
	if (!reports || reports.length === 0) throw new Error("Add at least one Gong report before generating a brief");
	const { data: briefRow, error: insertError } = await admin.from("portal_briefs").insert({
		account_id: accountId,
		status: "generating",
		created_by: createdBy,
		source_report_ids: reports.map((r) => r.id)
	}).select("*").single();
	if (insertError) throw new Error(insertError.message);
	try {
		let json = null;
		let generator = "template";
		let llmError = null;
		if (llmAvailable()) try {
			json = await generateBriefWithLLM(account, reports, notes ?? []);
			if (json) generator = "llm";
			else llmError = "LLM declined or returned unparseable output; used template";
		} catch (e) {
			llmError = e instanceof Error ? e.message : "LLM call failed";
		}
		if (!json) json = buildTemplateBrief(account, reports);
		const deck = await buildBriefDeck(json);
		const path = `${accountId}/${briefRow.id}.pptx`;
		const { error: uploadError } = await admin.storage.from("portal-briefs").upload(path, deck, {
			contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
			upsert: true
		});
		if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);
		const { data: done, error: updateError } = await admin.from("portal_briefs").update({
			status: "complete",
			generator,
			structured_json: json,
			pptx_storage_path: path,
			error: llmError
		}).eq("id", briefRow.id).select("*").single();
		if (updateError) throw new Error(updateError.message);
		await audit({
			actor_type: "user",
			actor_id: createdBy,
			action: "brief.generate",
			entity_type: "brief",
			entity_id: briefRow.id,
			payload: {
				account_id: accountId,
				generator
			}
		});
		return done;
	} catch (e) {
		const message = e instanceof Error ? e.message : "Unknown error";
		await admin.from("portal_briefs").update({
			status: "failed",
			error: message
		}).eq("id", briefRow.id);
		throw e;
	}
}
//#endregion
export { generateBrief };
