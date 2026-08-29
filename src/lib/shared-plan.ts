import { createHash } from "node:crypto";

/**
 * The customer-facing projection. Pure: no I/O, no Supabase, no request.
 *
 * This module is the whole safety argument of the external portal. Every door
 * — the signed link, the authenticated /portal page, the internal preview and
 * the weekly snapshot generator — renders through `buildSharedPlanDTO` and
 * nothing else. There is deliberately no second serializer, because a second
 * serializer is how a field that is internal in one place becomes visible in
 * another.
 *
 * Two rules it exists to enforce:
 *
 *  1. **Allowlist, never denylist.** Every field on the wire is named here. A
 *     column added to `implementations` or `work_items` tomorrow cannot appear
 *     on a customer's screen by accident, because nothing copies rows through.
 *  2. **No uuids leave the building.** Not the implementation's, not a work
 *     item's, not a contact's. A task is addressed by an opaque `ref` derived
 *     from its id; the server resolves a ref only within the viewer's own
 *     implementation, so a ref from somewhere else resolves to nothing.
 *
 * Never rendered, in any door: internal-visibility work items, the journal,
 * internal comments, risks, issues, escalations, health (recorded or
 * computed), engagement telemetry, ARR, segment, SOW value or document,
 * tier, discovery material.
 */

/** Every key `buildSharedPlanDTO` may emit at the top level. Frozen; tested. */
export const SHARED_PLAN_KEYS = [
  "customer_name",
  "implementation_name",
  "stage_label",
  "stage_intent",
  "target_launch_date",
  "your_tasks",
  "our_commitments",
  "milestones",
  "documents",
  "contact",
  "viewer",
  "generated_at",
] as const;

export const SHARED_TASK_KEYS = [
  "ref",
  "title",
  "detail",
  "status",
  "due_date",
  "bucket",
  "owner",
  "can_complete",
  "blocked_by",
  "completed_by",
  "completed_at",
  "comments",
  "files",
] as const;

export const SHARED_MILESTONE_KEYS = ["name", "status", "target_date", "completed_date"] as const;

export const SHARED_COMMITMENT_KEYS = ["description", "due_date", "committed_to", "done"] as const;

export const SHARED_DOCUMENT_KEYS = ["ref", "file_name", "size_bytes", "uploaded_at"] as const;

export const SHARED_CONTACT_KEYS = ["name", "email"] as const;

export const SHARED_VIEWER_KEYS = ["kind", "can_complete", "read_only"] as const;

export const SNAPSHOT_KEYS = [
  "plan",
  "week_start",
  "moved",
  "attention",
  "we_owe",
  "you_owe",
  "next_milestone",
  "contact",
] as const;

export type SharedTaskBucket = "overdue" | "due_today" | "this_week" | "later" | "done";

export type SharedComment = {
  author: string;
  body: string;
  at: string;
};

export type SharedDocument = {
  ref: string;
  file_name: string;
  size_bytes: number;
  uploaded_at: string;
};

export type SharedTask = {
  /** Opaque, stable, NOT a uuid. See `taskRef`. */
  ref: string;
  title: string;
  detail: string | null;
  status: "open" | "done";
  due_date: string | null;
  bucket: SharedTaskBucket;
  /** Whose court the ball is in, in the customer's own words. */
  owner: "you" | "us";
  can_complete: boolean;
  /** Titles of the outstanding predecessors — never their ids. */
  blocked_by: string[];
  completed_by: string | null;
  completed_at: string | null;
  comments: SharedComment[];
  files: SharedDocument[];
};

export type SharedMilestone = {
  name: string;
  status: string;
  target_date: string | null;
  completed_date: string | null;
};

export type SharedCommitment = {
  description: string;
  due_date: string | null;
  committed_to: string | null;
  done: boolean;
};

export type SharedContact = { name: string; email: string | null };

export type SharedViewer = {
  kind: "grant" | "auth" | "preview";
  can_complete: boolean;
  /** True for the internal preview: staff see the page, never act through it. */
  read_only: boolean;
};

export type SharedPlan = {
  customer_name: string;
  implementation_name: string;
  stage_label: string;
  stage_intent: string | null;
  target_launch_date: string | null;
  your_tasks: SharedTask[];
  our_commitments: SharedCommitment[];
  milestones: SharedMilestone[];
  documents: SharedDocument[];
  contact: SharedContact | null;
  viewer: SharedViewer;
  generated_at: string;
};

/* ------------------------------------------------------------------------- */
/* Inputs — raw rows, named explicitly so nothing can be spread in wholesale  */
/* ------------------------------------------------------------------------- */

