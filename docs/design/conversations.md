# Project conversations

One thread per project, written by both sides.

## The gap

Before this, the only place a customer could write was a comment on a single
work item (0021). That is a per-task side channel, not a conversation. "We need
to move the kickoff" has no task to hang off, so it happened in email — the
place the hub exists to replace. Everything about the project was in one system
except the talking.

## The shape

| Table | What it holds |
| --- | --- |
| `project_conversations` | One row per implementation. Two activity clocks. |
| `conversation_participants` | Internal profiles and customer contacts, in one table. |
| `conversation_messages` | The thread. Each message is `shared` or `internal`. |
| `conversation_mentions` | Resolved `@handles`, as rows. |
| `conversation_reads` | A cursor per participant. |

**Grain: the project, not the customer.** A customer with a rollout in June and
an integration in November has two audiences, two timelines and two task lists.
Merging their threads helps nobody, and it is the same grain as the plan, the
external link and the board.

**Internal and external participants share one table.** "Tag everyone in the
project" is one list or it is not one place. A mention that can only reach one
side of the room is the failure this feature exists to fix.

## The invariant

An internal message must never reach a customer. There are five distinct ways
it could, and each has a named defence:

1. **An external author writes something marked internal.** Trigger
   `conversation_message_enforce` on INSERT. The external write path runs on the
   service role, so nothing but this stands between a bad parameter and an
   internal note authored by an outsider.
2. **An internal message mentions a customer contact.** Trigger
   `conversation_mention_enforce`. Without it they would be emailed about a
   message they cannot open — the most likely accident of the five.
3. **A shared message is re-marked internal after they read it.** Refused by
   `conversation_message_enforce` on UPDATE. Internal → shared is allowed; it is
   a deliberate forward move. Shared → internal is a false record. Withdraw
   instead.
4. **The activity clock moves for internal traffic.** Two columns:
   `last_message_at` and `last_shared_message_at`. The external door reads only
   the second, so a customer never learns that a conversation they cannot see is
   happening.
5. **`@everyone` on an internal note.** `parseMentions` reports that `@everyone`
   was used and refuses to say who that is, because who it is depends on the
   visibility and only the server knows that. `audienceFor` resolves it.

Defences 1–4 are database triggers. That is deliberate and not negotiable: every
app read and write runs on the service-role client and bypasses RLS, so RLS
here is defence in depth and the triggers are the guarantee.

`supabase/tests/0029_conversation_invariants.sql` probes all of them in CI. Each
probe asserts both that the operation was refused **and that it was refused for
the expected reason**, so a foreign key firing first cannot pass as enforcement.
Removing any one trigger turns the migrations job red.

## Identity is immutable

A participant's `handle` cannot be changed, and it stays reserved after they
leave. Recycling `@dana` onto a different person would silently repoint every
old message that addressed her, and those messages are evidence of what was said
to whom. Renaming somebody changes `display_name`, which touches no history at
all — the same split as `key` and `label` on pipeline stages (0028).

Message authorship is immutable too: `author_kind`, the author ids, `author_name`
and `created_at` cannot be updated. `author_name` is `NOT NULL` even though the
author ids are nullable, because a message whose author row was deleted must
still say who wrote it. An unattributed message in a shared thread is worse than
no message.

## Withdrawal keeps the body

A withdrawn message keeps its row and its text; the body is dropped **on the way
out**, in the projection. Deleting it would make the record disagree with what
the customer already read. The DTO renders "This message was withdrawn" with the
author still attached — a message that vanishes without a trace makes the reader
doubt what they saw.

## Notification

Two rules, deliberately different:

- **A mention always notifies.** Being named is a request. It overrides
  `notify = false`: that setting asks for less noise, not to be unreachable.
- **Otherwise only the other side is notified.** A customer's message reaches
  the internal team; an internal person's shared message reaches the customer.
  An internal note reaches nobody by default — it is a note.

If every internal note paged the whole team, the team would stop reading them,
and then the thread stops being one place.

The rules live in `src/lib/conversation.ts` (pure, tested) so both doors apply
exactly the same ones. A rule that exists twice is a rule that will one day
disagree with itself.

## What the customer sees

Through `buildSharedPlanDTO`, like everything else. `SharedMessage` carries a
name, a `side` ("you" or "us"), the text and a timestamp — no ids, no email, no
`visibility` field. There is deliberately no visibility flag on the wire: it
would always be `"shared"`, and carrying it invites a future reader to render
the other value.

Internal messages are filtered in the **query** as well as in the DTO. A
projection bug is then a bug about something that is not in the process's memory.

## Mentions

`src/lib/mentions.ts` is pure and shared by the composer and the resolver, so a
mention can never highlight while typing and then fail to notify. Three things
it handles that a regex does not:

- an `@` after a word character is an email address, not a mention
  (`dana@acme.com` mentions nobody — the single most likely way to notify a
  stranger);
- longest match wins, so `@dana.reyes` is one person rather than `@dana` plus
  `.reyes`;
- a handle always ends in a letter or digit, so trailing punctuation belongs to
  the sentence.

An unrecognised handle is reported, never swallowed. Typing `@daan`, getting no
notification and no warning is how somebody concludes the feature is broken.

## Flags

`conversations` gates the thread. It is separate from the external portal flags
on purpose: the thread is useful internally on its own, and turning it on does
not by itself put anything in front of a customer. What a customer can see is
still `external_plan_view_enabled`; what they can write is
`external_plan_actions_enabled`.

## Not built

- Real-time delivery. The panel polls every 30s. A socket is the right answer
  and is a separate change.
- Attachments on a message. Files still attach to work items (0021).
- Editing. The column exists (`edited_at`) and the trigger permits it; no
  surface calls it yet.
