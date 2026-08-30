# Design system

The visual rules this app is built from, and the reasoning behind each one.
Everything here is implemented in `src/styles.css`; this file explains it.

Two rules govern the whole document:

- **Defined once.** A radius, a shadow or an interaction that is re-implemented
  in a component is a second source of truth, and the two drift.
- **Every value has a reason.** A number nobody can justify is a number nobody
  can change, because no one knows what it would break.

---

## 1. Soft geometry — the radius scale

| Token | Value | Used for |
|---|---|---|
| `--r-sm` / `rounded-sm` | 6px | inputs, chips, small controls |
| `--r-md` / `rounded-md` | 10px | buttons |
| `--r-lg` / `rounded-lg` | 18px | cards, panels |
| `--r-xl` / `rounded-xl` | 28px | page sections |
| `--r-pill` / `rounded-full` | 999px | counts, avatars, status pills |

**Why these steps.** The scale used to be derived from a single `--radius: 6px`,
so every corner in the app was within 4px of every other and curvature carried
no information at all. Now each step is a different *kind* of thing, and a corner
tells you what you are looking at before you read a word of it.

**No ad-hoc radii.** A `rounded-[14px]` in a component is a sixth step nobody
agreed to, and six steps read as none. If a value seems needed, the scale is
wrong — change the scale.

### Continuous corners

Where the browser supports `corner-shape: squircle`, corners are drawn as a
continuous curve that eases into the edge rather than meeting it at a tangent.
This is progressive enhancement over a plain `border-radius` that is already
there, so browsers without it keep the arc and nothing is laid out differently.

---

## 2. Section structure

**The curvature is the boundary.** A major page section is an inset card at the
xl radius sitting on the tinted page, separated from its neighbours by space.

- The radius is **identical on every section**. Curvature only reads as a
  boundary if it is consistent; vary it and it reads as decoration.
- A section **never has both a border and a radius**. They are two ways of
  saying "this is a section", and saying it twice is what makes an interface
  look busy.
- Sections are separated by **vertical gap**, never by rules.

What replaces the border is not nothing. Three things separate a section from
the page: the surface step (`card` at L 1.0 on a `background` of 0.945), a
resting shadow that makes it an object sitting on the page rather than a region
of it, and the space around it. An internal divider *inside* a section — a panel
header band, a row separator — is a different thing and survives.

Utility: `.section-card`. Component: `Panel` in `src/components/record.tsx`.

---

## 3. Elevation and the lift

Two shadow steps, and the second is only ever reached on hover:

```
--shadow-rest       0 1px 2px rgb(0 0 0 / .08)
--shadow-lift       0 3px 8px rgb(0 0 0 / .14)
--shadow-rest-card  0 1px 3px rgb(0 0 0 / .07)
--shadow-lift-card  0 8px 20px rgb(0 0 0 / .14)
```

A resting surface that already carries a deep shadow has nowhere to go when you
point at it, which is how an interface ends up feeling inert however much shadow
it has.

### `.lift` — buttons

| State | Transform | Shadow |
|---|---|---|
| rest | none | `--shadow-rest` |
| hover | `translateY(-1px)` | `--shadow-lift`, background one step |
| active | `translateY(0)` | `--shadow-rest` |
| disabled | none | `--shadow-rest`, `cursor: not-allowed` |

Transition: `120ms ease-out` on **transform, box-shadow, background-color and
border-color only**. Never `all` — transitioning everything animates layout
properties too, which is how a hover ends up costing a frame budget.

**The resting state carries the affordance.** Every variant except `ghost` and
`link` keeps a fill or a border at rest, so a button looks pressable before
anything hovers it. The lift is *confirmation*, not the affordance. An interface
where you have to wave the pointer around to discover what is clickable has
already failed the people who never wave it: touch users, and anyone reading a
screenshot.

**Active returns to exactly the resting values**, which is what makes the button
feel like it presses back down rather than merely changing colour.

### `.lift-card` — clickable cards

Same idea at `translateY(-2px)` with the larger shadow pair. Bigger surfaces
travel further, because 1px on a 400px card is invisible.

### `.lift-row` — clickable table rows

Rows get background and focus treatment but **no transform**: `transform` on a
`<tr>` is undefined in most engines, and a row that tries to rise detaches from
its own borders. The intent is carried by background instead.