export type SharedPlanInputs = {
  /**
   * `logo_path` is accepted but deliberately NOT projected yet: the branding
   * bucket is private (0019), so rendering it means minting a short-lived
   * signed URL per request, which is its own piece of work. Until then the
   * page carries GoCanvas branding only.
   */
  customer: { name: string; logo_path?: string | null };
  implementation: {
    name: string;
    current_stage: string;
    target_launch_date: string | null;
  };
  stage: { label: string; intent: string | null };
  workItems: Array<{
    id: string;
    title: string;
    description: string | null;
    party: string;
    visibility: string;
    status: string;
    due_at: string | null;
    depends_on?: string[] | null;
    completed_at?: string | null;
    completed_by_name?: string | null;
    position?: number | null;
  }>;
  /** Title lookup for dependency display, including internal items. */
  /**
   * Dependency lookup, including internal items — carried so that being
   * blocked can be COMPUTED honestly. `visibility` is what stops an internal
   * item's title being rendered while it is doing so.
   */
  titlesById: Record<string, { title: string; status: string; visibility: string }>;
  milestones: Array<{
    name: string;
    status: string;
    target_date: string | null;
    completed_date: string | null;
  }>;
  commitments: Array<{
    description: string;
    due_date: string | null;
    committed_to: string | null;
    fulfilled_at: string | null;
  }>;
  comments: Array<{ work_item_id: string; author: string; body: string; created_at: string }>;
  files: Array<{
    id: string;
    work_item_id: string | null;
    file_name: string;
    size_bytes: number;
    created_at: string;
  }>;
  contact: SharedContact | null;
  viewer: SharedViewer;
  now?: Date;
};

/**
 * An opaque handle for a row.
 *
 * Plain sha256 of the id, truncated: it is an identifier, not a credential, so
 * it needs no secret. What it buys is that no uuid ever appears in a payload,
 * a URL or a log — and that a ref only ever resolves inside the implementation
 * the viewer is scoped to, because the server recomputes refs for that
 * implementation's rows and matches, rather than parsing anything the client
 * sent.
 */
export function taskRef(id: string): string {
  return createHash("sha256").update(`wi:${id}`).digest("hex").slice(0, 16);
}

export function fileRef(id: string): string {
  return createHash("sha256").update(`wf:${id}`).digest("hex").slice(0, 16);
}

function dayKey(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function bucketFor(
  dueAt: string | null,
  done: boolean,
  now: Date = new Date(),
): SharedTaskBucket {
  if (done) return "done";
  if (!dueAt) return "later";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "later";
  const today = dayKey(now);
  const dueDay = dayKey(due);
  if (dueDay < today) return "overdue";
  if (dueDay === today) return "due_today";
  const weekOut = new Date(now);
  weekOut.setDate(weekOut.getDate() + 7);
  return dueDay <= dayKey(weekOut) ? "this_week" : "later";
}

const BUCKET_ORDER: Record<SharedTaskBucket, number> = {
  overdue: 0,
  due_today: 1,
  this_week: 2,
  later: 3,
  done: 4,
};

const CLOSED_STATUSES = new Set(["done", "skipped"]);

/**
 * The one serializer. Takes rows, returns exactly the allowlisted shape.
 *
 * Callers pass rows they have already scoped; this function additionally drops
 * anything not marked `visibility = 'shared'`, so a scoping mistake upstream
 * still cannot render an internal task.
 */
export function buildSharedPlanDTO(inputs: SharedPlanInputs): SharedPlan {
  const now = inputs.now ?? new Date();

  const commentsByItem = new Map<string, SharedComment[]>();
  for (const c of inputs.comments) {
    const list = commentsByItem.get(c.work_item_id) ?? [];
    list.push({ author: c.author, body: c.body, at: c.created_at });
    commentsByItem.set(c.work_item_id, list);
  }

  const filesByItem = new Map<string, SharedDocument[]>();
  const allDocuments: SharedDocument[] = [];
  for (const f of inputs.files) {
    const doc: SharedDocument = {
      ref: fileRef(f.id),
      file_name: f.file_name,
      size_bytes: f.size_bytes,
      uploaded_at: f.created_at,
    };
    allDocuments.push(doc);
    if (f.work_item_id) {
      const list = filesByItem.get(f.work_item_id) ?? [];
      list.push(doc);
      filesByItem.set(f.work_item_id, list);
    }
  }

  const shared = inputs.workItems.filter((w) => w.visibility === "shared");

  const your_tasks: SharedTask[] = shared
    .map((w) => {
      const done = CLOSED_STATUSES.has(w.status);
      // Outstanding predecessors, computed — never read off a status column.
      const openDeps = (w.depends_on ?? [])
        .map((id) => inputs.titlesById[id])
        .filter(
          (d): d is { title: string; status: string; visibility: string } =>
            !!d && !CLOSED_STATUSES.has(d.status),
        );
      // A customer may see WHAT of their own work blocks a task, and THAT
      // internal work does — never the internal task's title, which is written
      // for us and routinely says things like "escalate, they are a flight
      // risk". Blockedness is still computed from all of them.
      const blocked_by = [
        ...openDeps.filter((d) => d.visibility === "shared").map((d) => d.title),
        ...(openDeps.some((d) => d.visibility !== "shared") ? ["Work on the GoCanvas side"] : []),
      ];
      return {
        ref: taskRef(w.id),
        title: w.title,
        detail: w.description ?? null,
        status: done ? ("done" as const) : ("open" as const),
        due_date: w.due_at ? dayKey(w.due_at) : null,
        bucket: bucketFor(w.due_at, done, now),
        owner: w.party === "customer" ? ("you" as const) : ("us" as const),
        // Only the customer's own open tasks are ever actionable from outside,
        // and only when the viewer's grant allows it and nothing blocks it.
        can_complete:
          inputs.viewer.can_complete &&
          !inputs.viewer.read_only &&
          w.party === "customer" &&
          !done &&
          openDeps.length === 0,
        blocked_by,
        completed_by: w.completed_by_name ?? null,
        completed_at: w.completed_at ?? null,
        comments: commentsByItem.get(w.id) ?? [],
        files: filesByItem.get(w.id) ?? [],
      };
    })
    .sort((a, b) => {
      const byBucket = BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket];
      if (byBucket !== 0) return byBucket;
      if (a.due_date && b.due_date && a.due_date !== b.due_date) {
        return a.due_date < b.due_date ? -1 : 1;
      }
      return a.title.localeCompare(b.title);
    });

  return {
    customer_name: inputs.customer.name,
    implementation_name: inputs.implementation.name,
    stage_label: inputs.stage.label,
    stage_intent: inputs.stage.intent,
    target_launch_date: inputs.implementation.target_launch_date,
    your_tasks,
    our_commitments: inputs.commitments.map((c) => ({
      description: c.description,
      due_date: c.due_date,
      committed_to: c.committed_to,
      done: !!c.fulfilled_at,
    })),
    milestones: inputs.milestones.map((m) => ({
      name: m.name,
      status: m.status,
      target_date: m.target_date,
      completed_date: m.completed_date,
    })),
    documents: allDocuments,
    contact: inputs.contact ? { name: inputs.contact.name, email: inputs.contact.email } : null,
    viewer: {
      kind: inputs.viewer.kind,
      can_complete: inputs.viewer.can_complete,
      read_only: inputs.viewer.read_only,
    },
    generated_at: now.toISOString(),
  };
}

