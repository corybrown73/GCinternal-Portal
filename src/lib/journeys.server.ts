import { SignJWT, jwtVerify } from "jose";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail } from "./server/email";
import { audit } from "./server/audit";

const db = () => supabaseAdmin as any;

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

function secret(): Uint8Array {
  const s = process.env.TAM_TOKEN_SECRET;
  if (!s) throw new Error("TAM_TOKEN_SECRET is not set");
  return new TextEncoder().encode(s);
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/* ------------------------------------------------------------------------- */
/* Row shapes (these tables post-date the generated Database types)          */
/* ------------------------------------------------------------------------- */

export interface JourneyRow {
  id: string;
  name: string;
  description: string | null;
  trigger_event: "manual" | "customer_created" | "stage_entered";
  active: boolean;
  created_at: string;
}

export interface JourneyStepRow {
  id: string;
  journey_id: string;
  step_order: number;
  title: string;
  content_item_id: string | null;
  email_subject: string;
  email_body: string;
  advance_on: "viewed" | "delay";
  delay_hours: number | null;
}

export interface ContentItemRow {
  id: string;
  title: string;
  kind: "video" | "doc" | "link";
  url: string;
  description: string | null;
}

export interface EnrollmentRow {
  id: string;
  journey_id: string;
  customer_id: string;
  contact_id: string | null;
  contact_email: string;
  current_step: number;
  status: "active" | "completed" | "paused";
  last_sent_at: string | null;
  created_at: string;
}

/* ------------------------------------------------------------------------- */
/* Tracked links — jose HS256, distinct claim {k:'journey'}                  */
/* ------------------------------------------------------------------------- */

export async function signJourneyToken(enrollmentId: string, stepId: string): Promise<string> {
  return await new SignJWT({ k: "journey", e: enrollmentId, s: stepId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

async function verifyJourneyToken(
  token: string,
): Promise<{ enrollmentId: string; stepId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.k !== "journey" || typeof payload.e !== "string" || typeof payload.s !== "string") {
      return null;
    }
    return { enrollmentId: payload.e, stepId: payload.s };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------- */
/* Sending                                                                   */
/* ------------------------------------------------------------------------- */

/** Best-effort first name: explicit > linked contact's name > email local part. */
async function resolveFirstName(
  enrollment: EnrollmentRow,
  explicit?: string | null,
): Promise<string> {
  if (explicit?.trim()) return explicit.trim().split(/\s+/)[0];
  if (enrollment.contact_id) {
    const { data } = await db()
      .from("customer_contacts")
      .select("name")
      .eq("id", enrollment.contact_id)
      .maybeSingle();
    const name = data?.name?.trim();
    if (name) return name.split(/\s+/)[0];
  }
  const local = enrollment.contact_email.split("@")[0]?.split(/[._+-]/)[0] ?? "";
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "there";
}

function renderTemplate(raw: string, firstName: string, contentUrl: string): string {
  return raw.replaceAll("{{first_name}}", firstName).replaceAll("{{content_url}}", contentUrl);
}

function renderBodyHtml(rawBody: string, firstName: string, contentUrl: string, cta: string): string {
  // Escape first, then swap the (escape-stable) placeholders in as markup.
  const withName = rawBody.replaceAll("{{first_name}}", firstName);
  let html = escapeHtml(withName).replaceAll(
    "{{content_url}}",
    `<a href="${contentUrl}" style="color:#237A4B">${contentUrl}</a>`,
  );
  html = html.replaceAll("\n", "<br/>");
  return `
    <div style="font-family:sans-serif;max-width:540px">
      <p style="font-size:14px;line-height:1.6">${html}</p>
      <div style="margin:24px 0">
        <a href="${contentUrl}" style="background:#237A4B;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(cta)}</a>
      </div>
      <p style="font-size:12px;color:#888">GoCanvas Onboarding</p>
    </div>`;
}

/**
 * Send the NEXT step (step_order = current_step + 1) of an enrollment.
 * If there is no next step, the enrollment is marked completed.
 */
export async function sendStep(
  enrollment: EnrollmentRow,
  opts?: { firstName?: string | null },
): Promise<{ sent: boolean; completed: boolean }> {
  const nextOrder = enrollment.current_step + 1;
  const { data: step } = await db()
    .from("journey_steps")
    .select("*")
    .eq("journey_id", enrollment.journey_id)
    .eq("step_order", nextOrder)
    .maybeSingle();

  if (!step) {
    await db()
      .from("journey_enrollments")
      .update({ status: "completed" })
      .eq("id", enrollment.id);
    return { sent: false, completed: true };
  }

  const token = await signJourneyToken(enrollment.id, step.id);
  const contentUrl = `${appUrl()}/view/${token}`;
  const firstName = await resolveFirstName(enrollment, opts?.firstName);

  const subject = renderTemplate(step.email_subject, firstName, contentUrl);
  const html = renderBodyHtml(step.email_body, firstName, contentUrl, `Open: ${step.title}`);

  await sendEmail({ to: enrollment.contact_email, subject, html });

  await db()
    .from("journey_enrollments")
    .update({ current_step: step.step_order, last_sent_at: new Date().toISOString() })
    .eq("id", enrollment.id);

  await db().from("engagement_events").insert({
    enrollment_id: enrollment.id,
    step_id: step.id,
    contact_email: enrollment.contact_email,
    event: "sent",
    payload: { step_order: step.step_order, subject },
  });

  await audit({
    actor_type: "system",
    action: "journey.step_sent",
    entity_type: "journey_enrollment",
    entity_id: enrollment.id,
    payload: { journey_id: enrollment.journey_id, step_id: step.id, step_order: step.step_order },
  });

  return { sent: true, completed: false };
}

/* ------------------------------------------------------------------------- */
/* Enrollment                                                                */
/* ------------------------------------------------------------------------- */

export async function enrollContact(
  journeyId: string,
  input: {
    customerId: string;
    contactEmail: string;
    contactId?: string | null;
    firstName?: string | null;
  },
): Promise<EnrollmentRow> {
  const email = input.contactEmail.trim().toLowerCase();
  if (!email) throw new Error("Contact email is required");

  const { data: created, error } = await db()
    .from("journey_enrollments")
    .insert({
      journey_id: journeyId,
      customer_id: input.customerId,
      contact_id: input.contactId ?? null,
      contact_email: email,
      current_step: 0,
      status: "active",
    })
    .select("*")
    .single();

  if (error) {
    // unique (journey_id, contact_email, customer_id): already enrolled.
    if (error.code === "23505") {
      const { data: existing } = await db()
        .from("journey_enrollments")
        .select("*")
        .eq("journey_id", journeyId)
        .eq("customer_id", input.customerId)
        .eq("contact_email", email)
        .maybeSingle();
      if (existing) return existing as EnrollmentRow;
    }
    throw new Error(`Could not enroll contact: ${error.message}`);
  }

  const enrollment = created as EnrollmentRow;

  await audit({
    actor_type: "system",
    action: "journey.enrolled",
    entity_type: "journey_enrollment",
    entity_id: enrollment.id,
    payload: { journey_id: journeyId, customer_id: input.customerId, contact_email: email },
  });

  // Kick off immediately with step 1.
  await sendStep(enrollment, { firstName: input.firstName });
  return enrollment;
}

/* ------------------------------------------------------------------------- */
/* View tracking + advance                                                   */
/* ------------------------------------------------------------------------- */

/**
 * Verify a tracked-link token, record the view (deduped), advance the journey
 * when the step advances on 'viewed', and return the real content URL.
 * NEVER throws — falls back to APP_URL so the visitor always lands somewhere.
 */
export async function recordView(token: string): Promise<{ url: string }> {
  const fallback = { url: appUrl() };
  try {
    const claims = await verifyJourneyToken(token);
    if (!claims) return fallback;

    const [{ data: enrollment }, { data: step }] = await Promise.all([
      db().from("journey_enrollments").select("*").eq("id", claims.enrollmentId).maybeSingle(),
      db().from("journey_steps").select("*").eq("id", claims.stepId).maybeSingle(),
    ]);
    if (!enrollment || !step) return fallback;

    const contentUrl = await contentUrlOf(step);

    // Dedupe: a repeat open of the same link must not advance the journey twice.
    const { data: prior } = await db()
      .from("engagement_events")
      .select("id")
      .eq("enrollment_id", enrollment.id)
      .eq("step_id", step.id)
      .eq("event", "viewed")
      .limit(1);

    if ((prior ?? []).length === 0) {
      await db().from("engagement_events").insert({
        enrollment_id: enrollment.id,
        step_id: step.id,
        contact_email: enrollment.contact_email,
        event: "viewed",
        payload: { step_order: step.step_order },
      });

      await audit({
        actor_type: "email_token",
        action: "journey.viewed",
        entity_type: "journey_enrollment",
        entity_id: enrollment.id,
        payload: { step_id: step.id, step_order: step.step_order },
      });

      if (
        step.advance_on === "viewed" &&
        enrollment.status === "active" &&
        enrollment.current_step === step.step_order
      ) {
        await sendStep(enrollment as EnrollmentRow);
      }
    }

    return { url: contentUrl ?? appUrl() };
  } catch (e) {
    console.error("recordView failed", e);
    return fallback;
  }
}

async function contentUrlOf(step: JourneyStepRow): Promise<string | null> {
  if (!step.content_item_id) return null;
  const { data } = await db()
    .from("content_items")
    .select("url")
    .eq("id", step.content_item_id)
    .maybeSingle();
  return data?.url ?? null;
}

/* ------------------------------------------------------------------------- */
/* Cron: delay-based advancement + customer_created auto-enrollment          */
/* ------------------------------------------------------------------------- */

export async function advanceDelayedSteps(): Promise<{ advanced: number; completed: number }> {
  const [{ data: enrollments }, { data: steps }, { data: journeys }] = await Promise.all([
    db().from("journey_enrollments").select("*").eq("status", "active"),
    db().from("journey_steps").select("*"),
    db().from("journeys").select("id, active"),
  ]);

  const activeJourneys = new Set(
    (journeys ?? []).filter((j: any) => j.active).map((j: any) => j.id),
  );
  const stepByJourneyOrder = new Map<string, JourneyStepRow>();
  for (const s of steps ?? []) stepByJourneyOrder.set(`${s.journey_id}:${s.step_order}`, s);

  let advanced = 0;
  let completed = 0;
  const now = Date.now();

  for (const e of (enrollments ?? []) as EnrollmentRow[]) {
    if (!activeJourneys.has(e.journey_id)) continue;
    const next = stepByJourneyOrder.get(`${e.journey_id}:${e.current_step + 1}`);
    if (!next || next.advance_on !== "delay") continue;
    const delayMs = (next.delay_hours ?? 0) * 3600_000;
    const since = e.last_sent_at ?? e.created_at;
    if (!since || now - new Date(since).getTime() < delayMs) continue;
    const result = await sendStep(e);
    if (result.sent) advanced += 1;
    if (result.completed) completed += 1;
  }

  return { advanced, completed };
}

export async function autoEnrollNewCustomers(): Promise<{ enrolled: number }> {
  const { data: journeys } = await db()
    .from("journeys")
    .select("id")
    .eq("trigger_event", "customer_created")
    .eq("active", true);
  if (!journeys || journeys.length === 0) return { enrolled: 0 };

  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: customers } = await db()
    .from("customers")
    .select("id, name, created_at")
    .gte("created_at", dayAgo);
  if (!customers || customers.length === 0) return { enrolled: 0 };

  const customerIds = customers.map((c: any) => c.id);
  const [{ data: contacts }, { data: existing }] = await Promise.all([
    db()
      .from("customer_contacts")
      .select("id, customer_id, name, email, role")
      .in("customer_id", customerIds),
    db()
      .from("journey_enrollments")
      .select("journey_id, customer_id, contact_email")
      .in("customer_id", customerIds),
  ]);

  const already = new Set(
    (existing ?? []).map((e: any) => `${e.journey_id}:${e.customer_id}:${e.contact_email}`),
  );

  let enrolled = 0;
  for (const customer of customers) {
    const own = (contacts ?? []).filter((c: any) => c.customer_id === customer.id && c.email);
    if (own.length === 0) continue;
    // Prefer an explicitly "primary"-ish contact, else the first with an email.
    const primary =
      own.find((c: any) => /primary|champion|main/i.test(c.role ?? "")) ?? own[0];
    for (const journey of journeys) {
      const key = `${journey.id}:${customer.id}:${primary.email.trim().toLowerCase()}`;
      if (already.has(key)) continue;
      try {
        await enrollContact(journey.id, {
          customerId: customer.id,
          contactEmail: primary.email,
          contactId: primary.id,
          firstName: primary.name,
        });
        enrolled += 1;
      } catch (e) {
        // Best effort — the unique constraint guards double-enrollment races.
        console.error(`auto-enroll failed for customer ${customer.id}`, e);
      }
    }
  }
  return { enrolled };
}

/* ------------------------------------------------------------------------- */
/* Admin loaders + editors (called by internal-only server functions)        */
/* ------------------------------------------------------------------------- */

export interface JourneyListRow extends JourneyRow {
  step_count: number;
  enrolled_count: number;
}

export async function loadJourneys(): Promise<JourneyListRow[]> {
  const [{ data: journeys }, { data: steps }, { data: enrollments }] = await Promise.all([
    db().from("journeys").select("*").order("created_at", { ascending: true }),
    db().from("journey_steps").select("id, journey_id"),
    db().from("journey_enrollments").select("id, journey_id"),
  ]);
  return (journeys ?? []).map((j: any) => ({
    ...j,
    step_count: (steps ?? []).filter((s: any) => s.journey_id === j.id).length,
    enrolled_count: (enrollments ?? []).filter((e: any) => e.journey_id === j.id).length,
  }));
}

export interface EnrollmentDetail extends EnrollmentRow {
  customer_name: string;
  contact_name: string | null;
  events: Array<{
    id: string;
    step_id: string | null;
    event: "sent" | "viewed" | "clicked";
    created_at: string;
  }>;
}

export interface JourneyDetail {
  journey: JourneyRow;
  steps: Array<JourneyStepRow & { content_item: ContentItemRow | null }>;
  enrollments: EnrollmentDetail[];
  content_items: ContentItemRow[];
  customers: Array<{
    id: string;
    name: string;
    contacts: Array<{ id: string; name: string; email: string | null }>;
  }>;
}

export async function loadJourneyDetail(journeyId: string): Promise<JourneyDetail> {
  const { data: journey } = await db()
    .from("journeys")
    .select("*")
    .eq("id", journeyId)
    .maybeSingle();
  if (!journey) throw new Error("Journey not found");

  const [
    { data: steps },
    { data: enrollments },
    { data: contentItems },
    { data: customers },
    { data: contacts },
  ] = await Promise.all([
    db().from("journey_steps").select("*").eq("journey_id", journeyId).order("step_order"),
    db()
      .from("journey_enrollments")
      .select("*")
      .eq("journey_id", journeyId)
      .order("created_at", { ascending: false }),
    db().from("content_items").select("id, title, kind, url, description").order("title"),
    db().from("customers").select("id, name").order("name"),
    db().from("customer_contacts").select("id, customer_id, name, email"),
  ]);

  const enrollmentIds = (enrollments ?? []).map((e: any) => e.id);
  const { data: events } = enrollmentIds.length
    ? await db()
        .from("engagement_events")
        .select("id, enrollment_id, step_id, event, created_at")
        .in("enrollment_id", enrollmentIds)
        .order("created_at", { ascending: true })
    : { data: [] };

  const contentById = new Map((contentItems ?? []).map((c: any) => [c.id, c]));
  const customerById = new Map((customers ?? []).map((c: any) => [c.id, c.name]));
  const contactById = new Map((contacts ?? []).map((c: any) => [c.id, c.name]));

  return {
    journey: journey as JourneyRow,
    steps: (steps ?? []).map((s: any) => ({
      ...s,
      content_item: s.content_item_id ? (contentById.get(s.content_item_id) ?? null) : null,
    })),
    enrollments: (enrollments ?? []).map((e: any) => ({
      ...e,
      customer_name: customerById.get(e.customer_id) ?? "Unknown customer",
      contact_name: e.contact_id ? (contactById.get(e.contact_id) ?? null) : null,
      events: (events ?? [])
        .filter((ev: any) => ev.enrollment_id === e.id)
        .map((ev: any) => ({
          id: ev.id,
          step_id: ev.step_id,
          event: ev.event,
          created_at: ev.created_at,
        })),
    })),
    content_items: (contentItems ?? []) as ContentItemRow[],
    customers: (customers ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      contacts: (contacts ?? [])
        .filter((ct: any) => ct.customer_id === c.id)
        .map((ct: any) => ({ id: ct.id, name: ct.name, email: ct.email })),
    })),
  };
}

export async function createJourney(input: {
  name: string;
  description?: string | null;
  trigger_event: "manual" | "customer_created" | "stage_entered";
  createdBy: string;
}): Promise<JourneyRow> {
  const { data, error } = await db()
    .from("journeys")
    .insert({
      name: input.name,
      description: input.description ?? null,
      trigger_event: input.trigger_event,
      active: true,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Could not create journey: ${error.message}`);
  await audit({
    actor_type: "user",
    actor_id: input.createdBy,
    action: "journey.created",
    entity_type: "journey",
    entity_id: data.id,
    payload: { name: input.name },
  });
  return data as JourneyRow;
}

export async function setJourneyActive(journeyId: string, active: boolean, actorId: string) {
  const { error } = await db().from("journeys").update({ active }).eq("id", journeyId);
  if (error) throw new Error(error.message);
  await audit({
    actor_type: "user",
    actor_id: actorId,
    action: active ? "journey.activated" : "journey.paused",
    entity_type: "journey",
    entity_id: journeyId,
  });
}

export interface StepPatch {
  title: string;
  content_item_id: string | null;
  email_subject: string;
  email_body: string;
  advance_on: "viewed" | "delay";
  delay_hours: number | null;
}

export async function saveJourneyStep(
  journeyId: string,
  stepId: string | null,
  patch: StepPatch,
  actorId: string,
): Promise<JourneyStepRow> {
  if (patch.advance_on === "delay" && (!patch.delay_hours || patch.delay_hours <= 0)) {
    throw new Error("A delay step needs delay_hours greater than zero");
  }
  if (stepId) {
    const { data, error } = await db()
      .from("journey_steps")
      .update({ ...patch })
      .eq("id", stepId)
      .eq("journey_id", journeyId)
      .select("*")
      .single();
    if (error) throw new Error(`Could not update step: ${error.message}`);
    await audit({
      actor_type: "user",
      actor_id: actorId,
      action: "journey.step_updated",
      entity_type: "journey_step",
      entity_id: stepId,
    });
    return data as JourneyStepRow;
  }
  const { data: last } = await db()
    .from("journey_steps")
    .select("step_order")
    .eq("journey_id", journeyId)
    .order("step_order", { ascending: false })
    .limit(1);
  const nextOrder = ((last ?? [])[0]?.step_order ?? 0) + 1;
  const { data, error } = await db()
    .from("journey_steps")
    .insert({ journey_id: journeyId, step_order: nextOrder, ...patch })
    .select("*")
    .single();
  if (error) throw new Error(`Could not add step: ${error.message}`);
  await audit({
    actor_type: "user",
    actor_id: actorId,
    action: "journey.step_added",
    entity_type: "journey_step",
    entity_id: data.id,
    payload: { journey_id: journeyId, step_order: nextOrder },
  });
  return data as JourneyStepRow;
}

export async function deleteJourneyStep(journeyId: string, stepId: string, actorId: string) {
  const { error } = await db()
    .from("journey_steps")
    .delete()
    .eq("id", stepId)
    .eq("journey_id", journeyId);
  if (error) throw new Error(error.message);

  // Close the ordering gap so step_order stays 1..n.
  const { data: rest } = await db()
    .from("journey_steps")
    .select("id, step_order")
    .eq("journey_id", journeyId)
    .order("step_order");
  let order = 1;
  for (const s of rest ?? []) {
    if (s.step_order !== order) {
      await db().from("journey_steps").update({ step_order: order }).eq("id", s.id);
    }
    order += 1;
  }
  await audit({
    actor_type: "user",
    actor_id: actorId,
    action: "journey.step_deleted",
    entity_type: "journey_step",
    entity_id: stepId,
    payload: { journey_id: journeyId },
  });
}

export async function createContentItem(input: {
  title: string;
  kind: "video" | "doc" | "link";
  url: string;
  description?: string | null;
  createdBy: string;
}): Promise<ContentItemRow> {
  const { data, error } = await db()
    .from("content_items")
    .insert({
      title: input.title,
      kind: input.kind,
      url: input.url,
      description: input.description ?? null,
      created_by: input.createdBy,
    })
    .select("id, title, kind, url, description")
    .single();
  if (error) throw new Error(`Could not create content item: ${error.message}`);
  return data as ContentItemRow;
}

/* ------------------------------------------------------------------------- */
/* Seed: "New Logo Welcome"                                                  */
/* ------------------------------------------------------------------------- */

/** Idempotent: only seeds when ZERO journeys exist. */
export async function ensureDefaultJourney(): Promise<void> {
  const { count } = await db()
    .from("journeys")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return;

  const { data: content, error: contentError } = await db()
    .from("content_items")
    .insert({
      title: "Welcome to GoCanvas",
      kind: "video",
      url: "https://www.gocanvas.com/welcome",
      description: "Placeholder welcome video for new customers.",
    })
    .select("id")
    .single();
  if (contentError) throw new Error(`Seed failed: ${contentError.message}`);

  const { data: journey, error: journeyError } = await db()
    .from("journeys")
    .insert({
      name: "New Logo Welcome",
      description: "Automated welcome + training sequence for newly signed customers.",
      trigger_event: "customer_created",
      active: true,
    })
    .select("id")
    .single();
  if (journeyError) throw new Error(`Seed failed: ${journeyError.message}`);

  const { error: stepsError } = await db().from("journey_steps").insert([
    {
      journey_id: journey.id,
      step_order: 1,
      title: "Welcome to GoCanvas",
      content_item_id: content.id,
      email_subject: "Welcome to GoCanvas, {{first_name}}!",
      email_body:
        "Hi {{first_name}},\n\nWelcome aboard! We put together a short welcome video that shows what your first weeks with GoCanvas will look like.\n\nWatch it here: {{content_url}}\n\nYour onboarding team",
      advance_on: "viewed",
      delay_hours: null,
    },
    {
      journey_id: journey.id,
      step_order: 2,
      title: "Level 1 training",
      content_item_id: content.id,
      email_subject: "Thanks for watching — here's Level 1 training",
      email_body:
        "Hi {{first_name}},\n\nGreat — you watched the welcome video. The next step is Level 1 training: the basics of building and dispatching your first form.\n\nStart here: {{content_url}}\n\nYour onboarding team",
      advance_on: "viewed",
      delay_hours: null,
    },
    {
      journey_id: journey.id,
      step_order: 3,
      title: "Level 2 training",
      content_item_id: content.id,
      email_subject: "Ready for Level 2, {{first_name}}?",
      email_body:
        "Hi {{first_name}},\n\nYou're making great progress. Level 2 training covers workflows, integrations and reporting.\n\nContinue here: {{content_url}}\n\nYour onboarding team",
      advance_on: "delay",
      delay_hours: 48,
    },
  ]);
  if (stepsError) throw new Error(`Seed failed: ${stepsError.message}`);
}
