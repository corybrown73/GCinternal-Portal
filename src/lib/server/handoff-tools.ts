import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { deckKindFor } from "@/lib/deck-kind";
import { TEMPLATE_FIELDS } from "@/lib/kickoff-fields";

const db = () => supabaseAdmin as any;

/**
 * What the MCP tools actually do, once the protocol is out of the way.
 *
 * The deck rendering deliberately goes through the SAME field map and renderer
 * the in-app path uses. A second way to build the deck would be a second thing
 * to keep in step with the template, and the first one to fall behind is
 * always the one nobody is looking at.
 */

export async function findDeals(query: string) {
  const { data } = await db()
    .from("portal_accounts")
    .select("id,name,stage,domain,arr,customer_id,created_at")
    .ilike("name", `%${query}%`)
    .order("created_at", { ascending: false })
    .limit(10);

  const rows = (data ?? []) as Array<Record<string, any>>;
  if (rows.length === 0) {
    return {
      matches: [],
      note: `No deal matches "${query}". Try a shorter fragment — the search is a substring of the company name.`,
    };
  }

  return {
    matches: rows.map((r) => ({
      dealId: r["id"],
      name: r["name"],
      stage: r["stage"],
      domain: r["domain"] ?? null,
      arr: r["arr"] ?? null,
      handedOff: Boolean(r["customer_id"]),
      createdAt: r["created_at"],
    })),
  };
}

/**
 * Render the deck from a model's field values and file it against the account.
 *
 * TWO THINGS THIS REFUSES TO DO. It will not accept a field the template does
 * not have — a typo'd name would silently render nothing, and the model would
 * believe it had filled a slide. And it will not file the deck against a deal
 * with no customer record, because there is no account for it to land in;
 * the error says to start onboarding first rather than putting the file
 * somewhere arbitrary.
 */
export async function generateDeckFromMcp(args: {
  dealId: string;
  fields: Record<string, unknown>;
  note: string | null;
}) {
  const { data: deal } = await db()
    .from("portal_accounts")
    .select("*")
    .eq("id", args.dealId)
    .maybeSingle();
  if (!deal) throw new Error(`No deal with id ${args.dealId}`);

  const known = new Set(TEMPLATE_FIELDS);
  const supplied: Record<string, string> = {};
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(args.fields)) {
    if (!known.has(key)) {
      rejected.push(key);
      continue;
    }
    const v = typeof value === "string" ? value.trim() : String(value ?? "").trim();
    if (v) supplied[key] = v;
  }
  if (rejected.length) {
    throw new Error(
      `These are not fields in the template: ${rejected.join(", ")}. Call describe_deck_fields for the real names — a misspelled field renders nothing and looks like it worked.`,
    );
  }

  // The portal's own knowledge first, then the model's on top of what is left.
  // Records still win: a requirement somebody typed beats one inferred from a
  // transcript, and that ordering lives in buildKickoffData.
  const { loadHandoffContext } = await import("./handoff-context");
  const context = await loadHandoffContext(args.dealId);
  if (!context) throw new Error(`No deal with id ${args.dealId}`);

  const decision = deckKindFor({
    journeyKey: context.project?.journeyType ?? null,
    priorImplementations: context.priorImplementations,
    products: context.deal.products,
  });

  const { buildKickoffData } = await import("@/lib/kickoff-fields");
  const base = buildKickoffData({
    clientName: context.deal.name,
    preparedAt: new Date().toISOString(),
    brief: emptyBrief(context.deal.name),
    team: teamFrom(context),
    clientPeople: [],
    stages: (context.project?.stages ?? []).map((s) => ({
      name: s.name,
      intent: null,
      targetDays: s.targetDays,
      startsOn: null,
    })),
    customerTasks: (context.project?.openCustomerTasks ?? []).map((t) => ({
      title: t.title,
      stage: t.stage,
      owner: null,
      due: t.due,
    })),
    risks: context.project?.openRisks ?? [],
    successCriteria: context.project?.successCriteria ?? [],
    requirements: context.project?.requirements ?? [],
    solutions: context.project?.solutions ?? [],
    targetLaunchDate: context.project?.targetLaunchDate ?? null,
    itContact: null,
  });

  // The model's values fill what the portal could not, and are recorded as
  // model-supplied so the presenter knows which lines came from a reading of a
  // transcript rather than from a record.
  const fromModel: string[] = [];
  for (const [key, value] of Object.entries(supplied)) {
    if (key in base.fields) continue;
    base.fields[key] = value;
    fromModel.push(key);
  }
  // `base.missing` is already the reportable set — it excludes the fields the
  // renderer draws statically or simply omits when empty. Anything the model
  // has now filled comes off it.
  const missing = base.missing.filter((k) => !(k in base.fields));

  const deckData = {
    ...base,
    missing,
    fromCalls: [...base.fromCalls, ...fromModel].sort(
      (a, b) => TEMPLATE_FIELDS.indexOf(a) - TEMPLATE_FIELDS.indexOf(b),
    ),
  };

  const { buildKickoffDeckFile } = await import("./brief/pptx");
  const deck = await buildKickoffDeckFile(deckData, await clientLogo(deal));

  const implementationId = await implementationFor(deal.customer_id as string | null);
  if (!implementationId) {
    throw new Error(
      "This deal has no project yet, so there is no account for the deck to be filed against. Start onboarding from the deal first, then generate the deck.",
    );
  }

  const { addAccountUpload } = await import("@/lib/attachments.server");
  const title = `Client kickoff — ${context.deal.name}`;
  await addAccountUpload({
    implementationId,
    title,
    kind: "deck",
    fileName: `${safeName(context.deal.name)}-client-kickoff.pptx`,
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    dataBase64: Buffer.from(deck).toString("base64"),
    actorProfileId: null,
  });

  const { audit } = await import("./audit");
  await audit({
    actor_type: "system",
    actor_id: null,
    action: "deck.generated",
    entity_type: "implementation",
    entity_id: implementationId,
    payload: {
      deal_id: args.dealId,
      deck_kind: decision.kind,
      fields_from_model: fromModel.length,
      note: args.note,
    },
  });

  return {
    filed: true,
    title,
    account: `Filed in the account's Attachments. Open the project and look under Attachments.`,
    deckKind: decision.kind,
    deckKindReason: decision.reason,
    fieldsFromYou: fromModel.length,
    fieldsFromTheRecord: Object.keys(base.fields).length - fromModel.length,
    stillBlank: missing,
    note: missing.length
      ? "The blank fields render as visible placeholders on the slides, and are listed in slide one's speaker notes for the presenter."
      : "Every field the template asks for is filled.",
  };
}