/* ------------------------------------------------------------------------- */
/* Snapshot delta                                                            */
/* ------------------------------------------------------------------------- */

export type SharedPlanSnapshot = {
  plan: SharedPlan;
  week_start: string;
  /** Milestone dates that moved since the previous snapshot. Both dates shown. */
  moved: Array<{ name: string; was: string | null; now: string | null }>;
  /**
   * Customer-OBSERVABLE facts only.
   *
   * This section is deliberately not called "at risk". Internal risk, issue,
   * escalation and health records are never customer-visible — not here, not
   * anywhere — so this can only ever contain things the customer can already
   * see for themselves: their own overdue tasks, a milestone date that moved,
   * a commitment past its due date. Facts, never judgements.
   */
  attention: string[];
  we_owe: SharedCommitment[];
  you_owe: SharedTask[];
  next_milestone: SharedMilestone | null;
  contact: SharedContact | null;
};

export function buildSnapshotDTO(
  plan: SharedPlan,
  weekStart: string,
  previous: SharedPlan | null,
  now: Date = new Date(),
): SharedPlanSnapshot {
  const prevMilestones = new Map((previous?.milestones ?? []).map((m) => [m.name, m]));
  const moved = plan.milestones
    .filter((m) => {
      const before = prevMilestones.get(m.name);
      return !!before && before.target_date !== m.target_date;
    })
    .map((m) => ({
      name: m.name,
      was: prevMilestones.get(m.name)?.target_date ?? null,
      now: m.target_date,
    }));

  const you_owe = plan.your_tasks.filter((t) => t.owner === "you" && t.status === "open");
  const we_owe = plan.our_commitments.filter((c) => !c.done);
  const today = dayKey(now);

  const attention: string[] = [];
  for (const t of you_owe) {
    if (t.bucket === "overdue") attention.push(`"${t.title}" was due ${t.due_date}.`);
  }
  for (const m of moved) {
    attention.push(`"${m.name}" moved from ${m.was ?? "no date"} to ${m.now ?? "no date"}.`);
  }
  for (const c of we_owe) {
    if (c.due_date && c.due_date < today) {
      attention.push(`We owe you "${c.description}", due ${c.due_date}.`);
    }
  }

  const next_milestone =
    plan.milestones
      .filter((m) => !m.completed_date && m.target_date)
      .sort((a, b) => (a.target_date! < b.target_date! ? -1 : 1))[0] ?? null;

  return {
    plan,
    week_start: weekStart,
    moved,
    attention,
    we_owe,
    you_owe,
    next_milestone,
    contact: plan.contact,
  };
}
