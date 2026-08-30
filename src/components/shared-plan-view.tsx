import { useState } from "react";
import { CalendarDays, CheckCircle2, Circle, Lock, MessageSquare, Paperclip } from "lucide-react";

import type { SharedMessage, SharedPlan, SharedTask } from "@/lib/shared-plan";
import { cn } from "@/lib/utils";

/**
 * The customer's plan. One component, rendered identically by all three doors
 * (signed link, authenticated /portal, internal preview), because they all
 * receive the same DTO from the same serializer.
 *
 * It renders `plan` and nothing else — no second fetch, no id lookups, no
 * "just this once" extra field. If something is not in the DTO it cannot be on
 * this screen, which is the property the whole design rests on.
 */

const BUCKET_LABEL: Record<SharedTask["bucket"], string> = {
  overdue: "Overdue",
  due_today: "Due today",
  this_week: "This week",
  later: "Later",
  done: "Done",
};

export type PlanActions = {
  onComplete?: (ref: string) => Promise<void> | void;
  onReopen?: (ref: string) => Promise<void> | void;
  onComment?: (ref: string, body: string) => Promise<void> | void;
  /** Post into the project conversation. Not about any one task. */
  onMessage?: (body: string) => Promise<void> | void;
  busy?: boolean;
};

export function SharedPlanView({
  plan,
  actions,
  banner,
}: {
  plan: SharedPlan;
  actions?: PlanActions;
  banner?: React.ReactNode;
}) {
  const yours = plan.your_tasks.filter((t) => t.owner === "you");
  const ours = plan.your_tasks.filter((t) => t.owner === "us");

  const grouped: Array<[SharedTask["bucket"], SharedTask[]]> = (
    ["overdue", "due_today", "this_week", "later", "done"] as const
  )
    .map((b) => [b, yours.filter((t) => t.bucket === b)] as [SharedTask["bucket"], SharedTask[]])
    .filter(([, list]) => list.length > 0);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      {banner}

      <header>
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {plan.customer_name}
        </p>
        <h1 className="mt-0.5 text-[20px] font-semibold tracking-tight">
          {plan.implementation_name}
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Currently in <span className="font-medium text-foreground">{plan.stage_label}</span>
          {plan.target_launch_date ? (
            <>
              {" · "}
              <CalendarDays className="inline h-3 w-3 align-[-2px]" /> target launch{" "}
              <span className="font-mono">{plan.target_launch_date}</span>
            </>
          ) : null}
        </p>
        {plan.stage_intent ? (
          <p className="mt-1 text-[12px] text-muted-foreground">{plan.stage_intent}</p>
        ) : null}
      </header>

      <section className="rounded-md border border-border bg-card">
        <header className="border-b border-border px-4 py-2.5">
          <h2 className="text-[13px] font-medium">With you</h2>
        </header>
        {grouped.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
            Nothing is waiting on you right now.
          </p>
        ) : (
          grouped.map(([bucket, list]) => (
            <div key={bucket}>
              <p className="border-b border-border bg-muted/40 px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {BUCKET_LABEL[bucket]}
              </p>
              <ul className="divide-y divide-border">
                {list.map((task) => (
                  <TaskRow key={task.ref} task={task} actions={actions} />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="rounded-md border border-border bg-card">
        <header className="border-b border-border px-4 py-2.5">
          <h2 className="text-[13px] font-medium">With GoCanvas</h2>
        </header>
        <ul className="divide-y divide-border">
          {plan.our_commitments.length === 0 && ours.length === 0 ? (
            <li className="px-4 py-6 text-center text-[13px] text-muted-foreground">
              Nothing outstanding on our side.
            </li>
          ) : null}
          {ours.map((task) => (
            <li key={task.ref} className="px-4 py-3">
              <p className="text-[13px]">{task.title}</p>
              {task.due_date ? (
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  due {task.due_date}
                </p>
              ) : null}
            </li>
          ))}
          {plan.our_commitments.map((c, i) => (
            <li key={`c-${i}`} className="px-4 py-3">
              <p className={cn("text-[13px]", c.done && "text-muted-foreground line-through")}>
                {c.description}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {c.due_date ? `due ${c.due_date}` : "no date"}
                {c.committed_to ? ` · to ${c.committed_to}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <ConversationPanel plan={plan} actions={actions} />

      {plan.milestones.length > 0 ? (
        <section className="rounded-md border border-border bg-card">
          <header className="border-b border-border px-4 py-2.5">
            <h2 className="text-[13px] font-medium">Timeline</h2>
          </header>
          <ul className="divide-y divide-border">
            {plan.milestones.map((m, i) => (
              <li key={`m-${i}`} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-[13px]">{m.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {m.completed_date ? `done ${m.completed_date}` : (m.target_date ?? "—")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {plan.contact ? (
        <p className="text-center text-[12px] text-muted-foreground">
          Questions? {plan.contact.name}
          {plan.contact.email ? (
            <>
              {" · "}
              <a className="underline underline-offset-2" href={`mailto:${plan.contact.email}`}>
                {plan.contact.email}
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The project conversation.
 *
 * Placed after the task lists and before the timeline on purpose: somebody
 * opening this page is here to find out what they owe, and the thread is where
 * they go when the answer is "it is complicated". Putting it first would bury
 * the tasks under a wall of chat.
 *
 * `plan.conversation.can_post` is decided on the SERVER — the flags, the
 * viewer's kind and the grant all feed it. This component never re-derives it.
 */
function ConversationPanel({
  plan,
  actions,
}: {
  plan: SharedPlan;
  actions: PlanActions | undefined;
}) {
  const [draft, setDraft] = useState("");
  const { messages, can_post, participants } = plan.conversation;

  // Nothing to show and nothing to say: render nothing rather than an empty
  // box that suggests a feature which is switched off.
  if (messages.length === 0 && !can_post) return null;

  const theirs = participants.filter((p) => p.side === "us").map((p) => p.name);

  return (
    <section className="rounded-md border border-border bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-medium">Conversation</h2>
        {theirs.length > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            With {theirs.slice(0, 3).join(", ")}
            {theirs.length > 3 ? ` and ${theirs.length - 3} more` : ""}
          </p>
        ) : null}
      </header>

      {messages.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">
          Nothing here yet. Anything you write goes to your GoCanvas team, and stays with the
          project.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {messages.map((m) => (
            <MessageRow key={m.ref} message={m} />
          ))}
        </ul>
      )}

      {can_post ? (
        <form
          className="border-t border-border p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const body = draft.trim();
            if (!body) return;
            // Cleared optimistically: the parent replaces the whole plan on
            // success, and on failure it shows the error banner. Leaving the
            // text in the box after a successful send makes people send twice.
            setDraft("");
            await actions?.onMessage?.(body);
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            maxLength={20000}
            placeholder="Write to your GoCanvas team…"
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-[13px]"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">Everyone on the project sees this.</p>
            <button
              type="submit"
              disabled={actions?.busy || draft.trim().length === 0}
              className="rounded-md border border-border px-3 py-1.5 text-[12px] disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function MessageRow({ message }: { message: SharedMessage }) {
  const mine = message.side === "you";
  return (
    <li className="px-4 py-3">
      <p className="flex items-baseline gap-2">
        <span className={cn("text-[12px] font-medium", mine && "text-muted-foreground")}>
          {message.author}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {mine ? "your team" : "GoCanvas"}
        </span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {message.at.slice(0, 10)}
        </span>
      </p>
      {message.withdrawn ? (
        // Said plainly rather than removed. A message that disappears without a
        // trace makes the reader doubt what they saw.
        <p className="mt-1 text-[13px] italic text-muted-foreground">This message was withdrawn.</p>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-[13px]">{message.body}</p>
      )}
    </li>
  );
}

function TaskRow({ task, actions }: { task: SharedTask; actions: PlanActions | undefined }) {
  const [comment, setComment] = useState("");
  const [open, setOpen] = useState(false);
  const done = task.status === "done";

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          disabled={!task.can_complete || !!actions?.busy || (done && !actions?.onReopen)}
          onClick={() => (done ? actions?.onReopen?.(task.ref) : actions?.onComplete?.(task.ref))}
          className="mt-0.5 shrink-0 disabled:opacity-40"
          aria-label={done ? "Reopen this task" : "Mark this task complete"}
        >
          {done ? (
            <CheckCircle2 className="h-4 w-4 text-foreground" />
          ) : task.blocked_by.length ? (
            <Lock className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn("text-[13px]", done && "text-muted-foreground line-through")}>
            {task.title}
          </p>
          {task.detail ? (
            <p className="mt-0.5 text-[12px] text-muted-foreground">{task.detail}</p>
          ) : null}
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {task.due_date ? `due ${task.due_date}` : "no date"}
            {done && task.completed_by ? ` · completed by ${task.completed_by}` : ""}
          </p>
          {task.blocked_by.length ? (
            <p className="mt-1 text-[12px] text-muted-foreground">
              Waiting on: {task.blocked_by.join(", ")}
            </p>
          ) : null}

          {task.files.length ? (
            <p className="mt-1 text-[12px] text-muted-foreground">
              <Paperclip className="mr-1 inline h-3 w-3 align-[-2px]" />
              {task.files.map((f) => f.file_name).join(", ")}
            </p>
          ) : null}

          {task.comments.length ? (
            <ul className="mt-2 space-y-1.5 border-l border-border pl-3">
              {task.comments.map((c, i) => (
                <li key={i} className="text-[12px]">
                  <span className="font-medium">{c.author}</span>{" "}
                  <span className="text-muted-foreground">{c.body}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {actions?.onComment ? (
            open ? (
              <form
                className="mt-2 flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!comment.trim()) return;
                  await actions.onComment?.(task.ref, comment.trim());
                  setComment("");
                  setOpen(false);
                }}
              >
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a note for the team…"
                  className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-[12px]"
                />
                <button
                  type="submit"
                  disabled={actions.busy}
                  className="rounded-md border border-border px-2 py-1 text-[12px] disabled:opacity-40"
                >
                  Send
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="mt-2 text-[12px] text-muted-foreground underline underline-offset-2"
              >
                <MessageSquare className="mr-1 inline h-3 w-3 align-[-2px]" />
                Add a note
              </button>
            )
          ) : null}
        </div>
      </div>
    </li>
  );
}
