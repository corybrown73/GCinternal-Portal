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