function teamFrom(
  context: NonNullable<Awaited<ReturnType<typeof import("./handoff-context").loadHandoffContext>>>,
) {
  const team: Array<{ name: string; role: string }> = [];
  if (context.project?.lead) {
    team.push({
      name: context.project.lead,
      role: "Implementation Lead · Your main point of contact",
    });
  }
  if (context.deal.seOwner) {
    team.push({
      name: context.deal.seOwner,
      role: "Solutions Consultant · Form and workflow build",
    });
  }
  if (context.deal.amOwner) {
    team.push({
      name: context.deal.amOwner,
      role: "Customer Success Manager · Your long-term partner",
    });
  }
  return team;
}

/** The deck builder wants a brief; over MCP the model IS the brief. */
function emptyBrief(name: string) {
  return {
    account_name: name,
    one_liner: "",
    current_process: [],
    goals: [],
    what_we_know: [],
    stakeholders: [],
    risks_open_items: [],
    discovery_questions: [],
    process_gaps: [],
    kickoff: {
      day_90_definition: null,
      scope: [],
      out_of_scope: null,
      integrations: [],
      roles: [],
      licensed_seats: null,
      renewal_date: null,
      it_contact: null,
      training: [],
      kpi_qualifiers: [],
      next_meeting: null,
    },
    expansion: {
      integration_target: null,
      form_already_built: null,
      historical_data: null,
      current_process: null,
      time_saved: null,
      data_flows: [],
      environment_notes: [],
      blockers: [],
    },
  };
}

