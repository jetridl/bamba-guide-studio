# Guide Studio on phone and laptop

A design for one Studio that works at three widths. Build the guide on the
MacBook. Read it, edit the words, settle the notes, approve and publish from
the phone.

Mockups: the Design canvas "Bamba Guide Studio — phone & laptop"
(<https://claude.ai/artifact/XdsyDX6HNwaXQJJzHKMoiW>).

This is the brief, and it now matches the code. Section 6 says what changed.

---

## 1. Decisions

| Question | Decision |
| --- | --- |
| What can the phone change? | Titles, body text, prompts, review notes, approve, publish. No add, delete, reorder or type change. |
| What does Publish do on the phone? | Writes `exports/curated_poems/...` on the Studio machine. Commit and push stay on the MacBook. |
| Journeys on the phone? | Yes. List, cover, order read-only, and the "why it belongs" note. |
| Dark mode? | Yes. Bamba's night palette, following the system setting, with a manual switch. |

Structural work (add, delete, reorder, change type, link chunks, import JSON)
stays on the laptop. The phone says so in one quiet line instead of hiding the
controls without explanation.

---

## 2. Style: adopt the Bamba pack

Today the Studio uses Geist and an oklch guess at the palette. Replace both
with the exported pack in
`artifacts/design-system/Bamba-Claude-Design/`.

**Fonts.** Inter for interface text. EB Garamond for titles and every line of
poetry. Load the bundled variable fonts, not a substitute.

**Colour, light.** ivory `#F8F5F0`, parchment `#F3EEE6`, paper `#FFFDFA`,
border `#E9E0D4`, ink `#0F172A`, slate `#64748B`, quietInk `#56647C`,
amber `#D97706`, warmAmber `#B45309`, kindle `#B4540E`, glowInk `#7A4A1E`,
glowDot `#E9A45C`, chip fill `#FBF1E4` with border `#F1DFC8`.

**Colour, night.** night `#171412`, nightCard `#221D19`,
nightBorder `#4A3B30`, candle `#F4E5D3`, nightBody `#CCBCA9`,
nightGlow `#F4C879`, kindleBright `#DB7A0A`.

Keep kindle, warmAmber and amber apart; the pack says the difference is
deliberate. Keep `#B91C1C` out of the Studio: it belongs to answer feedback in
the app.

**Type scale.** Page title EB Garamond 40/700/1.05. Poem title 34/600/1.15.
Session heading 20/600. Poem text in preview 21/1.65. Body Inter 16/1.5 on the
phone, 15 on the laptop. Field label Inter 11/600, tracking 0.14em, uppercase.

**Geometry.** Radius 20–22 for list surfaces and cards, 18 for fields and
buttons, stadium for chips and segments. Gutters 20 on the phone, 24–32 on the
laptop. Every target 44 px or more; the 24 px icon buttons in today's
navigator go.

---

## 3. Layout at three widths

**Under 768 — one column.** Guides list, then guide, then page. Navigation is
a stack, not panes. The primary action sits pinned at the bottom.

**768 to 1279 — two panes.** Navigator plus editor. A floating pill pair opens
Preview or Notes as a sheet, so both panes keep their width.

**1280 and up — three panes.** Navigator 320, editor flexible with a 680 max
reading width, right rail 400 holding Preview and Notes.

One component set, placed differently. Nothing is built twice.

---

## 4. Screens

### 4.1 Guides list

Literary title, a row of single-select stadium filters that scroll sideways
(All, In review, Approved, Draft, Published), a count and sort line, then one
shared rounded surface with hairline dividers. Each row: poem title in EB
Garamond, poet and session count, then a state line with a dot. A row in
review also shows its blocking count.

The phone keeps a bottom segmented pill, Guides and Journeys, next to a round
import button. This matches the app's Library and Journeys pill.

### 4.2 Guide overview (phone)

Back link, poem title, state pill, version pill and save state. Under it a
readiness strip: "Two things to settle — 2 blocking notes are still open", or
a calm tick when all four checks pass. It opens the publish sheet.

Then one rounded surface per session, listing its pages. A page with an open
note carries a dot: maroon for blocking, kindle for other notes.

The bottom holds one action. Approve while in review, Publish once approved.
Disabled states say why in one line underneath.

### 4.3 Page view (phone)

A segmented pill: Edit, Preview, Notes with a count. The pill is the whole
mobile editor.

- **Edit** — type (read-only on the phone), title, body or prompt. Fields are
  52 px tall, radius 18.
- **Preview** — fills the screen. No phone frame inside a phone. Renders in the
  app's own type, taken from its study screen: an amber uppercase eyebrow, an
  EB Garamond heading at 26/1.25, prose at 19/1.65 and poem text at 21/1.65.
- **Notes** — review comments as calm cards.

A page stepper is pinned at the bottom: a back square and a wide "Next page".
Reviewing a guide is then one thumb moving forward.

### 4.4 Review notes

One card per comment: severity pill, category, the comment, and a suggested
revision in a quiet quoted block. Actions are Accept, Resolve and Dismiss, all
44 px.

Severity reads by the pill and by lightness, not by hue:

| Severity | Text | Fill | Card border |
| --- | --- | --- | --- |
| Blocking | `#944A48` (resetMaroon) | `#F9EFEC` | `#EBD7D1` |
| Warning | `#92400E` | `#FBF1E4` | `#F1DFC8` |
| Suggestion | `#56647C` | `#F3EEE6` | `#E2D9CC` |

Accept still writes the suggestion into the guide. Nothing the editor wrote is
replaced without that tap.

### 4.5 Approve and publish

A bottom sheet, radius 28, over the dimmed guide. It shows the four export
conditions from `AGENTS.md` as a checklist:

1. Status is approved
2. Schema check passes
3. No blocking validation issues
4. No open blocking review comments

Below the list, the target path in mono type. The button is live only when all
four pass. Under it, what happens next in plain words: the file lands on the
Studio machine; commit and push from the MacBook.

This checklist uses `GET /guides/{id}/validate`, which the API already has and
the UI never shows today.

### 4.6 Journey (phone)

Cover, title, subtitle, state and version, then the ordered poems with each
note on why it belongs. Tap a poem to edit its note. Reordering says plainly
that it happens on the laptop. One pinned action: Publish journey.

### 4.7 Laptop editor

Header: back, poem title with state and version pills, save state, a readiness
chip ("2 of 4 checks"), one primary action, and an actions menu.

The seven header buttons today overflow. They move into a Bamba-style actions
menu, icon plus title plus a short description: version history, save version,
use as latest, import review, download JSON, mark in review, refresh, theme.

The phone uses the same list as a bottom sheet behind the "..." circle. Items
that need a file picker, such as Import review, stay visible but disabled, with
"Pick the file on the laptop" as their description.

---

## 5. States and language

- Save state is always visible: "Saved 12:04", "Saving", or a failure banner
  with Retry. Never hide it on small screens.
- Calm invitations, as the pack asks. "Two things to settle", not "2 errors".
- Lifecycle words stay the app's: Igniting, Glowing, Embers, Rekindling. They
  do not appear in the Studio, which has its own four: draft, in review,
  approved, exported. The Studio keeps the backend's own word, `exported`, for a
guide that has been published.

---

## 6. What this touches in code

Nothing below is done yet.

- `frontend/src/index.css` — replace the oklch palette and Geist with the pack
  tokens, both themes, and `@font-face` for Inter and EB Garamond.
- `frontend/src/components/StudioTopBar.tsx` — responsive chrome.
- `frontend/src/features/editor/GuideEditorPage.tsx` — the 984-line page splits
  into the navigator, the page editor, the preview and the notes panel, with a
  layout component that places them per width. The mobile route needs its own
  stack: guide overview, then page view with the segmented pill.
- `frontend/src/features/journeys/JourneyEditorPage.tsx` — same treatment, with
  reordering kept to the laptop.
- New: a readiness hook over `api.validateGuide`, and a publish sheet.
- `frontend/index.html` — the viewport meta is already right.

---

## 7. Two things to settle before building

1. **Reaching the Studio from the phone.** `VITE_API_BASE_URL` falls back to
   `http://localhost:8000/api`. A phone needs the Mac's LAN address, or a
   tunnel, and the backend needs that origin allowed. No design can fix this.
2. **`AGENTS.md` says desktop-first** and lists mobile layout under "Do Not
   Implement". That line now contradicts the product. Update it in the same
   change.
