# The deck prompt — building the kickoff deck in claude.ai, with nothing set up

Three ways produce the Client Kickoff Deck. Two need configuration:

| Way | Needs | Where |
| --- | --- | --- |
| In the app | `ANTHROPIC_API_KEY` in Vercel | Deal → Generate brief |
| The MCP server | A connector with an API key | Claude → "Build the kickoff deck for …" |
| **The prompt** | **Nothing** | **Deal → Account brief → Copy prompt for Claude** |

The third is the one that cannot fail. It is for the laptop in the room, the
day the key is not set, or the day the app's output is not good enough and a
person wants to steer.

## What it does

One click assembles a complete prompt and copies it:

- every call transcript **verbatim** — not a summary, because the sentence
  where the customer said what they actually want is the one a summary drops
- what was sold: products, ARR, the contact, the owners
- the SOW's reference, signed date and value
- the intake answers: forms built or not, what was uploaded, industry, size,
  field users, the process today
- the project's plan, stages, open tasks and risks, if it has been handed off
- the gaps the portal already knows about, so the model leads with them
- the sequencing rule (prove the form in the field before connecting anything)
- the **exact field names** the deck template accepts, grouped by slide, with
  guidance for each group
- the **design system tokens** — the GoCanvas colours and type — so a model
  that draws the deck itself draws it in the right system

And two rules, stated before the facts: leave a field out rather than guess,
and read back what the customer said rather than what we would like them to
want.

## The loop

1. Deal page → **Account brief** → **Copy prompt for Claude**
2. Paste into claude.ai. Add anything the portal does not have — a PDF of the
   SOW, a screenshot, a correction.
3. Claude returns any gaps that matter, then a JSON object of field values.
4. Paste the JSON back — into the MCP's `generate_kickoff_deck`, or into the
   in-app generate step — and the portal renders it in the design system and
   files it against the account.

Or ask Claude to build the .pptx itself: the tokens are in the prompt, so the
result matches the template. That is the path when the rendered deck needs
more than the template can give and a person wants to shape it by hand.

## Why the prompt carries the design tokens

Because the alternative is a deck that looks like whatever the model felt
like that day. The colours, the font, the dark-divider/light-content rhythm,
"never an accent line under a title" — they are in the prompt so a self-drawn
deck is recognisably ours, and so a person editing it has the palette in
front of them.
