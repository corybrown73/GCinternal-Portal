# The GoCanvas page style, as a prompt

Paste the block below into claude.ai (or any Claude) before asking for a
page, a one-pager, a report or a deck. It is the same style the welcome page
in this app uses, so anything a department generates with it reads as the
same brand. Put your content request after it.

---

```
You are producing a single self-contained HTML file in the GoCanvas page style.
Follow every rule below exactly; where the content needs something the rules do
not cover, choose the plainest option that fits them.

CANVAS
- Design each screen on a fixed 1280 x 720 stage, white background, and scale the
  stage to fit the window (CSS `zoom` from a ResizeObserver, min 0.2). One stage
  per screen, stacked vertically with 24px gaps on a #f3f5f9 page background.
- Print: @page size 13.333in 7.5in, one stage per page, no page margins.
- Every screen has 64px side padding, a header row with the GoCanvas wordmark at
  top-left (28px tall), and a footer row: "gocanvas.com" left, the page number
  right as two digits ("03"), 11px, muted.
- Under the footer, a 10px three-colour stripe across the full width:
  blue (flex 3), orange (flex 1), green (flex 1).
- Top-right decoration on every screen: a soft blue radial blob (560px circle,
  #dff1fc fading to transparent, offset right -140px / top -180px) and a 128 x 64
  dot grid of #c9e6f7 dots, 16px apart, at right 64px / top 40px.

COLOURS (CSS variables; use nothing else)
  --navy: #072b57       headlines, card titles, body emphasis
  --navy-deep: #041633  dark backgrounds only
  --blue: #039de7       the accent run in every headline, eyebrows, links, "together"
  --blue-deep: #12509b  "we do it" pills, navy icon tiles
  --blue-soft: #eef7fd  tinted card backgrounds
  --blue-line: #d6effb  card hairlines
  --orange: #f37021     the short rule under headlines, "you are here", the one call to action
  --green: #1da25c      "your homework", done states, checks
  --ink: #0a1628        default text
  --body: #556477       paragraph text
  --muted: #6b7a90      captions, eyebrows in grey, footer
  --line: #e4e9f1       neutral borders
  White is the ground. Never use a gradient except the one blob. Never use a
  colour bar or accent stripe as decoration other than the footer stripe.

TYPE
- Font: "Plus Jakarta Sans" from Google Fonts (weights 400, 600, 700, 800), with
  system-ui fallback. Nothing else.
- Eyebrow above every headline: 11px, weight 700, uppercase, letter-spacing 0.18em,
  --blue. Example: "YOUR TIMELINE".
- Headline: 44px, weight 800, letter-spacing -0.03em, line-height 1.05, --navy,
  with exactly ONE run of words in --blue (the accent). Cover headline 58px.
- Under every headline: a 56 x 4px rounded rule in --orange, margin 12px 0 10px.
- Lede under the rule: 16px, line-height 1.5, --body, max-width 900px, one or two
  sentences.
- Body copy 12 to 14px, --body. Card titles 18px weight 800 --navy. Small
  uppercase labels 10px weight 800 letter-spacing 0.1em --muted.
- Left-align everything except the number pills. Never centre paragraphs.

COMPONENTS (use these, do not invent others)
- Card: white, 1px --blue-line border, radius 16px, padding 20px 22px, shadow
  0 1px 2px rgba(7,43,87,.04). Tinted variant: --blue-soft background. A dashed
  border means "tentative / not yet committed".
- Icon tile: 48px square, radius 14px, icon at 52%. Light tile: white with soft
  shadow, --blue icon. Blue tile: --blue background, white icon. Navy tile:
  --blue-deep background, white icon (used for "done" and the final step).
  Icons are Lucide-style line icons, stroke 1.75.
- Owner pill: 999px radius, 11px weight 700, white text, min-width 82px.
  "GoCanvas" = --blue-deep, "You" = --green, "Together" = --blue. Use these three
  words and colours for who does what, everywhere.
- Tag: 10px weight 800 uppercase letter-spacing 0.14em, white on --blue-deep,
  999px radius, padding 3px 10px. Example: "PHASE 2".
- Status chip: same shape. "You are here" = white on --orange. "Done" = --green
  text with a check. "Later" = --muted text.
- Rail / timeline: a horizontal row of equal columns, a 2px --line behind the
  tiles, each step = day label (11px uppercase --muted), tile, bold label (14px
  --navy), date (13px weight 700 --blue; --orange if moved; --green if done),
  owner pill, optional minutes (11px --muted), optional 11px detail under it.
- Band: the one line to remember on each screen. Full width inside the 64px
  margins, --navy background, white text 16px weight 700, radius 12px, padding
  14px 20px, an icon in a translucent white tile on the left. Sits above the
  footer.
- Ticks: a small 20px --blue-soft circle with a --blue check, then the text.
- Legend under a rail: the three owner pills with a short phrase after each.

SCREEN GRAMMAR
- Every screen: eyebrow, headline with one blue run, orange rule, lede, content,
  band, footer, stripe. In that order. No exceptions.
- One idea per screen. Six to nine screens for a customer-facing plan.
- The cover: eyebrow, 58px headline, rule, the customer's name in 22px --navy,
  a lede, three small white pills with icons (Build / Collect in the field /
  Connect), a "Prepared by" line, and on the right a large blue disc (300px,
  --blue radial) on a white ring with the industry icon, two floating white
  tiles beside it.
- Customer-facing language: never "deal", "closed won", "new logo", "prospect".
  Say "welcome aboard", "your first form", "your team", "your homework".
- Dates as "Thu, Sep 10". Weeks as "2 wks". Minutes as "60 min".
- Nothing may overflow a 1280 x 720 stage. If it does not fit, cut words, not
  the margins.

OUTPUT
- One .html file, all CSS inline in a <style> block, no frameworks, no external
  scripts. Google Fonts link is the only external resource. Use semantic tags.
- Give the file a <title> that names the customer and the document.
```

---

Then add your request, for example:

> Make a six-screen onboarding welcome page for Ridgeline Roofing (Roofing).
> First form: Daily Site Inspection. Kickoff Thu, Sep 17 at 10:00 Central,
> working session Mon, Sep 21 at 2:30. Phase 2: QuickBooks Online integration,
> tier 3, two weeks, once the form is dialed in. Lead: Priya Nair.

Or for another department:

> Make a four-screen quarterly business review for Summit Plumbing using the
> same style: what shipped, adoption numbers as large stat callouts, what is
> next, one ask. Use "You / GoCanvas / Together" pills for owners.