### Three constraints that shaped the implementation

**Layout never shifts.** The movement is a `transform`, which is applied after
layout, so a lifting button cannot reflow its neighbours no matter how many are
in a row. The same effect written as `margin-top: -1px` would shove every
sibling on the line. This is the reason it is a transform and not a margin.

**Focus is an `outline`, not a `ring`.** Tailwind's `ring-*` utilities are
implemented as `box-shadow`, and `box-shadow` is the property the lift animates
— a ring would be painted over by the hover shadow at the exact moment a
keyboard user needs to see it. `outline` draws in its own channel and, at
`outline-offset: 2px`, sits outside the shadow rather than under it.

**Reduced motion removes only the motion.** `prefers-reduced-motion` guards the
`transform` rules alone. Someone who cannot tolerate movement still needs to know
which button they are on, so the shadow and background keep changing and the
element simply does not travel. Guarding the whole rule would leave those users
with no hover feedback at all.

`disabled:pointer-events-none` was removed from the button. It suppresses hover,
which is wanted, but it also suppresses the *cursor* — a disabled button showed a
plain arrow and gave no reason for not responding. `.lift` guards its own hover
states on `:not(:disabled)` instead, which leaves `not-allowed` visible.

---

## 4. Glass

One utility, `.glass`: translucent fill, `backdrop-filter: blur(20px)
saturate(180%)` (with the `-webkit-` prefix), a hairline light border, an inset
top specular highlight, and a soft outer shadow.

### Where it is allowed

The **sticky top bar, toolbars, modals, popovers and toasts**. Floating overlay
layers, and nothing else.

### Where it is forbidden, and why

**Tables, field lists and the record detail panel stay solid.** Blur samples
whatever is behind it, so the effective contrast of text on glass varies with
the content underneath. That is fine for a toolbar with six words on it and
unacceptable for a dense table, where one row might land over a dark chart and
lose its text.

### The page needs a gradient

Glass over a flat fill renders as plain grey — there is nothing for the blur to
sample and the material reads as a panel somebody made translucent by accident.
`body` therefore carries two very wide, very faint radial washes (under 2%
lightness variation, so they never compete with content) at
`background-attachment: fixed`. Fixed, because a sticky bar must sample the same
thing at every scroll position or it changes colour as the page moves under it.

### Fallback

An `@supports (backdrop-filter: ...)` block adds the blur; the base rule is an
**opaque** `--glass-solid`. Browsers without `backdrop-filter` get a solid
surface and keep their contrast, rather than a translucent panel over an
unblurred page.

### Measured contrast

Computed by compositing the glass fill over the darkest (light mode) and
brightest (dark mode) point of the page wash, then converting oklch → sRGB →
relative luminance. Script: `scratchpad/contrast.py`.

| Mode | Backdrop | `foreground` | `muted-foreground` |
|---|---|---|---|
| Light | plain page | 17.04:1 | 6.42:1 |
| Light | darkest wash | 16.35:1 | **6.16:1** |
| Light | `@supports` fallback | 16.35:1 | 6.16:1 |
| Dark | plain page | 15.70:1 | 7.38:1 |
| Dark | brightest wash | 14.28:1 | **6.71:1** |
| Dark | `@supports` fallback | 14.44:1 | 6.79:1 |

Worst case is 6.16:1, against a 4.5:1 requirement. The margin is deliberate:
this app sets a lot of 11px type, where AA is a floor rather than a target.

---

## 5. Colour

Colours are oklch throughout. The surface ramp and its reasoning are documented
in the comment block at the top of `:root` in `src/styles.css` — the short
version is that what reads is the **size of the step between adjacent surfaces**,
not the contrast ratio, because two near-white surfaces cannot produce a large
ratio no matter what you do.

```
light:  card 1.0  >  background 0.945  >  surface 0.885  >  muted 0.87
dark:   surface 0.285  >  card 0.235  >  background 0.165
```

`surface` sits *below* the page in light mode and *above* the card in dark mode,
because it does two jobs in both: it fills the header band on a panel, and it
fills a `supporting` panel sitting directly on the page. A value tucked between
the two would be faint against both.

Status colours are meaningful, never decorative.