async function implementationFor(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await db()
    .from("implementations")
    .select("id")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function clientLogo(deal: Record<string, any>): Promise<string | null> {
  const path = deal["logo_path"] as string | null | undefined;
  if (!path) return null;
  try {
    const { data, error } = await db().storage.from("customer-branding").download(path);
    if (error || !data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    if (buf.byteLength > 2_000_000) return null;
    const ext = path.split(".").pop()?.toLowerCase();
    const mime =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "webp"
          ? "image/webp"
          : ext === "gif"
            ? "image/gif"
            : "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function safeName(s: string): string {
  return (
    s
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "account"
  );
}

/* ------------------------------------------------------- intake, pre-deck */

/** Stages a deal may sit in, from `portal_account_stage`. */
const DEAL_STAGES = [
  "prospect",
  "closed_won",
  "onboarding_kickoff",
  "in_onboarding",
  "onboarding_complete",
] as const;

/**
 * Create a pre-sale deal and say what to ask next.
 *
 * WHY IT RETURNS THE QUESTIONS. A deal one second old has nothing in it, so a
 * deck generated from it would be entirely placeholders. Handing back the
 * intake brief with the id turns "created, now what" into a conversation the
 * model can actually run — and it is the same brief the portal shows, not a
 * second copy that drifts.
 *
 * WHY IT REFUSES A DUPLICATE NAME. Two deals with one company's name is how a
 * transcript ends up filed against the wrong one, and nothing downstream can
 * detect that. The caller is pointed at the existing deal instead.
 */
export async function createDeal(args: {
  name: string;
  domain?: string | null;
  stage?: string | null;
  primaryContactName?: string | null;
  primaryContactEmail?: string | null;
  primaryContactRole?: string | null;
  summary?: string | null;
}) {
  const name = args.name.trim();
  if (!name) throw new Error("A deal needs a company name");

  const stage = (args.stage ?? "prospect").trim();
  if (!(DEAL_STAGES as readonly string[]).includes(stage)) {
    throw new Error(`Stage must be one of: ${DEAL_STAGES.join(", ")}`);
  }

  const { data: clash } = await db()
    .from("portal_accounts")
    .select("id,name,stage")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (clash) {
    throw new Error(
      `"${clash["name"]}" already exists (deal id ${clash["id"]}, stage ${clash["stage"]}). ` +
        "Add to that one rather than creating a second — a transcript filed against a duplicate is invisible on the real deal.",
    );
  }

  const { data: created, error } = await db()
    .from("portal_accounts")
    .insert({
      name,
      stage,
      domain: clean(args.domain),
      primary_contact_name: clean(args.primaryContactName),
      primary_contact_email: clean(args.primaryContactEmail),
      primary_contact_role: clean(args.primaryContactRole),
      summary: clean(args.summary),
    })
    .select("id,name,stage")
    .maybeSingle();
  if (error || !created) {
    throw new Error(`Could not create the deal: ${error?.message ?? "no row came back"}`);
  }

  const { audit } = await import("./audit");
  await audit({
    actor_type: "system",
    actor_id: null,
    action: "deal.created",
    entity_type: "portal_account",
    entity_id: created["id"],
    payload: { name, stage, via: "mcp" },
  });

  const { intakeBrief } = await import("@/lib/intake");
  return {
    dealId: created["id"],
    name: created["name"],
    stage: created["stage"],
    nextStep:
      "Ask the intake questions below, then record the answers with add_call_notes (the transcript, verbatim) " +
      "and update_deal (the SOW and commercial facts). Generate the deck last.",
    intake: intakeBrief(),
  };
}

/**
 * File a call transcript against a deal.
 *
 * VERBATIM, DELIBERATELY. `get_handoff_context` hands these back unsummarised
 * because the sentence where a customer says what they actually want is the
 * one a summary drops. Storing a summary here would lose it a step earlier and
 * no later stage could recover it.
 */
export async function addCallNotes(args: {
  dealId: string;
  title: string;
  markdown: string;
  kind?: string | null;
}) {
  const title = args.title.trim();
  const markdown = args.markdown.trim();
  if (!title) throw new Error("Give the notes a title — 'Discovery call, 12 March' beats 'Notes'");
  if (!markdown) throw new Error("There is no transcript to file");

  const kind = (args.kind ?? "call_notes").trim();
  if (kind !== "call_notes" && kind !== "account_map") {
    throw new Error("kind must be 'call_notes' or 'account_map'");
  }

  const deal = await dealOrThrow(args.dealId);

  const { error } = await db().from("portal_gong_reports").insert({
    account_id: deal["id"],
    title,
    content_md: markdown,
    report_type: kind,
  });
  if (error) throw new Error(`Could not file the notes: ${error.message}`);

  const { audit } = await import("./audit");
  await audit({
    actor_type: "system",
    actor_id: null,
    action: "gong_report.uploaded",
    entity_type: "portal_account",
    entity_id: deal["id"],
    payload: { title, kind, characters: markdown.length, via: "mcp" },
  });

  return {
    filed: true,
    dealId: deal["id"],
    title,
    kind,
    characters: markdown.length,
    note: "Stored verbatim. get_handoff_context will hand it back unsummarised.",
  };
}

/** The deal fields this tool is allowed to set, and the column each writes to. */
const UPDATABLE: Record<string, string> = {
  domain: "domain",
  summary: "summary",
  primaryContactName: "primary_contact_name",
  primaryContactEmail: "primary_contact_email",
  primaryContactRole: "primary_contact_role",
  sowReference: "sow_reference",
  sowSignedDate: "sow_signed_date",
  sowValue: "sow_value",
  sowDocumentUrl: "sow_document_url",
  sowDocumentName: "sow_document_name",
  arr: "arr",
  products: "products",
};

/**
 * Record the facts about a deal that are looked up rather than discussed.
 *
 * WHAT IT WILL NOT TOUCH. Not `stage` — advancing a deal has consequences
 * elsewhere and belongs to the app, not to a model reading a transcript. Not
 * `customer_id` — that is what handoff sets, and setting it here would fake a
 * handoff that never happened. Not the owners, which resolve to real people.
 *
 * THE SOW DOCUMENT ITSELF CANNOT COME THROUGH HERE. An MCP tool call carries
 * text, not file bytes, so the PDF is uploaded in the portal and this records
 * what is known about it. `sowDocumentUrl` is a link to a file living
 * somewhere else; it is not the uploaded copy, and the two are kept apart
 * precisely so nobody mistakes one for the other.
 */
export async function updateDeal(args: { dealId: string; fields: Record<string, unknown> }) {
  const deal = await dealOrThrow(args.dealId);

  const patch: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(args.fields)) {
    const column = UPDATABLE[key];
    if (!column) {
      rejected.push(key);
      continue;
    }
    patch[column] = coerceField(key, value);
  }
  if (rejected.length) {
    throw new Error(
      `Not updatable here: ${rejected.join(", ")}. Allowed: ${Object.keys(UPDATABLE).join(", ")}. ` +
        "Stage, owners and handoff are the app's to change, not a transcript reader's.",
    );
  }
  if (Object.keys(patch).length === 0) throw new Error("No fields to update");

  const { error } = await db().from("portal_accounts").update(patch).eq("id", deal["id"]);
  if (error) throw new Error(`Could not update the deal: ${error.message}`);

  const { audit } = await import("./audit");
  await audit({
    actor_type: "system",
    actor_id: null,
    action: "deal.updated",
    entity_type: "portal_account",
    entity_id: deal["id"],
    payload: { columns: Object.keys(patch), via: "mcp" },
  });

  return { updated: Object.keys(patch), dealId: deal["id"] };
}

function coerceField(key: string, value: unknown): unknown {
  if (value === null || value === undefined || value === "") return null;

  if (key === "arr" || key === "sowValue") {
    // Money arrives as "$48,000" as often as 48000, so the symbols come out
    // first. But stripping them from "about forty grand" leaves an empty
    // string, and Number("") is 0 — which would record a real customer's
    // contract as free rather than refusing the sentence. Hence the digit
    // check before the conversion.
    let n: number;
    if (typeof value === "number") {
      n = value;
    } else {
      const raw = String(value);
      const stripped = raw.replace(/[^0-9.-]/g, "");
      if (!/[0-9]/.test(stripped)) {
        throw new Error(`${key} must be a number, got "${raw}"`);
      }
      n = Number(stripped);
    }
    if (!Number.isFinite(n)) throw new Error(`${key} must be a number, got "${String(value)}"`);
    if (n < 0) throw new Error(`${key} cannot be negative`);
    return n;
  }

  if (key === "sowSignedDate") {
    const s = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("sowSignedDate must be YYYY-MM-DD");
    // The column has a CHECK that refuses a future date; failing here says why.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (s > tomorrow)
      throw new Error("sowSignedDate is in the future — a SOW is signed, or it is not");
    return s;
  }

  if (key === "products") {
    if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
    return String(value)
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  return String(value).trim();
}

async function dealOrThrow(dealId: string): Promise<Record<string, any>> {
  const id = dealId.trim();
  if (!id) throw new Error("Pass the deal's id — use find_deal or create_deal to get one");
  const { data } = await db().from("portal_accounts").select("id,name").eq("id", id).maybeSingle();
  if (!data) throw new Error(`No deal with id ${id}`);
  return data as Record<string, any>;
}

function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
