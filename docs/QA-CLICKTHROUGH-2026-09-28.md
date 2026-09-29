# Click-through after the fix list (Sep 28, 2026)

Everything below is live on www.gcinternalportal.com from the branch pushed today.
Three scripts, one per workflow. Each creates its own record named `QA TEST – …` so
they are easy to find and delete afterwards. Tick as you go; anything that does not
read as written is a bug.

## Before you start

- Sign in as yourself (manager). Steps marked **(manager)** need that role.
- Have a small PDF handy to stand in for a SOW, and a paragraph of "call notes"
  you can paste. For the New logo script the notes should name a deadline with a
  day ("in production by Oct 30") and a stakeholder's absence ("Priya is out
  Oct 12–16").

## 1 · New logo — `QA TEST – Summit NL`

1. Pipeline → **New account**. Type `QA TEST – Summit NL`. Leave "Type of deal" as
   New logo. **Before pasting notes**, look under the name: no red text until you
   submit or type and leave the field. Paste the call notes, do not attach a SOW.
   Create.
2. The deal lands as a **Prospect**. The checklist rail reads Prospect → Closed Won →
   Pre-kickoff → Onboarding → Complete, with Prospect filled and the Closed Won
   tasks open to work ahead. Footer says it moves on when the deal is marked won.
3. Press **Mark Closed Won**. It is refused in the page (no browser pop-up): a notice
   lists exactly what is missing — the SOW — with an **Add the SOW** button that opens
   that task. **(manager)** A **Move it anyway** button asks in the app's own dialog.
   Cancel it.
4. Upload the PDF as the SOW. Press **Mark Closed Won** again: it moves. The AI
   reading starts once; reload the page twice — it does **not** start again on its
   own.
5. Open **Plan → Watch-outs**. Every row has a quote. The deadline row reads "The
   calls name Fri, Oct 30 …" against the plan's live date; the absence row names
   Priya and the stage she is out during. No row invents a day from a month.
6. Pre-kickoff → **Book all three core meetings**. Set Stage 2 on a day inside
   Priya's absence: an amber warning appears under that row before you save. Move
   it out, save: "All three booked".
7. **Reply to the AE's email**: the subject ends "booking your Stage 1"; the body
   says "three 60-minute meetings" and offers Stage 1 "(60 minutes)". Press **Copy
   the email** — the button keeps its width and "Copied" clears itself after a few
   seconds.
8. Tick **Added to the cadence** (the task names the Salesloft cadence set under Settings) and untick it twice quickly: the box
   follows every click at once, nothing is lost after the page settles.
9. Home. The card for Summit reads its **deal** stage (Pre-kickoff) and, if the
   plan misses the Oct 30 deadline, an act-now reason naming it, with the health
   chip at risk. Nothing on the page says "On track".
10. Customers list: Summit's stage badge and the Stage filter use the deal stages
    (Prospect … Complete). Customer page → **At a glance**: Stage = deal stage,
    Progress counts against the same rail. Details → Journey shows "Project stage"
    (the lifecycle) as history.

## 2 · Field Fusion — `QA TEST – Prairie FF`

1. New account → `QA TEST – Prairie FF`, type **Field Fusion**, paste notes that
   mention Field Fusion (the suggestion line names the option and does not shift the
   form). Attach the PDF. Create, then Mark Closed Won.
2. The deal sits in **Field Fusion setup**. The setup box's meta reads "Checking who
   owns the setup…" for a moment, then either the owner's name or "Nobody owns the
   setup yet". Never "Nobody" while it is still loading.
3. The picker under **Hand to implementation** lists everyone: "In rotation" first,
   each as `Name — N active accounts`, then "Not in rotation". The Field Fusion
   default owner is in the list.
4. Tick both checks quickly: both boxes change at once. Untick one and re-tick it.
5. Press **Hand to implementation**: an in-app dialog asks; confirm. The deal moves to
   Pre-kickoff.
6. Onboarding plan / welcome page: Session 1 is "the admin portal, and your forms as
   built"; Session 2 is "reference data, the PDF, and dispatch"; homework includes
   "Set up your crews for dispatch". The word "kickoff" does not appear in the
   Field Fusion plan; the sessions are 30 minutes.
7. The AE reply for this deal says "Three 30-minute sessions" and asks to hold
   **Session 1**.

## 3 · Existing customer add-on — `QA TEST – Varley Addon`

1. Open an existing customer (Varley Group). On the page header press **Add
   services**: the button reads "Starting…" while it works, then you land on the
   customer's Pre-kickoff tab. A pill row under the customer's name now shows both
   projects with their deal stages; click between them — the tab stays.
2. **At a glance**: "This deal" shows the add-on's own value (blank until the SOW is
   read), "Customer ARR" the customer's total.
3. Pipeline → **New account**, type "Existing account": the name field becomes a
   **customer picker**. Choosing Varley Group re-uses the open services deal (no
   second one is created). Now type `Varley` with the type set to New logo: the hint
   under the name lists Varley Group (customer) and its deal, and points at
   "Existing account".
