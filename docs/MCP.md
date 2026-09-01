# The Handoff Hub MCP server

Turns a pre-sale deal into the branded client kickoff deck, with Claude doing
the reading and the portal doing the rendering.

**Endpoint:** `POST https://www.gcinternalportal.com/api/mcp`
**Auth:** the portal's own API key — `Authorization: Bearer gcp_live_…`
**Scopes:** `handoff:read` to read a deal, `handoff:write` to create, record against, or file a deck into one

---

## The split, and why

Claude reads; the portal renders.

A model in a Claude session can read a transcript, search the web for what a
customer's industry actually cares about, and ask you a follow-up question
before it commits. A server-side one-shot can do none of that, and it burns API
tokens the app has to pay for.

What the model must **not** do is produce the PowerPoint. The brand template,
the field contract and the account it belongs to all live in the portal. A deck
built anywhere else drifts from the template and lands in somebody's downloads
folder instead of the account.

So the model supplies **field values**. The portal renders the deck and files
it against the account's Attachments.

## Setting it up

1. **Admin → API keys → Add.** Give it `handoff:read`, and `handoff:write` if
   it should be able to file decks. The key is shown once.
2. Add the server to Claude.

   **claude.ai custom connectors** have no field for a static header — they
   offer a URL and OAuth — so the key goes in the URL:

   ```
   URL: https://www.gcinternalportal.com/api/mcp?key=gcp_live_...
   ```

   **Anywhere a header can be set** (`claude mcp add --header`, Claude Code,
   your own client), prefer it — a URL is written to proxy logs and history in
   a way a header is not:

   ```
   URL:    https://www.gcinternalportal.com/api/mcp
   Header: Authorization: Bearer gcp_live_...
   ```

   A header always wins over a `?key=`, so a stale link cannot downgrade a
   request that carried a good key. Treat a connector URL containing a key as
   the key itself: do not paste it into a ticket or a shared doc, and rotate
   it at Admin → API keys if it goes somewhere it should not have.

3. Ask for what you want: *"Build the kickoff deck for Ridgeline Excavation."*

If a tool call comes back as a bare "execution failed", the connector is almost
certainly missing that header. The tool list is unauthenticated, so the
connection looks healthy right up until the first real call. The server now
answers that case with the reason and the fix in the tool result itself.

## Starting from nothing

A deal that does not exist yet is `create_deal`, and it hands back the intake
questions with the id — because a deal one second old has nothing in it, and a
deck generated from it would be entirely placeholders. The order is:

1. `find_deal` first. A duplicate company is refused; a transcript filed
   against the wrong copy is invisible on the real one.
2. `create_deal` — returns the deal id and the questions to ask.
3. Ask them, then `add_call_notes` with the transcript **in full**. Not a
   summary: `get_handoff_context` hands these back verbatim precisely because
   the sentence where the customer said what they wanted is the one a summary
   drops.
4. `update_deal` for the SOW's reference, signed date and value, and what was
   sold.
5. `generate_kickoff_deck` last.

**The PDF itself cannot come through the connector.** An MCP call carries text,
not file bytes, so the SOW or contract document is uploaded in the portal;
`sowDocumentUrl` records a link to a file living somewhere else, and is kept
separate from the uploaded copy so nobody mistakes one for the other.

**What the write tools will not touch:** `stage`, the owners, and
`customer_id`. Advancing a deal or marking it handed off has consequences
elsewhere in the app and belongs to somebody who meant it, not to a model
reading a transcript.

## The four tools

| Tool | Scope | What it does |
| --- | --- | --- |
| `find_deal` | read | Search the pipeline by company name. Returns the deal id everything else needs. |
| `get_handoff_context` | read | The deal, the SOW, and **every Gong call note and onboarding note verbatim**, plus the project's plan if it exists. Also returns `gaps`. |
| `describe_deck_fields` | read | The template's field names, grouped, with what each is for. |
| `generate_kickoff_deck` | write | Renders the deck from supplied field values and files it in the account. |

### Why the notes go across verbatim

The summary the app already stores is somebody else's reading. A deck built
from a summary of a summary loses the sentence where the customer said what
they actually wanted — and that sentence is usually the best line in the deck.

### `gaps` is the first thing to read

A deal with no call notes and no SOW returns a context object that says so. A
deck written confidently over a gap is worse than one that says the answer is
missing, because the first gets read aloud to the customer as fact.

## The rules the server enforces

- **A field name that is not in the template is rejected**, with the real names
  in the error. A misspelled field would render nothing and look like it
  worked.
- **Records beat inference.** Anything the portal already holds — requirements,
  the plan's stages, agreed success criteria, the assigned team — wins over the
  same fact read out of a transcript. The model fills what is left.
- **Omitted is not invented.** A field nobody supplied renders as a visible
  placeholder for the presenter and is listed in slide one's speaker notes. A
  field filled with a guess gets read to the customer as fact. The tool
  descriptions say this; so does this paragraph, because it is the whole point.
- **A deal with no project cannot be filed against.** The error says to start
  onboarding first rather than putting the file somewhere arbitrary.

The response tells you how many fields came from the record, how many came from
you, and which are still blank.

## What it does not do

- **No sessions.** It runs in a serverless function, so every call carries its
  own key and `GET /api/mcp` returns 405 rather than holding open a stream that
  would never carry anything.
- **No deck kinds yet.** Every deck is the new-logo Client Kickoff Deck. The
  expansion path — SOW-driven, integration-focused, with an internal
  level-of-effort call — is built as far as `src/lib/expansion-fields.ts` and
  not yet wired to a renderer.

## The in-app path still exists

Generating a brief from the deal page renders the same deck through the same
field map, using the Anthropic API directly. It needs `ANTHROPIC_API_KEY` set
in the deployment; without it briefs fall back to a template and the deck
arrives mostly blank. The MCP path needs no API key at all, because the
thinking happens in your Claude session.
