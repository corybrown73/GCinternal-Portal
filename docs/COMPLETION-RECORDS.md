# Completion records, and getting them into Salesforce

When a project graduates to CS, or an engineer marks a solution **validated**,
the portal writes a **completion record**: everything that was done, frozen at
that moment, as a PDF and as a note body ready for Salesforce.

This document says what the portal does, and exactly what a consumer has to do
to finish the job in Salesforce. The portal does not do the Salesforce half —
see [Why the portal does not write to Salesforce](#why-the-portal-does-not-write-to-salesforce).

---

## What happens, and when

Two triggers, both server-side, both on the **transition**:

| Trigger | Where |
| --- | --- |
| An implementation advances to **Handover to CS** (`graduate-to-cs`) | `advanceStage`, `src/lib/hub.server.ts` |
| A solution's status is set to **validated** | `updateTechnicalSolutionStatus`, `src/lib/hub.server.ts` |

Re-saving `validated` over `validated` does nothing. Moving a solution back to
`built` and forward to `validated` again is a real reissue and gets **version 2**
— nothing is overwritten, and the earlier record stays exactly as it was issued.

Each trigger:

1. Projects the account's rows into one frozen document (`src/lib/completion-record.ts`).
2. Stores it in `completion_records` — content, note body, Salesforce ids, a
   hashed share token.
3. Files a link row in `account_files` so it appears in the account's
   Attachments and in **Completion records** on Customer 360.
4. Writes an audit row: `completion.recorded`, with the acting profile.
5. Emits a `completion.recorded` event onto the outbox (`integration_events`),
   which the existing webhook delivery machinery ships to any active endpoint.

Neither trigger can fail the work that caused it. A stage advance is already in
history and is the authority on that move; if the record cannot be assembled,
the failure is logged and the advance stands.

## The document is frozen

This is the point of the whole feature. Requirements get reworded, risks get
closed, owners leave. A completion record renders from `completion_records.content`
and never re-queries, so it shows what the work looked like **when it finished**,
permanently. The database refuses an `UPDATE` to the content or the note body —
reissue a new version instead.

It also records absence. A section with nothing in it stays in the document and
says so: "No risks were recorded for this project" is a different fact from a
project with no risks section, and only one of them is true.

Nothing is scored. There is no completeness percentage and no verdict on how the
work went — every line is something a person recorded, reproduced.

## The PDF

`GET /api/completion-record/{token}` — `application/pdf`, no login, no expiry.

The token is 32 random bytes and only its SHA-256 is stored, so a database dump
does not hand out documents. There is no expiry on purpose: the URL is written
into a Salesforce note and opened by whoever reads that account years later, and
a record of finished work that stops resolving is worse than not filing it.

A token that does not resolve gets the same neutral 404 as one that never existed.

Stated limitation, the same one the customer plan snapshot carries: a downloaded
PDF cannot be revoked.

---

## The `completion.recorded` event

Delivered to every active webhook endpoint, signed the same way every other
event is (`src/lib/server/webhook-signing.ts`). At-least-once and unordered by
contract — dedupe on `completion_record_id`.

```jsonc
{
  "event_type": "completion.recorded",
  "entity_type": "implementation",        // or "technical_solution"
  "entity_id": "…",
  "implementation_id": "…",
  "payload": {
    "completion_record_id": "…",
    "version": 1,
    "subject_type": "implementation",     // or "solution"
    "title": "Field inspections rollout",
    "customer_name": "Northwind Fleet Services",
    "completed_at": "2026-08-31T14:00:00.000Z",

    "salesforce_account_id": "001…",      // null if the account was never linked
    "salesforce_opportunity_id": "006…",  // null if the opportunity was never linked

    "note_title": "Completion record — Field inspections rollout",
    "note_body": "Implementation complete — …",
    "document_url": "https://…/api/completion-record/gccr_…",
    "document_filename": "Northwind Fleet Services — Field inspections rollout — completion record.pdf"
  }
}
```

`note_body` is plain text, capped below Salesforce's 32,000-character Note
limit. If the document did not fit, the body is cut at a **section boundary**
and says how many sections were dropped and where to read the rest — it never
ends mid-sentence.

## What a consumer does with it

Whatever runs the integration — Zapier, a Salesforce Flow behind an inbound
webhook, a small worker — does three things:

1. **Skip anything with no `salesforce_account_id`.** That project was never
   linked to a Salesforce account; there is nowhere to file it. Report it rather
   than guessing at a match by name.
2. **Create the note.** A `ContentNote` on the account (or a classic `Note`, if
   that is what the org uses): `Title` from `note_title`, `Content` from
   `note_body`, `ParentId` / `LinkedEntityId` = `salesforce_account_id`.
3. **Attach the PDF.** `GET` the `document_url` — it needs no authentication —
   and upload the bytes as a `ContentVersion` with `Title` = `document_filename`,
   then link it to the account with a `ContentDocumentLink`.

If the opportunity is also wanted, `salesforce_opportunity_id` is in the payload;
link the same `ContentDocument` to it rather than uploading twice.

**Retries.** Deliveries repeat. Before creating, look for an existing note whose
body contains the `document_url` (it is unique per record), or keep the
`completion_record_id` in a custom field. A reissue is a *different* record with
a *different* url and should produce a second note, not replace the first.

## Why the portal does not write to Salesforce

This app has never held Salesforce credentials and does not start now. It has
one outbound path — a signed webhook off an event outbox — and everything that
leaves goes through it, including the existing `salesforce.write_back`. Adding
a direct API client would mean storing an org's OAuth refresh token beside
customer delivery data, and giving this app write access to a CRM in order to
file a PDF.

The boundary is also why `note_body` is **stored** rather than rendered when the
webhook fires: the consumer files exactly what the record says, and what was
filed and what the PDF shows can never disagree.

## Setting a consumer up

1. **Admin → Integrations → Webhook endpoints → Add.** Copy the signing secret;
   it is shown once.
2. **Send a test event** from the same screen to confirm the endpoint answers
   and the signature verifies.
3. Deliveries and their responses are listed under the endpoint; a failed one
   can be redelivered from there without touching the portal.

## Reissuing by hand

`generateCompletionRecord({ subject, actorProfileId })` in
`src/lib/completion.server.ts` is callable directly, so a record that failed to
issue — a database hiccup, an endpoint that was down — can be issued again
without redoing the work. It always creates a new version; it never edits one.