4. On the services deal, Review: industry and champion are already filled and are
   not asked for again. The kickoff cadence task shows as optional.
5. Upload a SOW PDF that lists an integration and no form. Answer **Yes — it is
   final**. The plan becomes one **Walkthrough** on the day after the close, and the
   services start the day after it; the Pre-kickoff task is "Book the services
   walkthrough". Add a paid form under Beyond the form: the three Stage meetings come
   back.
6. Re-read the SOW: the integration row is not duplicated. Remove it, re-read: it
   does not come back.
7. Welcome page and AE reply say "Varley Group", never "Varley Group — services",
   and the reply opens "Good to be working with you again". The contact block reads
   `Name · Title · email`.
8. Customer page → Record tab shows the record only (plan and watch-outs are on
   Overview); the "To leave this stage" gates panel is not shown for this project.

## Everywhere

- No browser `confirm`/`alert`/`prompt` anywhere: deletes (templates, sequence
  steps, access, API keys) ask in the app's dialog; stage-gate overrides ask for the
  reason in the same dialog.
- Dialogs are solid, not translucent.
- Board: long deal names wrap; the sideways scrollbar is visible; a deal with only a
  SOW reference shows the SOW badge; the header reads "1 deal" for one deal.
- Home "Deals before kickoff" lists closed deals whose core meetings are not booked,
  whether or not a project exists yet.

## Clean-up

Delete the three `QA TEST – …` deals from the pipeline (and the Prairie / Summit
customers they created). The Varley add-on deal can stay or go; deleting it removes
its project.

## 4 · Edit plan (added Sep 28, later)

1. On any deal's Plan, Phase 1 has a primary **Edit plan** button. Press it: a solid
   dialog lists every step with its icon (the same icon the welcome page and the
   deck draw), name, type, owner, date, length for calls, and a one-line detail.
2. Drag a step by its grip (or use the arrows) above another: it moves; the close
   and the finish line stay at the ends and cannot be removed. Press ✕ on a step
   that already happened pre-sale: it is gone from this account only.
3. Change a step's type to "Call": a minutes box appears; change its icon; rename
   it. **Save the plan**. The Phase 1 summary now ends "· edited for this account",
   the step list shows the new icons and order, and the welcome page and the .ics
   follow.
4. Settings → Onboarding plans is untouched (that is our standard). **Back to the
   standard** in the dialog clears this account's edits; dates you moved stay.
5. Intake → "Common forms in your industry": picking a card no longer puts it on the
   plan. It appears on the deck's last slide and the welcome page's "Common forms in
   your industry — want them on your account?" block. Naming a form under the
   forms list is what schedules a build.

## 5 · Work it as a TIS (added Sep 29)

Assign yourself an account that is past Closed Won and open it from Home.

1. It opens on the **Implementation** tab. The top line says the stage, the day
   of the plan, "Target: Functional by …" and the owner. Nothing else is in the
   header — no full checklist.
2. **Now** shows one window only. Before Stage 1: reply to the AE, the cadence
   (it names the Salesloft cadence set under Settings → Kickoff cadence, or says it
   is not named yet), the Stage 1 readiness check, book the three meetings. Between
   Stage 1 and Stage 2: Stage 1 held, "between 1 and 2", Stage 2. Readiness and the
   close-out do not appear until Stage 3 is held.
3. Meetings, To do, Handoffs and Readiness are separate groups. A tick on a plain
   item lands at once; an item with a form (reply, book) opens under its row.
4. **Readiness** lists six items for an account with no datasets, eight when the
   plan has a data load. Press ✕ on one: it moves to "not part of this
   implementation"; "Show" lists it with "add" to put it back.
5. **Next customer meeting** names the next unheld meeting with its booked time, or
   says it is not on the calendar. After a meeting is held, "Write the Stage 1
   recap" appears under it in Now.
6. **Waiting on** lists the customer's unticked homework after Stage 1, the last
   recap's "their part", an unopened welcome link, and customer-owned parking-lot
   items — each with who and since when. Our own parking-lot items are counted on
   the Parking lot card.
7. **Implementation notes**: type a note, press "Add implementation note" (or ⌘↵).
   It appears at the top with your name, no author picker, no note type. The same
   note is in Details → Journey → TIS journal.
8. The **Resources** tab has the help picks, the project's files and a link to the
   welcome page; Overview and Record no longer show the help picks.
9. On a deal named like an opportunity (`… NL`, or all caps), the welcome page's
   "Still missing" asks for a **Customer-facing name**. Set it on the Record tab →
   Details; the welcome page, the AE reply, the invite titles and the deck use it.
10. The AE reply says "Stage 1 — Get it working / Stage 2 — Make it yours / Stage 3 —
    Make it run" and "aiming for … functional in about three weeks"; nowhere does it
    say "you're functional in about three weeks". The welcome page bands read
    "Target: …".
11. Assign a deal to yourself again: the email is three lines — the account, the
    first move, "Open it in the Hub".
