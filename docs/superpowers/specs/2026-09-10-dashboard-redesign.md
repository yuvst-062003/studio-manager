# The manager dashboard redesign

**Written:** 2026-09-10 · **Source:** the AI Studio prototype at `~/Downloads/גלדיאטור-studio-os`,
read directly · **Branch:** `feat/dashboard-redesign` · **Status:** draft, not yet approved.

The owner's instruction, verbatim: **port the look, keep the logic.**

---

## Decisions taken with the owner, 2026-09-10

Where a decision overruled a recommendation of mine, the recommendation is not restated — the
decision is the spec.

| # | Question | Answer |
|---|---|---|
| 1 | The dashboard's five discipline pills | **Class chips**, filtering the screen for real. Must scale: the club has two classes today and expects more classes *and more studios*. |
| 2 | Capacity on class cards and group cards | **Not built.** No capacity column is added; no occupancy bar, no `14/15` fraction. |
| 3 | Student photos | **Coloured initials.** `person.photo_object_key` exists but is written and read by nothing; no upload is built, and no consent question about photographs of minors is opened. |
| 4 | The national id on the student card | **Hidden.** It stays on the registration form and the health declaration only. |
| 5 | Manual payment methods | **Exactly what exists** — מזומן, צ׳ק, העברה בנקאית. Bit is *not* added as a label. |
| 6 | The צפה בקבלה button | **Deferred to the very last checkpoint.** Then: try linking to the uPay receipt; if the link does not work, remove the button. We generate no receipts of our own, so until it is proven the row shows the typed receipt number as plain text and no button at all. |
| 7 | Announcement channels | **Push is the only live channel.** WhatsApp and SMS are shown as future — permanently disabled, marked בקרוב. This is legal under `inert-buttons.test.ts`, whose one exemption is an unconditionally disabled control. |
| 8 | The shop's 10% member discount | **No discount box.** Charge the real price and use the existing adjust action, which records a reason. |
| 9 | Attendance buttons | **Three buttons over the three states we store** — נוכח · נעדר בהודעה · נעדר ללא הודעה. **איחור is not added**; it would change the schema and every attendance percentage. |
| 10 | Profit per class in reports | **Not built.** No coach pay is stored, and the word *profit* is not used. Income by class stays. |
| 11 | The four invented settings | **Build:** automatic debt reminders, health-certificate expiry warning. **Do not build:** allow-online-shop-purchases, and **SMS sender name — removed entirely**, not stored and not rendered. Revised 2026-09-10 after first being kept: a field that configures a channel the product does not send is a setting that controls nothing. D7 still shows SMS in the channel step as בקרוב, which is a promise about the future rather than a setting about the present. |
| 12 | Business number (ח.פ / עוסק מורשה) | **Added** to the club details. |
| 13 | Who may open a signed health declaration | **Unchanged.** Manager and owner, every opening audit-logged, the notice stays visible. |
| 14 | Where events live | **Inside the weekly calendar**, not a menu item of their own — and the calendar gains two interactions: **press an empty slot to create**, and **drag a block to move it**. See §2.6. |
| 15 | Where the year rollover lives | **Inside הגדרות**, with a dashboard banner when a new year is due, the way the setup wizard already works. |
| 16 | Which screen opens on sign-in | **לוח בקרה ראשי** — now that it carries the alerts. Changes today's behaviour, which lands on the weekly schedule. |

This document says what every screen in the manager dashboard is today, every function on it,
what the prototype offers in its place, how the look gets carried across, and what should be
improved on the way past. It covers every screen — including the ones the prototype never drew.

---

## 0. The principle, and why it is not negotiable

The prototype is a better-looking, shallower app. The dashboard is a plainer, deeper one.

Read side by side, the prototype's nine views contain roughly thirty controls that do nothing
but raise a toast, every headline number is a hardcoded literal, and its light theme is
decorative — `theme`/`isLight` appears thirteen times in `SettingsView.tsx` and **zero times in
the other nine views**. Meanwhile the dashboard it replaces distinguishes a 409 from a 422 when
a studio slug collides, collapses four empty retention cohorts into one honest empty state
rather than four misleading 0% bars, and refuses to red-out a background job that is scheduled
on another environment.

So the port runs one way only:

> **The prototype supplies the visual language. The dashboard supplies the behaviour.**
> No ported screen may lose a state, a guard, a refusal or an error message its predecessor
> handled. Where the prototype shows a control the dashboard does not have, it is built for
> real or it is not built at all — it never ships as a toast.

This is the same rule the parent and staff ports ran under, written down because the failure
mode it prevents is invisible to every gate in this repo. Typecheck, lint, the lane checks and
the test suite cannot see that a screen quietly stopped handling an empty list.

### The porting checklist, applied to every screen below

1. **Every function is listed before anything is drawn.** If a control exists today and is not
   in the "after" column, it has been deleted — deliberately, with a reason, or by accident.
2. **Every empty / loading / error / forbidden state survives.** They are enumerated per screen.
3. **Every string moves to `web/packages/i18n/<locale>/<namespace>.ts`.** A lint rule fails the
   build on an inlined one; the prototype is nothing but inlined ones.
4. **Every physical CSS property becomes logical.** The prototype uses `ml-`, `left-`,
   `text-left`. Stylelint catches the CSS half; it cannot read a Tailwind class name, so this
   one is on the reviewer's eyes.
5. **Every number is traced to an endpoint or deleted.** A hardcoded KPI is a lie with a
   gradient on it.

---

## 1. How the look ports — the palette mechanism

This is the part that has a precedent, and it should be followed exactly rather than reinvented.

### 1.1 The dashboard currently has no surface of its own

`web/packages/ui/src/tokens.css` is organised in three tiers (D2):

| Tier | What it holds | Overridable? |
|---|---|---|
| 1 · Brand | `--brand-primary`, `--brand-on-primary` | Yes — studio-owned in v2 |
| 2 · Semantic | `--debt`, `--paid`, `--pending`, `--danger`, `--cancelled` + tints | **Never** |
| 3 · Structural | palette (`--ground`, `--surface`, `--fg`, `--border`, `--accent`, …), type, space, radius, motion | Yes, per surface |

On top of `:root` (light) and `[data-theme="dark"]`, two **surfaces** already re-value the
structural palette:

- `[data-surface="outward"]` — the landing page and parent app; a navy brand, squared 2px radius.
- `[data-surface="staff"]` — the staff app's cool blue-grey, added by the staff redesign.

The dashboard **carries no surface attribute at all** and renders on the bare `:root` warm
palette. That is precisely the hook this redesign needs.

### 1.2 What to do: add a fourth surface

Add `[data-surface="studio-os"]` and its dark twin to `tokens.css`, derived from the prototype's
`src/index.css` `@theme` block. The staff block is the worked example — read it before writing
this one; its comments record every decision this port will face.

**The prototype's source values** (all of which are Material-3 *dark* values — it defines no
light palette at all):

| Prototype token | Value | Maps to |
|---|---|---|
| `--color-background` / `--color-surface` | `#101319` | `--ground` |
| `--color-surface-container-lowest` | `#0b0e14` | (deepest ground, dark only) |
| `--color-surface-container-low` | `#191c22` | `--surface` |
| `--color-surface-container` | `#1d2026` | `--surface-raised` |
| `--color-surface-container-high` | `#272a30` | `--disabled-surface` |
| `--color-on-surface` | `#e1e2eb` | `--fg` |
| `--color-on-surface-variant` | `#bbcabf` | `--text-secondary` |
| `--color-outline` | `#86948a` | `--border-strong` |
| `--color-outline-variant` | `#3c4a42` | `--border` |
| `--color-primary` | `#4edea3` (mint) | `--brand-primary` / `--emphasis` |
| `--color-on-primary` | `#003824` | `--brand-on-primary` / `--on-emphasis` |
| `--color-secondary` | `#ffb95f` (amber) | — see §1.4 |
| `--color-error` | `#ffb4ab` | — **do not map**, see §1.3 |

### 1.3 Four rules the audit test enforces

`tokens.audit.test.ts` reads the stylesheet and will fail the build on each of these:

1. **A surface may re-value a token, never introduce one.** Anything the prototype has that
   `:root` does not (its five-step surface-container ladder) must collapse onto the existing
   `--ground` / `--surface` / `--surface-raised` / `--disabled-surface` rungs.
2. **Every colour taken in light must be re-valued in dark.** Both blocks or neither.
3. **The semantic band is untouchable.** `--color-error: #ffb4ab` is *not* imported.
   A debt chip stays the studio's `--debt` red on this app exactly as it does on the blue staff
   app. This is what keeps a debt banner recognisable across three differently-branded surfaces.
4. **Every overridden token needs a role** in `tokens.roles.ts`, and the audit's own list of
   audited blocks must gain the two new selectors. That file and the test are **shared
   registries** — they change once, in the shell commit, or lanes serialise on them.

### 1.4 Three corrections the prototype needs before it can ship

Following the discipline the staff block's comments record — *"several of the prototype's own
greys and blues do not clear AA on these grounds; those are corrected below rather than shipped
failing."*

- **A light palette must be derived, because the prototype has none.** Its `@theme` is dark-only,
  and `index.html` hardcodes `class="dark"`. Both `outward` and `staff` faced this and derived
  the missing half; do the same rather than shipping a dark-only dashboard (see §1.5).
- **Mint `#4edea3` cannot be an emphasis fill in light mode.** As a background for white text it
  fails badly; as text on a light ground it fails worse. It needs a darkened light-mode
  counterpart, exactly as `staff` darkened its slate-500 to `#5e6e84` "for real headroom above
  the floor."
- **Mint sits dangerously close to `--paid` green.** The dashboard's semantic "settled" chip is
  `#1f6b3f`. A mint-green *brand* beside a green *paid* chip makes a colour that means "the
  brand" and a colour that means "this is paid" nearly interchangeable. Shift the brand's hue
  away from the semantic green, or accept that money state stops being readable at a glance.

### 1.5 Dark mode: the dashboard is already ahead

**Do not port the prototype's theme handling.** The dashboard already has, and the prototype
does not:

- `ThemeProvider` wrapping the app, tracking `'light' | 'dark' | 'system'`.
- Persistence to `localStorage`, resolution against `matchMedia('(prefers-color-scheme: dark)')`,
  `data-theme` written to `documentElement`, and the `<meta name="theme-color">` tag updated.
- `ThemeControl` — a real `role="radiogroup"` of three native radios with a visible resolved-state
  caption — mounted in the desktop sidebar and the narrow-viewport drawer.

The prototype offers three decorative theme cards whose swatches are static divs, wired to a
state that nine of its ten views ignore. Keep what exists; re-value it through the new surface.

### 1.6 Typography and icons

- **The prototype's font does not cover the language the app is written in.** `Plus Jakarta Sans`
  is Latin-only and is set as both `--font-sans` and the body font, so every Hebrew glyph in the
  prototype is silently falling back to system-ui. What you are looking at is not what it
  specifies. `@studio/ui` already ships `@fontsource-variable/rubik`, which has Hebrew. **Keep
  Rubik.**
- **Icons are Material Symbols in the prototype** (14 files, via a Google Fonts CDN link), while
  `lucide-react` sits in its `package.json` imported zero times. The dashboard uses `@studio/ui`'s
  own `Icon`. Adding Material Symbols would be a new UI dependency *and* a CDN font request on a
  manager's first paint. **Recommendation: keep `Icon`, extend it** with the glyphs the redesign
  needs. If the owner wants the Material set specifically, that is a deliberate dependency
  decision, not a side effect of porting a screen.
- **Three dependencies in the prototype are dead**: `@google/genai`, `lucide-react` and `motion`
  are imported nowhere. There is **no AI feature** in the prototype despite the Gemini dependency,
  and no backend AI integration either (`grep` for `genai|gemini|anthropic|openai|llm` across
  `app/` returns nothing). Nothing to port.

### 1.7 The one asset that must not be copied

The prototype's logo is a hotlinked `googleusercontent.com` URL. The dashboard already serves a
real one — `GET /api/v1/studio/logo`, with `POST`/`DELETE` to manage it. Use the real endpoint.

---

## 2. The shell — nav, routes, and where every current destination goes

This is the largest single decision in the port, and everything else is drawn on top of it.

### 2.1 What exists today

The dashboard answers **19 routes** and runs **two different navigation structures**.

**Desktop** — `sideNavGroups()` builds four groups plus a separate settings item:

| Group | Items | Gate |
|---|---|---|
| `daily` | home · schedule (weekly) · attendance · comms | always |
| `club` | students · groups · events · belts (labelled "belts & exams") | always |
| `club` (cont.) | staff · rollover | `canSeeMoney` |
| `money` | billing · prices · items · documents · reports | `canSeeMoney` |
| `platform` | platform | `isPlatformAdmin` |
| *(separate prop)* | settings | `canSeeMoney` |

**Narrow viewports** — a flat 20-entry `NAV` array feeding a drawer, filtered by
`MANAGER_ONLY_KEYS`. It contains entries the desktop sidebar does not: `closures`, `exams`,
`setup`.

**The prototype** has one flat sidebar of nine items, each with a title, a subtitle and a badge.

### 2.2 Three destinations are already half-hidden

These are pre-existing and must be decided deliberately, not rediscovered:

- **`#/setup`** — no desktop sidebar entry at all. Reachable only via the `SetupIncompleteBanner`
  nudge rendered on every manager screen while setup is incomplete, or from the mobile drawer.
- **`#/exams`** — no sidebar link. The `belts` item links to `#/belts` and merely highlights as
  active for both routes.
- **`#/billing/reconciliation`** — no nav entry anywhere. Reached only from inside
  `BillingSection`, or by typing the hash.

### 2.3 The mapping: nine prototype items, nineteen routes

| Prototype nav item | Takes over | Also absorbs |
|---|---|---|
| יומן שיעורים שבועי (`schedule`) | `#/schedule` | `#/closures`, `#/groups`, `#/groups/<id>` |
| חניכים ומתאמנים (`members`) | `#/students` | `#/students/new`, `#/students/<id>`, `#/alerts` |
| לוח בקרה ראשי (`dashboard`) | `#/home` | — |
| חוגים וקבוצות (`programs`) | `#/groups` | `#/belts`, `#/belts/<id>` |
| חנות המועדון (`shop`) | `#/items` | — |
| הודעות ועדכונים (`announcements`) | `#/comms` | — |
| תשלומים וגבייה (`billing`) | `#/billing` | `#/prices`, `#/billing/reconciliation` |
| סטטיסטיקות ודוחות (`statistics`) | `#/reports` | — |
| הגדרות מערכת (`settings`) | `#/settings` | `#/setup`, `#/staff` |

**Seven routes have no prototype home:** `#/attendance`, `#/documents`, `#/events`, `#/exams`,
`#/rollover`, `#/platform`, and the `#/alerts` centre. They are dealt with individually in §4;
none may become unreachable. `unreachable-screens.test.ts` fails the build if a barrel-exported
component is referenced nowhere, and `slot-wiring.test.ts` fails if a slot registration is never
called by the app that mounts it.

### 2.4 What the shell keeps that the prototype does not have

- **Hash routing with sub-routes.** The prototype navigates by `useState<ActiveView>` — no URL,
  no deep link, no back button, no bookmark. Keep routing.
- **`canSeeMoney` / `hasNoRole` / `isPlatformAdmin` gating**, including the forbidden empty state
  for a coach who types a manager-only hash, and the `RefusalScreen` + invite-redemption form for
  a signed-in user with no role in any studio.
- **Live badge counts** from `/api/v1/charges?status=open&limit=200` (debt households) and
  `/api/v1/health-declarations/summary` (missing documents). The prototype's badges are the
  literals `10`, `148`, `6` and `'₪58K'`.
- **`GlobalSearch`** in the header (`/api/v1/search?q=`), which is the only route to several
  destinations that appear in no menu.
- **The `alert-centre` slot**, into which five feature lanes register cards at fixed orders:
  billing debt (10), comms at-risk (15), schedule coach-constraints (17), people health-review
  (20), trials-awaiting (40), upcoming-trials (60). The prototype's dashboard is one hardcoded
  file; replacing the home screen without preserving this registry silently removes five lanes'
  only manager-facing surface.
- **The `setup-wizard` slot** and its seven steps in `WIZARD_STEP_ORDER`: studio · groups · belts
  · prices · items · staff · students.

### 2.5 What the shell gains from the prototype

- **Nav items carry a subtitle**, not just a label. The dashboard already has `hint` strings per
  sidebar item (`common.dash.hint.*`) that are currently used as tooltips — the prototype's
  two-line treatment renders them visibly. This is a genuine improvement and costs nothing.
- **Badges belong on the nav.** The dashboard already computes two; the prototype's design gives
  them a home. Extend to the counts that already exist rather than inventing new ones.
- **One sidebar instead of two navigation systems.** The flat `NAV` and `sideNavGroups()` have
  drifted — `closures`, `exams` and `setup` exist in one and not the other. The redesign should
  derive both from a single source so they cannot disagree again.

### 2.6 The calendar becomes the place things are created — D14

Decision 14 moves events *into* the weekly calendar rather than giving them a menu item, and
asks for two interactions the dashboard does not have today:

- **Press an empty slot to create.** The slot's day and time pre-fill the form, and the manager
  chooses whether they are creating a **session** or an **event**.
- **Drag a block to move it.** Dropping it on another slot changes its day and time.

This is the one genuinely new *behaviour* in the port — everything else in §3 is a restyle or a
rearrangement. Two things make it cheaper than it sounds:

- **Every endpoint already exists.** Creating is `POST /api/v1/sessions` or
  `POST /api/v1/events`; moving is `PATCH /api/v1/sessions/{id}` with new `starts_at` / `ends_at`,
  which is exactly what `SessionPopover`'s move control already calls. No migration, no new route.
- **The move already has a safety story.** A session moved by hand is marked manually-edited, and
  `ImpactDialog` counts manually-edited sessions among the things a schedule-rule change will
  **not** overwrite (§3.3). Drag-to-move inherits that protection for free.

Three rules this interaction must follow, because they are not obvious:

1. **A drag is a real edit and needs the same confirmation a typed move gets.** Dropping a block
   must not silently write; it shows what changed and lets the manager cancel. An accidental drag
   on a trackpad is otherwise indistinguishable from a decision.
2. **Drag is an addition, never the only way.** The belt ladder already sets this precedent —
   `BeltSystemScreen` has drag-and-drop *and* move up / move down buttons, so the feature stays
   reachable by keyboard and on a touch screen. The move fields in `SessionPopover` stay.
3. **A cancelled or past session does not drag.** The block is inert and says why.

Events drawn on the calendar keep their own visual treatment — a competition is not a lesson —
and clicking one opens the event, not the attendance roster.

---

## 3. Every screen

The format is the same throughout. **Now** lists every function that exists today — if a control
is not in this list it does not exist, and if it is here and not in the result, it has been
deleted. **Prototype** says what the new design offers in its place, or that it offers nothing.
**Port** says how the look carries across. **Improve** is what should get better on the way, kept
separate from the port so it can be cut without cutting the port.

---

### 3.1 Weekly schedule — `#/schedule`

`features/schedule/ScheduleSection.tsx` → `WeekBoard.tsx`. Schedule re-parses the hash itself
(`scheduleRoute()`), dispatching to four views: `week`, `groups`, `group`, `closures`.

**Now.** A week board of sessions. Clicking a session opens `SessionPopover` — a focus-trapped
modal (`useModalDialog`) carrying the whole per-session toolkit: the attendance roster with
inline marking and a bulk "all present"; a move control (date, start, end); a room `<select>`
that patches on change; a coach `<select>` that patches on change and assigns *any* staff member,
not only role-holders; a note field; a cancel control requiring a typed reason and a
`ConfirmDialog`; and a delete button that appears only for ad-hoc sessions, also confirmed.

Endpoints: `GET /api/v1/sessions`, `PATCH /api/v1/sessions/{id}`,
`POST /api/v1/sessions/{id}/cancel`, `DELETE /api/v1/sessions/{id}`,
`POST /api/v1/sessions/{id}/notes`, `GET /api/v1/locations`, `GET /api/v1/staff`, plus the
attendance client's roster / mark / bulk-present calls.

States: roster loading (`popover-roster-loading`); action failure (`popover-failed`); roster,
locations and staff fetch failures swallowed deliberately, so a coach's 403 on `/staff` hides the
coach picker instead of breaking the modal.

**Prototype.** `WeeklyScheduleView` (963 lines) — a time-slot × day grid, category filter pills,
a docked KPI bar, a "new lesson" slide-over, and a class modal with an attendance tab and a
details tab.

**Port.** Take the grid: the sticky day-header row, the time-label column, the per-card
discipline colouring, and the live / ended / upcoming card states, plus the docked KPI bar at the
foot. Take the class modal's two-tab split (roster | details) as the new shape of
`SessionPopover` — it is a better organisation of the same controls, which currently all stack in
one column.

**Do not port** the prototype's week navigation, which changes only a label and leaves the same
classes on screen; its month/week/day toggle, which changes nothing at all; or its new-lesson
drawer, which discards the group checkboxes, the SMS toggle and the session type on submit and
hardcodes every created class to Wednesday with 16 registrants.

**Improve.**
- The prototype's KPI bar is a good idea with fake numbers (42 sessions, 368 registrations,
  54.5 coach-hours). Every one is derivable from `GET /api/v1/sessions` and the rosters already
  fetched. Compute them.
- Build a real week navigation, now that the grid has one. `listSessions({from, to})` already
  takes a window.
- The prototype's category pills filter genuinely; the current week board has no filter at all.
  Worth adding, mapped onto `class_id` rather than the prototype's invented `discipline`.

---

### 3.2 Classes and their groups — `#/classes`, `#/classes/<id>`

`features/schedule/ClassesScreen.tsx`, `ClassEditDialog.tsx`, `GroupsAndCycles.tsx`.

**Corrected 2026-09-10, after the first build.** This section originally described one flat
list of every group in the club, and checkpoint 6 built it that way. The owner rejected it
against the prototype: *"first it need to show classes and when entering a class shows the
all… when looking at a created class press opens a small popup to just update, but when
creating a new class the full steps wizard."* They are right, and the prototype says so —
`ProgramsView`'s **curriculum** tab is a grid of programs, and its **groups** tab is what
sits one level down. The screen is now two:

* **`#/classes`** — one card per class: its discipline as an eyebrow, its name as the door,
  its description, whether it is active, and **how many active groups it holds**. Not
  capacity (D2) — a number this screen counts from the group list it already holds.
* **`#/classes/<id>`** — that class's groups, in the card grid described below, titled by
  the class and carrying a way back up.

`#/groups` — the hash the nav pointed at until this checkpoint, and therefore in real
bookmarks — resolves to the classes index rather than 404-ing.

**Both ways in are the wizard — corrected again, 2026-09-10.** The first build put a small
edit popup beside it, on the reading that correcting a name is not a seven-step flow. The
owner cut it: *"remove the popup, it's irrelevant. If want to edit, then the full wizard,
but with the details already in it."* One flow, two entrances:

| | Opens | Writes |
|---|---|---|
| An existing class (`⋯ → עריכה`) | **§3.21's seven steps, pre-filled** at `#/classes/<id>/edit` | `PATCH /classes/{id}`, then each later step's own call |
| A new class (`חוג חדש`) | **The same seven steps, empty** at `#/classes/new` | `POST /classes` on step 1, then the same |

Retiring a class stays on the row menu and is not an edit: it is one field and no flow, and
sending it through seven steps would be the opposite mistake to the one the popup made.

**`PATCH /api/v1/classes/{id}` did not exist.** `ClassUpdate` had been sitting in
`app/schemas/structure.py` since the model landed with no route using it, so a club that
mistyped a class name during setup could not fix it. Added in checkpoint 6 with the same
shape as `GroupPatch` — `model_fields_set` decides, so an absent field leaves its column
alone — the same 409 on a duplicate name that `POST /classes` gives, and manager-or-owner
only, per §3.2's matrix. No migration: every column already exists.

**No per-class colour.** The first build offered a palette of token names (G13 forbids a hex
literal); the owner cut the feature outright — *"and no need class color"*. `class.color`
stays in the schema and nothing writes it, the wizard has no swatch, and every class card
carries the same neutral mark. A tinted badge with nothing behind it would be worse than
none.

**D1's class chips are not on this screen.** They were, in the first build, filtering the
flat list. The classes index *is* that choice, made better — so the chips came out and the
class stopped being repeated as an eyebrow on every card of its own page.

---

#### The group card grid — `#/classes/<id>`

`features/schedule/GroupsAndCycles.tsx`.

**Now.** A table of every group: name (linking to `#/groups/<id>`), its weekly rule labels, its
next session, and a count of students left unscheduled rendered in `--danger` when above zero. A
create-group form (name + class `<select>`) revealed by a button. A per-row `RowActions` menu with
rename (inline `TextField` + save) and retire/revive. A `groups-write-failed` notice on a failed
write.

The unscheduled count is computed by calling `PUT /api/v1/groups/{id}/schedule` with
`apply: false` — a read-only preview used purely as a calculation. Endpoints:
`GET /api/v1/classes`, `GET /api/v1/training-years`, `GET /api/v1/groups/{id}/schedule`,
`GET /api/v1/sessions`, `POST /api/v1/groups`, `PATCH /api/v1/groups/{groupId}`.

States: empty (`schedule.groups.empty`); no loading state; write errors only.

**Prototype.** `ProgramsView` (822 lines) — three tabs (groups / curriculum / staff), KPI cards,
discipline pills, an age-category filter, a search box, group cards with an occupancy bar, and a
trainees drawer.

**Port.** The card grid is a real improvement over a bare table: the four things a manager reads
here are four facts about one group, not a comparison across rows, and a card is where four facts
about one thing belong. **The occupancy bar is not part of it** — see the correction below.

**Improve.**
- **Correction, 2026-09-10.** An earlier draft of this section asked for the occupancy bar and for
  a denominator to feed it. **D2 forbids both** and D2 is the spec: no capacity column, no
  occupancy bar, no `14/15`. Group capacity was cut from the product on 2026-08-27 and the owner
  confirmed the cut again on 2026-09-10. What takes the bar's slot on the card is the count this
  screen already computes and the prototype has no equivalent of — **C12's students left with no
  training day** — which is capacity pressure a manager can act on rather than a ratio against a
  number nobody stores.
- The prototype's three-tab split (groups / curriculum / staff) is **not** taken. Its `curriculum`
  is the belt ladder (§3.9) and its `staff` is the group page's coach assignments (§3.3); both are
  destinations the sidebar already reaches, and a tab strip that navigates elsewhere is not a tab
  strip. What this screen takes instead is D1's **class chips**, which filter the grid in place and
  scale as the club adds classes — the affordance the prototype's five hardcoded discipline pills
  were standing in for.
- Coach and room are read off the group's **next session**, which the screen already fetches, and
  labelled as that session's. Asking `GET /api/v1/groups/{id}/staff` per card would add a fourth
  request per group to a loop that already makes three — the N+1 shape §3.17 flags as a defect.
- The prototype's trainees drawer holds the one genuine empty state in the whole prototype
  ("טרם שובצו חניכים לקבוצה זו"). Keep it.
- **Do not port** its "שבץ חניך חדש" button, which raises a toast and opens no picker; nor its
  Rooms & Tatami panel, which is three hardcoded objects when real rooms exist at
  `GET /api/v1/locations`; nor `ProgramStaffModal`'s head-coach block, which shows the same
  hardcoded phone, email and "₪140/שעה" for every program regardless of which one is open.

---

### 3.3 One group — `#/groups/<id>`

`features/schedule/GroupSchedulePage.tsx`.

**Now.** Four stacked cards. `GroupTrainingPanel` (from the `training` feature): a
`SegmentedControl` for kind (base / extra / private), an invite-only `Switch`, and — only for a
non-invite-only "extra" group — an eligibility checklist of base groups, each toggle replacing the
full list and rolling back on failure. `GroupCoachPanel`: assigned coaches and an assign form
(person `<select>` + lead/assistant radios). The weekly rules editor: per-rule weekday select,
start time, end time, remove; add-rule; effective-from date; a client-side end-after-start
validation; and a "review change" button that never saves directly — it calls
`PUT /groups/{id}/schedule` with `apply: false` and opens `ImpactDialog`. Then the sessions list
for the active training year, scrollable, with status chips and ad-hoc / manually-edited notes.

`ImpactDialog` is the safety mechanism and must survive intact: sessions to create, update and
cancel; the three *protected* counts (past, manually edited, ad-hoc) that a rule change will not
overwrite; a named list of the protected manually-edited sessions; the first affected date; and a
danger `Alert` when the change would leave students with no training day.

States: no active training year (`schedule.group.noActiveYear`); no rules
(`schedule.rules.empty`); validation error as `role="alert"`.

**Prototype.** Nothing. There is no per-group page — `ClassWizard` covers creation, and nothing
covers editing a group afterwards.

**Port.** Card styling and section headers only. The screen keeps its structure.

**Improve.** `ImpactDialog` is the best-designed dialog in the app and the prototype has nothing to
teach it. The one gain available is visual: the prototype's stat-block treatment would make the
three change counts and three protected counts read faster than the current text rows.

---

### 3.4 Closures — `#/closures`

`features/schedule/ClosuresPanel.tsx`. Present in the mobile drawer, absent from the desktop
sidebar.

**Now.** A list of existing closures with date range, reason and source (manual vs holiday preset).
A "show holiday presets" button revealing a fieldset of **unticked** Israeli-holiday checkboxes and
an "apply presets" button. A manual form: from, to, reason. Validation for all three fields and for
end-before-start. An outcome line (`role="status"`) reporting how many sessions were cancelled.

Nothing closes automatically — §5.6 — the manager must tick or type. Endpoints:
`GET /api/v1/closures`, `GET /api/v1/holiday-presets?year=`, `POST /api/v1/closures`.

States: empty (`schedule.closure.empty`); validation errors as `role="alert"`; **no handling for a
failed API call**.

**Prototype.** Nothing.

**Port.** Styling only.

**Improve.** Give the failed `POST` an error state — it has none today, so a closure that fails to
save looks identical to one that succeeded until the list fails to refresh. This screen also
deserves a place in the desktop sidebar; it is manager-only work currently reachable only from the
mobile drawer.

---

### 3.5 Students — `#/students`

`features/people/StudentsScreen.tsx`, with `SharingCards` above it when `canSeeMoney`.

**Now.** A roster table with a search field, a status `SelectField` (lead / trial /
pending_approval / active / frozen / left / lost / any), and a class filter that appears only when
more than one class exists. Row checkboxes drive a bulk bar: a group `<select>`, a "move" button
and a destructive "leave" button, both routed through `ConfirmDialog`, followed by a `bulk-outcome`
report listing how many applied and **naming every refused row with its reason**. Columns: name
(opens the detail), groups, status chip plus an "onboarding" chip when the source is an onboarding
link, document status, plan badge, payment status. Cursor pagination via "load more".

Endpoints: `GET /api/v1/students`, `GET /api/v1/charges?status=open&limit=200`,
`GET /api/v1/groups`, `GET /api/v1/classes`, `POST /api/v1/students/bulk`,
`POST /api/v1/students/{id}/leave`.

States: loading gate; **two distinct empty states** — `people.student.empty` when there are no
students, `people.student.emptyFiltered` when filters exclude them all; a charges-fetch failure
renders `—` in the payment column rather than a fake tick.

`SharingCards`: the onboarding link with its status (inactive / active-with-expiry / permanent) and
registered count, copy, regenerate and revoke; plus the public landing-page link with copy and open.

**Prototype.** `MembersView` (964 lines) — discipline tabs with counts, search, three filter
selects, a bulk bar, a table with per-row WhatsApp / badge / edit icons, pagination, and a slide-in
drawer with four tabs (general / training / finance / health).

**Port.** Take the four-tab drawer as the new shape of the student detail (§3.6). Take the
discipline tabs as **class tabs**. Take the filter row's layout.

**Two corrections found while building checkpoint 3**, both recorded here rather than discovered
again later:

- **The class tabs carry no counts.** The prototype puts one on every chip. `GET /api/v1/students`
  returns a cursor page with no total, so the screen's own `baselineCount` is only knowable when
  the whole roster fits in one page. A per-class count is therefore either N extra requests or an
  invented number, and §0's rule is that every number is traced to an endpoint or deleted. A count
  endpoint is the honest way to add them.
- **The per-row WhatsApp action is not buildable yet.** An earlier draft of this section called it
  "a real `wa.me` link built from the student's phone" — the prototype's is, ours cannot be:
  `StudentSummaryOut` carries `guardian_display_names` and no phone number at all. It needs a
  `guardian_phone` on the list response, which is a serializer change plus a regenerated
  `api-client` — and `main` owns that package. **Deferred to checkpoint 15**, which already
  touches the backend-adjacent screens, rather than bolted onto a screen checkpoint. The student
  detail keeps its own WhatsApp link, where the phone *is* loaded.

**Do not port**: its pagination (buttons 2, 3 and 12 have no handlers at all; the prev arrow is
`disabled` and the rest are decorative); its "export data" button (toast, no file); its bulk SMS,
health-reminder and move-group actions (all toast-only, while the real bulk move already works);
its "send signature link" button (toast); and its group filter, which advertises
"כל הקבוצות (12)" while offering two options.

**Improve.**
- The prototype's "add new student" button opens the *first existing student* in edit mode. The
  real one navigates to a real form. Keep the real behaviour, take the button's placement.
- Add real bulk messaging only if it is built for real: `POST /api/v1/announcements` with a
  student-scope audience exists, and `POST /api/v1/students/{id}/health-declaration/reminder`
  already sends a health reminder one student at a time. Both are one loop from being honest.
- The class filter hides itself when there is one class. With tabs, show it always.

---

### 3.6 One student — `#/students/<id>`

`features/people/StudentDetailScreen.tsx`.

**Now.** One scrollable column of cards, all rendered at once. Header: name, status chip, belt bar,
and a frozen notice with the `frozen_until` date. Groups card: live enrolments with
`attends_weekdays` (either "all days" or named weekdays) and the weekly volume. `ClassPricesCard`
(owned by billing). Guardians card: display name, or email plus a "not registered yet" hint, or a
"no contact info" fallback, with the primary guardian flagged. Attendance card: an
`AttendanceStrip` of the last 12 marks across four states (present / absent / notified / unmarked)
with its own empty state. Status-history card. Then three action groups, each collapsed to a single
button that expands into an inline form — freeze (from/to dates), convert (group select), mark-lost
(reason, destructive) — the "second press is confirmation" pattern rather than modals.

Endpoints: `GET /api/v1/students/{id}`, `/enrollments?student_id=`, `/status-history`,
`/price-plan`, `/groups`, `/attendance`, `POST .../convert`, `.../freeze`, `.../mark-lost`.

States: a single loading placeholder gates the whole screen; per-section empty states. **Known
defect: there is no error state.** The top-level `Promise.all().catch(() => undefined)` leaves
`student` null, so a failed load shows the loading placeholder forever.

**Prototype.** `MembersView`'s slide-in drawer: header with avatar, name, badge and status; four
tabs; a footer with save, WhatsApp and close; and an edit-mode toggle switching inputs between
read-only and editable.

**Port.** The four-tab organisation — general, training, finance, health — replacing the single
scroll. The header with the avatar. The explicit read-only / edit-mode toggle, which the current
screen lacks entirely (its fields are simply not editable). The footer WhatsApp link.

**Do not port**: the "recharge now" button (toast, does not clear the debt); "update credit card
details" (toast); "view form" on the health tab (toast, opens nothing — the real screen has a
working authenticated PDF fetch, §3.11); and the emergency-contact field, which the prototype
renders `readOnly` even in edit mode.

**Improve.**
- **Fix the missing error state.** This is a real defect found during this audit, not a redesign
  item: a failed fetch is indistinguishable from a slow one, forever. Failing test first.
- The prototype shows `school` and the real `Student` has no such field — the staff port already
  recorded this. Neither a school nor a school-class is rendered.
- Make the guardians card actionable. `POST` / `DELETE /api/v1/students/{id}/guardians` and
  `.../set-primary` all exist and nothing on this screen calls them.

---

### 3.7 Add a student — `#/students/new`

`features/people/AddStudentScreen.tsx`.

**Now.** Three fields: full name (split into first/last on submit), an "18 and over" checkbox
deciding whether the guardian relation is `self` or `parent`, and a guardian email. On success the
screen swaps to a done state showing either the invitation link with a copy button and
email-sent / not-sent / not-configured messaging, or a "matched an existing person" message when no
token came back. Below the form, always, `ImportStudentsPanel`: a CSV template download
(BOM-prefixed for Excel and Hebrew), a file picker with a strict header check, a preview table with
a per-row state machine (pending → sending → created / failed), and a **sequential** import —
deliberately not parallel, so sibling-matching by email works.

Endpoints: `POST /api/v1/students`, once per row.

States: sending disables submit; `add-student-error` alert; `import-parse-error` for a bad header
or an empty file; per-row failure states.

**Prototype.** Nothing real — its "add" button reopens an existing member.

**Port.** Styling only.

**Improve.** The CSV import is a genuinely good feature buried at the bottom of a form. Give it its
own card and a place in the students screen's header.

---

### 3.8 Alert centre — `#/alerts`

`features/people/AlertCentre.tsx`.

**Now.** A container that owns no logic: it renders `useSlot('alert-centre')` and whatever lanes
have registered, in order — billing debt (10), comms at-risk (15), schedule coach-constraints (17),
people pending-health-review (20), trials-awaiting-decision (40), upcoming-trials (60). Its only
own state is `alerts-empty` when nothing is registered.

The people-owned cards: **pending health review** lists student, group, plan, monthly amount,
waiting-since date, a count of "yes" health answers (never the answers), an approve button with
expand-to-confirm, and a `tel:` link. **Trials awaiting decision** offers convert (group select) and
mark-lost (reason) per row. **Upcoming trials** is read-only with an override badge.

Several registered cards deliberately render `null` rather than an empty state — the comment
explains why: *"a row that never requires a decision is how that list stops being scanned."*

**Prototype.** `DashboardView`'s "urgent attention tray" — two hardcoded items, one of which
("mark as delivered") sets a local boolean and disables itself.

**Port.** The tray's visual treatment — urgency colouring and a per-item action button — reads
better than the current stack of cards. Apply it to the real slot contents.

**Improve.** The alert centre is a separate route reached from the nav, while the prototype puts
urgency on the landing screen. **Recommendation: render the `alert-centre` slot on `#/home`** and
keep `#/alerts` as the full list. That is the prototype's actual insight, and it costs one slot
call. The registration orders and the lanes that own them do not change.

---

### 3.9 Belts and exams — `#/belts`, `#/belts/<classId>`, `#/exams`, `#/exams/<id>`

`features/belts/BeltsIndex.tsx`, `BeltSystemScreen.tsx`; `features/events/ExamsScreen.tsx`,
`ExamEligibilityScreen.tsx`.

**Now.** `BeltsIndex` is a class picker — a ladder is scoped to one class. `BeltSystemScreen` is the
ladder editor: a table of ranks with colour swatch, name, kyu and holder count; per-row move up /
move down / delete, where delete is **refused client-side when `holders > 0`**; drag-and-drop
reordering *in addition to* the buttons, so the feature stays keyboard- and touch-reachable; and an
add form with a name, an optional kyu, a bounded eight-colour palette (no free-text hex) and a live
`BeltBar` preview.

`ExamsScreen` lists `type: 'belt_exam'` events split upcoming/past, with draft-status copy
explaining that a draft exam is hidden from parents, plus an inline create form.
`ExamEligibilityScreen` is the candidate table: per-row checkbox disabled when not eligible, a belt
transition display, months-at-rank, a readiness chip, and a confirm dialog (`role="alertdialog"`)
that records results and promotes the whole selected batch in one call.

Endpoints: `GET`/`POST`/`DELETE /api/v1/belt-ranks`, `POST /api/v1/belt-ranks/reorder`,
`GET /api/v1/belt-presets`, `POST /api/v1/belt-ranks/seed`, `GET /api/v1/events?type=belt_exam`,
`GET /api/v1/events/{id}/eligibility`, `POST /api/v1/events/{id}/exam-results`.

**Prototype.** `ProgramsView`'s curriculum tab shows a belt progression block per program, and
`Program.trackType` offers three progression systems: `belts`, `levels`, `caps`.

**Port.** The curriculum tab's progression strip — a horizontal run of coloured belt chips with
names — is a better read of a ladder than a table, and should become the ladder's display mode,
with the table kept for editing.

**Do not port** `trackType: 'levels' | 'caps'`. The backend models one ladder shape (`belt_ranks`,
ordered, per class). Two more progression systems is a data-model change, not a screen.

**Improve.** `PATCH /api/v1/belt-ranks/{id}` exists in the client and **no screen calls it** — a
rank can be created and deleted but never renamed or recoloured. A real gap worth closing.
`#/exams` also deserves its own sidebar entry; today it has none.

---

### 3.10 Events — `#/events`, `#/events/new`, `#/events/<id>`

`features/events/EventsScreen.tsx`, `EventForm.tsx`, `EventPage.tsx`.

**Now.** A filterable roundup (six types: competition, belt_exam, seminar, joint_training, trip,
other) split upcoming/past, each an `EventCard` with a date badge, type tag, status chip, an RSVP
`ProgressBar` of confirmed against invited, pending and declined counts, and draft-consequence copy.

`EventForm` is a two-column create screen: a type radio grid; details (name, starts, ends, RSVP
deadline); a location `SegmentedControl` (club / external) revealing a free-text field;
`EventTargetPicker` (everyone vs chosen, with class checkboxes, group checkboxes and a student
search); a consent `Switch` revealing a 4,000-character consent text; a fee `Switch` revealing a
decimal fee field; and a parent-details field. The right column is a **live preview of what the
parent app will show**, including two deliberately-disabled RSVP buttons. Publishing is blocked
client-side when the audience reaches nobody, with a named alert rather than a silent no-op.

`EventPage` is KPI tiles (confirmed / declined / pending / awaiting-consent), a "remind
non-responders" button disabled at zero, and the roster table with RSVP, consent, payment (only
when `seesMoney`) and attendance columns.

**Prototype.** Nothing. Decision 4 of the staff redesign folded events into the session list; there
is no manager-side event surface in this prototype at all.

**Port.** Card and tile styling only.

**Improve.** `POST /api/v1/events/{id}/attendance` exists in the events client and **no screen
calls it** — event attendance can be marked from the staff app but not from the dashboard. Worth
adding to `EventPage`, where the roster already is.

---

### 3.11 Documents — `#/documents`

`features/health/DocumentsSection.tsx` → `DocumentsScreen.tsx` / `TemplateEditor.tsx`.

**Now.** A compliance table of health-declaration status per student — deliberately showing **no
medical content**. Four filters (all / missing / trial_signed / signed), summary counts, a
per-student reminder button, a group "chase" button that reminds everyone outstanding, and, for
signed declarations, a "view full" button that opens a tab and fetches the PDF as an authenticated
blob (not a bare `href`, so the bearer token travels) with an always-visible audit notice beside it.

`TemplateEditor` is a full-screen swap, not a modal: per-section question cards each with a label
field, a "flag this question" checkbox and a remove button; add-question per section; save draft and
publish, where publishing reports how many existing declarations were recomputed.

Endpoints: `GET /api/v1/health-declarations/summary`,
`POST /api/v1/students/{id}/health-declaration/reminder`,
`GET /api/v1/students/{id}/health-declaration/pdf`, `GET` / `PUT /api/v1/health-templates/{id}`,
`POST /api/v1/health-templates/{id}/publish`.

States: loading; error (`role="alert"`); **two empty states** — truly empty vs filtered-empty; and a
per-row PDF failure.

**Prototype.** Nothing. `Member.healthComplete` and `healthExp` appear as a column and a drawer tab,
and its "view form" button raises a toast.

**Port.** Styling only. The status chip mapping (missing → debt tone, trial_signed → pending, signed
→ paid) already reads well and keeps its semantics under the new palette — which §1.3 guarantees,
since the semantic band is never re-valued.

**Improve.** Nothing structural. This screen is careful: it shows compliance without ever showing a
minor's medical answers, and the audit notice sits beside the button rather than behind it. Do not
"simplify" it.

---

### 3.12 Announcements — `#/comms`

`features/comms/CommsSection.tsx` → `AnnouncementsScreen.tsx`.

**Now.** A composer: subject, multiline body, an audience `SegmentedControl` (studio / class /
group — studio and class only when `canPublishStudioWide`), a row of scope buttons, a **live
recipient count** from `POST /api/v1/announcements/audience-preview`, and a publish button disabled
until title, body and audience are all set. Below it, the list of past announcements, each clickable
when published, and two panels: `DeliveryReport` and `InstallState`.

`DeliveryReport` shows sent, received and in-flight counts, and for every missed recipient a name, a
phone and a **reason** — `no_token`, `denied` or `failed` — with a copy-numbers button and a
WhatsApp share link. `InstallState` shows who has installed the PWA, broken down by iOS / Android /
web, and names the families who have not, with phone numbers, because calling is the only remaining
channel.

States: `LoadFailed` with retry on the list; empty state; delivery-report and install-state fetch
failures swallowed to `null`.

**Prototype.** `AnnouncementsView` (853 lines) — KPI cards, category filter pills, a feed of
announcement cards with copy-text and re-broadcast buttons, and a **four-step broadcast wizard**:
type and templates → content with dynamic tags and a CTA → audience → channels with a live
mobile-notification preview.

**Port.** The four-step wizard is the strongest single idea in the prototype and should replace the
flat composer. Take all four steps, the five message templates, the dynamic-tag pills that insert
`{שם_חניך}` into the body, and — especially — **the live phone-notification preview**, which shows a
manager what a parent will actually receive. Take the feed's card treatment and its copy-text button
(a real `navigator.clipboard` call).

**Do not port**: its "re-broadcast" button (toast only — though `POST /announcements/{id}/resend`
exists and could make it real); its hardcoded audience counts (14 for debt, 9 for missing health, 72
for judo, regardless of the roster) when `audience-preview` returns the true number; its "98.4%
delivery" and "148 connected" KPI cards; and its scheduling step, which promises timing in the step
subtitle and renders no date control at all.

**Improve.**
- Wire step 3's audience to `audience-preview` — the prototype invented what the dashboard already
  computes correctly.
- The wizard's audience segments (debt, missing-health) are *better* than the current
  studio/class/group scopes, and they are computable: open charges and the health summary already
  back the two sidebar badges. Adding them to `AnnouncementScope` is backend work worth doing.
- Make "re-broadcast" real with the existing resend endpoint, or leave the button out.
- `InstallState` and `DeliveryReport` are strong features stacked below a composer where nobody
  scrolls. The prototype's KPI-card treatment is the right home for their headline numbers.

---

### 3.13 Reports — `#/reports`

`features/reports/ReportsSection.tsx`.

**Now.** A period `SegmentedControl` (month / season / year), a CSV export guarded against a null
period so an empty file is never downloaded, and a "send monthly report" button behind a real
confirm dialog. Then: `KpiStrip` — active students, churn (in permille, with the tone *inverted* so
rising churn reads as danger), average monthly revenue, and average attendance with a `<details>`
disclosure explaining that unmarked marks are excluded. `RevenueChart` — twelve months of collected
vs outstanding, dependency-free CSS bars, with a visually-hidden description per column.
`RetentionPanel` — four tenure buckets with cohort sizes, the weakest highlighted, null cohorts shown
as "no cohort" rather than a misleading 0%, and all-null collapsing to a single empty state.
`ByClassPanel` — per-class students, billed and settled, with a **server-computed** total that is
deliberately never summed client-side, because a student in two classes would be double-counted.
`BeltPromotionsChart` — promotions per rank, belt-coloured with a contrast ring.

Endpoints: `GET /api/v1/reports/{studioId}/overview?period=`, `.../overview.csv`,
`.../by-class?year=&month=`, `POST .../send-monthly`.

States: `LoadFailed` with retry; a `byClass` failure is best-effort and drops only its own panel;
distinct empty states for no-period, season-missing, chart-under-three-months, belts-empty,
belts-all-zero and retention-all-null.

**Prototype.** `StatisticsView` (486 lines) — a time-range toggle, five KPI cards, a
revenue-vs-expenses bar chart with hover tooltips, a revenue-distribution breakdown, and a
**per-program profitability table** with coach costs and profit per program.

**Port.** The chart's hover tooltip, the revenue-distribution progress bars, and the five-card KPI
strip layout. The prototype's charts look considerably better than the current ones, and the
underlying data already exists.

**Do not port**: the time-range toggle (month/quarter/year changes nothing — every number is
static); the "export to Excel" button (toast); the three "insight" cards (hardcoded prose); and
above all the **per-program profitability table**, which needs coach wages. See §5.

**Improve.**
- The prototype has no retention and no belt promotions; the dashboard has both. Keep them, and give
  them the prototype's chart styling.
- Revenue-vs-*expenses* is unbuildable, but revenue-vs-*debt* is exactly what `RevenueChart` already
  draws. The prototype's two-series treatment applies directly.

---

### 3.14 Platform — `#/platform`

`features/platform/PlatformSection.tsx`.

**Now.** Gated on `isPlatformAdmin` — a row on the global `auth_identity`, not a studio role — with
its own refusal state for anyone who types the hash. `OpsHealthPanel`: an overall status chip, an
email-configured indicator, a table of scheduled jobs with name, derived state (failing / overdue /
elsewhere / ok), last success — where **"never run" is rendered as a finding, not a blank** — cron
expression and tolerance; then a list of operational signals. Jobs scheduled on another environment
are deliberately never shown red.

`StudiosPanel`: create a studio (name, slug, default locale) with **named refusals for 409
slug-taken and 422 slug-invalid that keep the form populated**; invite an owner; a shown-once
invitation token card; a studios table; and suspend behind a dialog that names the consequence —
"this club disappears from every studio switcher its members have" — rather than asking "are you
sure".

Endpoints: `GET /api/v1/platform/health`, `GET` / `POST /api/v1/platform/studios`,
`POST /api/v1/platform/studios/{id}/invite-owner`, `POST .../suspend`.

**Prototype.** Nothing. This is a cross-studio operator console; the prototype models a single club.

**Port.** Styling only, and only after every manager-facing screen is done. One person sees this
screen.

**Improve.** Nothing. Its error handling is the best in the app and is the model the rest should
copy.

---

### 3.15 Home — `#/home`

`features/home/ManagerHome.tsx`. **The single most-changed screen in this port**, and the one the
prototype has the most to say about.

**Now.** A read-only aggregation where every number links to the screen that owns it. It performs
no mutation at all — every control on the screen is a hyperlink.

- **Money band** — three `StatTile`s, each linking to `#/billing`: debt (`MoneyDisplay`, tone
  `debt`), collected (tone `paid`), and overdue *families* (a household count, not a student
  count, with its own hint saying so).
- **Today's classes** — a `Table` of group, time range, hall (or `—`), and lead coach, where an
  uncovered session renders a `debt`-toned `StatusChip` reading "no coach" rather than a blank.
  Empty state when there is nothing today. A "full week" link to `#/schedule`.
- **Attendance chart** — per-group bars over a 30-day trailing window. A group with no rate draws
  **no bar and the text "no rate"**, never a zero-height bar. When every group is unmarked the whole
  chart collapses to one empty state, and the "see all" link is hidden — there is nothing to see.
- **Needs attention** — one row per nonzero count: missing health declarations (→ `#/documents`),
  sessions with no coach (→ `#/schedule`), unmarked past sessions (→ `#/attendance`). **Rows with a
  zero count are filtered out entirely.** Each carries a `StatusChip` with a severity *word*, never
  colour alone.

Endpoints, resolved with `Promise.allSettled` so one failure costs only its own region:
`GET /api/v1/reports/{studioId}/monthly?year=&month=`, `GET /api/v1/charges?status=open&limit=200`,
`GET /api/v1/health-declarations/summary`, `GET /api/v1/sessions?from=&to=&limit=200`,
`GET /api/v1/attendance/report?from=&to=`. **Nothing on this screen is hardcoded.**

States: no loading indicator — each region renders nothing until its own promise resolves,
deliberately; three distinct empty states; a whole-page `LoadFailed` with retry; per-region failure
is silent.

**Prototype.** `DashboardView` (598 lines) — an executive header with a greeting and a live-sync
indicator, five discipline filter pills, four KPI cards, an urgent-attention tray, today's floor
schedule, and a 30-day attendance chart with a per-discipline legend.

**Port.** This is where the prototype earns its keep. Take the whole layout: the executive header,
the four-KPI card row, the urgent tray, the two-column split of today's schedule against the
attendance chart, and the chart's legend and distribution bars. The prototype's arrangement of
exactly this information is better than the current one, and — uniquely on this screen — the
underlying data already exists for nearly all of it.

**Do not port**: the refresh button (sets a string to "just now" and toasts, refreshing nothing);
the five discipline pills (they recolour themselves and filter nothing below them); the
"mark as delivered" tray action (a local boolean); the "print training log" and "absence report"
links (toasts, no document); and every hardcoded KPI figure — ₪525, ₪34,800 of ₪39,500, 148
trainees, 10 pending logs, 91.4% attendance. The real screen already computes all of these.

**Improve.**
- **Render the `alert-centre` slot here.** The prototype's urgent tray is the right instinct and the
  dashboard already has six lanes' worth of real alerts registered — they are just on a different
  route nobody visits. This is the single highest-value change in the redesign, and it costs one
  slot call (see §3.8).
- The prototype's live-sync indicator is fake, but the honest version is cheap: a "last updated"
  timestamp with a real refetch behind it.
- The greeting ("בוקר טוב, לביא טמיר") is worth keeping — the session already knows the name.

---

### 3.16 Attendance — `#/attendance`

`features/attendance/AttendanceSection.tsx` → `AttendanceReport.tsx`, plus `QuickViewRoster`.

**Now.** The chase screen, over a manager-controlled date range defaulting to the last seven
completed days (never "tomorrow", since a future day cannot be late).

- A `DateRangePicker` with an inverted-range error and a **400-day ceiling** that names the limit.
- A CSV export with its own failure state.
- **Unmarked sessions** — a checkbox per row, a bulk "remind coaches" button that appears only once
  something is selected, a per-row `RowActions` menu with "remind coach" and "mark here", and a
  per-row outcome chip distinguishing **sent / quiet-hours / failed** — a 409 from the reminder
  endpoint means quiet hours, not an error. A standing paragraph states the rule outright:
  *unmarked is not the same as absent*.
- **Quick View** — a focus-trapped roster popover where clicking a student cycles
  `unmarked → present → absent → unmarked`, except that a parent-reported absence is **inert** and
  cannot be overridden by a click. A "mark all present" button with a hint saying it will not
  override a parent's advance notice. Closing always refetches.
- **Per-group rates** — a table with a `ProgressBar`, a "no rate" text where a rate is null, and a
  `marked/sessions` coverage column.

Endpoints: `GET /api/v1/attendance/report?from=&to=`, `GET /api/v1/sessions/{id}/attendance`,
`POST /api/v1/attendance/batch`, `POST /api/v1/sessions/{id}/attendance/bulk-present`,
`POST /api/v1/reminders/sessions/{id}/coach`, `GET /api/v1/exports/attendance`.

**Prototype.** `QuickAttendanceModal` (189 lines) and the class modal's attendance tab — three
explicit buttons per student (present / late / absent), a "mark all present" button, and a 3-up
stat header.

**Port.** The prototype's **three explicit buttons per student are better than a click-cycle.** A
cycle requires the user to know the order and to click up to three times to reach a state; three
labelled buttons are one click and self-describing. Take them. Take the 3-up stat header too.

**Do not port** the modal's footer "save attendance" button, which does nothing — the marks were
already saved per click — nor its uncontrolled notes field, which is never persisted anywhere.

**Improve.**
- Preserve the parent-report inertness when moving to three buttons: the absent button on a
  parent-reported absence must stay disabled with a reason, not silently do nothing.
- The group-rates table renders its empty state while still loading, so an empty table briefly
  reads as "no data" rather than "not yet". Give it a loading state.
- The prototype's modal is reachable from a session card; the dashboard's is reachable from the
  unmarked list. Both should work — add "mark here" to the week board's `SessionPopover` roster tab
  (§3.1), which is the same component.

---

### 3.17 Rollover — `#/rollover`

`features/rollover/RolloverWizard.tsx` and seven step components.

**Now.** The annual training-year rollover — seven steps, a rail of chip-buttons with a **status
word on each** (never colour alone), a summary card of five server-computed counts, and a
completion line the server decides. Two steps (`year`, `generate`) are *derived* and cannot be
marked by hand; the server answers 409 if you try, which is why the UI never offers it.

The steps: **year** (create or summarise the draft year) · **closures** (holiday presets pre-ticked
except summer break, plus manual closures) · **groups** (rename, retire/revive with an undo link,
create; a `ConfirmDialog` only when the batch contains a retire) · **students** (per-enrolment
move-to select and a "not returning" checkbox, with an explicit "no automatic promotion" statement;
confirm dialog only when someone is marked not-returning) · **prices** (versioned — old plans are
closed, never overwritten; a confirm dialog always) · **generate** (materialise sessions) ·
**announce** (compose and publish, then activate the year).

Every bulk step ends in a `BulkOutcomePanel` reporting how many applied and listing every refusal
with a machine-readable reason.

Endpoints: `GET /api/v1/rollover/{yearId}`, `PATCH .../steps/{stepId}`, `POST .../groups`,
`.../students`, `.../prices`, `.../announce`, `GET`/`POST /api/v1/training-years`,
`POST /api/v1/training-years/{id}/generate-sessions`, `.../activate`.

**Prototype.** Nothing. There is no rollover concept in the prototype at all.

**Port.** The prototype's `ClassWizard` stepper — the numbered progress indicator with a title and
subtitle per step, and clickable completed steps — is a better rail than the current chip row.
Take the stepper's visual treatment; keep the status words, which the prototype does not have.

**Improve.** Step 4 issues one `GET /api/v1/enrollments?student_id=` **per active student** — an
N+1 the code marks as deliberate. With a few hundred students it is a few hundred requests. Worth
revisiting, but as backend work, not as part of a screen checkpoint.

---

### 3.18 Staff — `#/staff`

`features/staff/StaffScreen.tsx`.

**Now.** Three `StatTile`s (people, total weekly hours, coverage), a danger `Alert` listing every
**uncovered group as a link to that group**, a shown-once invitation-token card, an invite form
(email, first, last, role checkboxes over manager / lead_coach / assistant_coach), and a table with
person, role, hours, groups (`ChipList` capped at two plus "+N"), status and a `RowActions` menu.

The menu differs by row type: a pending invitation offers resend and revoke; a staffed member
offers "edit roles" (an inline editor with role checkboxes and a **read-only list of the
permissions those roles grant**) and deactivate — hidden for the owner, and on a `sole_lead_coach`
refusal it **names the groups that would be orphaned**.

Endpoints: `GET /api/v1/staff`, `POST /api/v1/staff/invitations`, `.../{id}/resend`,
`DELETE .../{id}`, `PATCH /api/v1/staff/{personId}`, `POST .../deactivate`.

**Prototype.** `SettingsView`'s staff tab — a hardcoded list of three people with no actions at all,
and an "add staff member" button that raises a toast.

**Port.** Nothing. The prototype's staff surface is strictly less than what exists.

**Improve.** The coverage alert is one of the best affordances in the app — it names the problem and
links to the fix. The prototype's stat-card treatment would make the three tiles above it read
better, and that is the whole of what this screen gains.

---

### 3.19 Settings — `#/settings`, and the setup wizard — `#/setup`

`features/settings/SettingsScreen.tsx`, `StructurePanel.tsx`; `packages/ui/src/setup-wizard/`.

**Now.** A left rail of nine sections, of which **only three render in place** — `studio`,
`structure` and `payments` — while the other six are links out to the screens that own them:
prices → `#/prices`, documents → `#/documents`, attendance → `#/attendance`, notifications →
`#/alerts`, users → `#/staff`, belts → `#/belts`.

The **studio** panel autosaves every field on blur with no save button, reporting through a
`role="status"` line: logo (fetched authenticated, not a bare `<img src>`, with 415/413 mapped to a
named rejection), name, phone, address, email, three parent-locale switches where **the studio's
own default locale is locked and says why**, landing headline, landing about, landing trial-steps,
and a landing photo gallery with per-photo delete and server-code-mapped errors
(`too_many_photos`, `unsupported_image`, 413).

The **structure** panel manages classes and halls. The **payments** panel composes two billing
components: `StandingOrderLinksPanel` and `PrepayTermsPanel`.

One absence is deliberate and load-bearing: **there is no "block attendance without a health
declaration" toggle.** The code cites §5.5 — such a setting would either do nothing or contradict
the spec — and a contract test fails if it reappears.

`#/setup` is a seven-step wizard registered through the `setup-wizard` slot in a fixed order:
studio · groups · belts · prices · items · staff · students. Steps register themselves; the wizard
file is never edited to add one. It has a step rail with status dots, a progress bar, "continue
later" and "open dashboard" exits, and a fallback for a step the running app has not registered.

Endpoints: `GET`/`PATCH /api/v1/studio`, `POST /api/v1/studio/logo`,
`POST`/`DELETE /api/v1/studio/landing-photos`, `GET`/`POST /api/v1/classes`,
`GET`/`POST /api/v1/locations`, `GET /api/v1/setup`, `PATCH /api/v1/setup/steps/{id}`,
`POST /api/v1/setup/dismiss`.

**Prototype.** `SettingsView` (589 lines) — five tabs: club profile, billing and invoices,
notifications and SMS, theme and language, staff and permissions.

**Port.** The five-tab layout is a better organisation than a rail where two-thirds of the entries
navigate away. Take the tabs. Take the theme-and-language tab as the home for `ThemeControl`, which
currently lives only in the sidebar.

**Do not port**: its billing tab's processor card, which is static markup permanently reading
"מחובר ופעיל" regardless of any real state; its "add staff member" button (toast); or its hardcoded
three-person staff list. `#/staff` (§3.18) is the real thing and the settings tab should link to it.

**Improve.**
- **`GET /api/v1/studio` failure is swallowed** — the panel never leaves its loading state. Same
  defect class as §3.6. Fix it with a failing test first.
- The prototype's `ClubSettings` names four settings that do not exist in the backend. **D11
  settles all four:** `autoDebtReminders` is built into `GET/PATCH /api/v1/billing/settings` and
  `healthCertExpiryAlertDays` into `GET/PUT /api/v1/attendance/settings`, both of which already
  exist and already carry sibling settings. `allowOnlineStorePurchases` and `smsSenderName` are
  **not built** — the second was briefly kept and then removed the same day, because a field
  naming the sender of a message the product never sends configures nothing. See §4.
- **The business number (ח.פ / עוסק מורשה) is added** — D12. It is a new key under the studio's
  settings JSON rather than a column, which is where `billing` settings already live, so it needs
  no migration.
- `StructurePanel` shows neither a loading nor an empty state, so "no classes yet" and "still
  loading" and "the fetch failed" are three identical screens. Worth fixing while it is being
  restyled.

**The setup wizard is its own checkpoint (17), and this is why.** `SetupWizard.tsx` is not a screen
in this app — it lives in `packages/ui/src/setup-wizard/` and is mounted by **both** the dashboard
and the staff app, deliberately, because "an owner doing setup on a phone is a normal case rather
than an error" (the file says so in its own header). A composition change here lands in the staff
app on the same commit. That makes it the one checkpoint whose proof needs **two** screenshots of
the same change, and it is why it is not folded into checkpoint 15 with the other settings screens.

What it has today and must keep: a rail whose nodes are **buttons with a status word**, never colour
alone; a `—` for skipped distinct from `✓` for done, because an owner reported that sharing one mark
made "finished them all, still says 6/7" unreadable; resume onto the first *unanswered* step rather
than step 1; `reopen` to un-answer a step ticked by mistake; a re-read on window focus so a step
finished on the dashboard shows done on the phone; a `LoadFailed` with retry; and — for a step the
running surface has not registered — a body that names where the step *is* edited and links there,
rather than a dead rail button. Every one of those is a defect report that was already paid for.

What it takes from the prototype: the **stepper**. The current rail is a vertical `<ol>` of dots;
`ClassWizard`'s is a horizontal numbered progress indicator with a title and a subtitle per node and
a connecting rule between them. That treatment is better and it is what §3.17 already asked for on
rollover's behalf. **Build it once**, in `packages/ui`, as a stepper that takes nodes and renders
them — status word included, which the prototype does not have — and let setup, rollover (§3.17) and
the class wizard (§3.21) all mount it. Three wizards, one stepper, or this port has copied a
progress bar three times.

The step *order* does not change and is not the stepper's business: steps register themselves
through the `setup-wizard` slot at fixed orders, and `SetupWizard.tsx` "is never reopened for them",
which is the whole reason they are slot entries and not a switch. The stepper renders whatever the
slot yields.

---

### 3.20 Billing — `#/billing`, `#/billing/reconciliation`, `#/prices`, `#/items`

`features/billing/` — the largest vertical, twenty components.

**Now, `#/billing` (collections).** `BillingSection` fetches and composes three screens:

- **`PaymentPromisesPanel`** — the queue of parents who said they would pay by cash, cheque or
  standing order, with a method filter and confirm/decline per row. It renders `null` when there is
  nothing *and no filter*, but shows a real empty state when a filter yields zero — a deliberate
  distinction.
- **`PlanChangesPanel`** — plan-change requests a manager must settle by hand, showing the signed
  monthly difference.
- **`CollectionsScreen`** — one row per payer household. Four KPI tiles; a **"children nobody can
  bill"** panel that appears only when non-empty, each row linking to that student; an accountant
  CSV export with its own failure state; a "run charges" button behind an inline confirmation; a
  bulk reminder button; per-row send-reminder, record-payment and an expandable charge list loaded
  lazily.
- **`RecordPaymentDialog`** — date, amount (converted to agorot with `Math.round(shekels * 100)`),
  a method radiogroup (cash / cheque / bank transfer), and a note. It **never lets the manager pick
  which charges a payment settles** — allocation is oldest-first and the dialog says so, reporting
  any surplus as unallocated.

**Now, `#/billing/reconciliation`.** Two columns — unmatched uPay IPN payments with a
confirm-match and an ignore action, and payers expected to pay this month — under a standing
disclaimer that matching is never automatic.

**Now, `#/prices`.** Plans grouped by class, with an **unfiled-plans warning** and a per-plan
"file into class" select. Clicking a plan opens an inline close-card: plans are **versioned, never
edited** — closing one returns its successor. An add-plan card with a frequency picker, class
select and monthly amount. `StandingOrderLinksPanel` at the foot, autosaving each plan's הוראת קבע
URL on blur with a per-row refusal message.

**Now, `#/items`.** The sellable-item catalogue: create and edit inline through a shared `ItemForm`,
a "show retired" toggle, retire/revive per item, and photo upload/remove with **errors mapped by
status** — 415 to "unsupported", 413 to "too large", anything else to a generic failure. Items are
grouped by class with an unfiled warning. `ItemsSection` shows `LoadFailed` rather than an empty
list, explicitly so that "the network failed" never reads as "the club sells nothing."

`ClassPricesCard` (mounted on the student detail, §3.6) sets per-student, per-class price
overrides in one bulk write, with a fallback price shown where nothing is chosen.

**Prototype.** `BillingView` (494 lines) — four KPI cards, filter pills with live counts, a
transactions table with per-row "mark as paid" and a WhatsApp reminder, and a "new payment" modal.
Plus `EquipmentStoreView` (955 lines) — a product catalogue with category pills, a mandatory-only
filter, an orders/pickup ledger, a sizing guide, and a three-step order wizard.

**Port.**
- The **filter pills with live counts** are better than the current unfiltered household list. Take
  them.
- The **transactions table** is a view the dashboard does not have — it lists *payments*, where
  `CollectionsScreen` lists *debts*. `GET /api/v1/payments` already exists and is already fetched
  by `BillingSection`. This is a genuine addition, cheaply.
- The **per-row WhatsApp debt reminder** is a real `wa.me` link with a pre-filled message. The
  dashboard's reminder goes through `POST /api/v1/reminders/debt`; both are useful and the WhatsApp
  one works when push does not.
- For `#/items`: the **product-card grid with photos, category pills and a mandatory badge** is a
  much better catalogue than the current list. Take it. The sizing guide is a genuinely useful
  static document.
- The **three-step order wizard** maps onto `POST /api/v1/charges/from-product`, which already
  exists — pick item and size, pick student, pick payment method.

**Do not port**: its "export data" buttons (toast, both screens); its "view receipt" button — which
is a toast in the prototype, and here is **deferred entirely to checkpoint 17** (D6), so until then
the row shows the typed receipt number as plain text with no control beside it;
its four hardcoded billing KPIs (₪58,400 revenue, ₪4,760 debt, 94.2% collection rate, and a
"₪53,640 / 141 active subscriptions" standing-order figure that is not computed from anything); its
"mark as paid", which mutates a transaction row locally while leaving the underlying member's debt
untouched — the dashboard's `RecordPaymentDialog` does this correctly; the store's hardcoded "184
units in stock" and "₪8,420 equipment revenue"; and the order wizard's completion, which writes to
component-local state with **no callback to any parent at all**, so a completed order vanishes when
the tab changes.

**Improve.**
- **Stock does not exist and must not be implied.** The `Product` model refuses inventory by an
  explicit decision recorded in its own docstring — "inventory is a different product." No stock
  count, no low-stock badge, no "184 units". See §4.
- Orders are not an entity either: an order is a `charge`. The prototype's order ledger with order
  numbers and pickup states has no backing. What *does* exist is
  `GET /api/v1/sessions/{id}/awaiting-handout` and `POST /api/v1/charges/{id}/hand-over` — a real
  handout flow, coach-facing, with prices redacted. If a pickup ledger is wanted, that is its basis.
- `PricePlansScreen`'s create and close paths have **no error handling at all** — no `.catch`, so a
  failed create rejects unhandled and the form simply appears to do nothing. Fix while restyling.
- `RecordPaymentDialog` has the same gap on submit.

---

### 3.21 The class wizard — new, `#/classes/new`

Nothing exists today. This is the one screen in the port that is built rather than restyled, and
the owner asked for it explicitly on 2026-09-10 alongside the setup wizard.

**Prototype.** `ClassWizard.tsx` (1,146 lines), opened from `ProgramsView` by a "create a class"
button and drawn as a modal over the programs grid. Seven steps across a numbered horizontal
stepper, each with a title and a subtitle: **1.** פרטי החוג · זהות ומיתוג · **2.** קבוצות ולו״ז ·
שעות משתנות · **3.** תמחור ומסלולים · הוראות קבע · **4.** דרגות וחגורות · סולם התקדמות ·
**5.** ציוד ומדים · חנות המועדון · **6.** מאמנים וסמכויות · הרשאות ושכר · **7.** הרשמה והשקה ·
אישורים וחניכים. Completed steps are clickable; `validateCurrentStep(n)` blocks Next and prints one
named error; the footer reads "שלב N מתוך 7"; the last step publishes.

**What it produces, and what that maps to.** The prototype's `handlePublishClass` fabricates a
`Program` plus one `ClassScheduleItem` per group per weekday. There is no `Program` in this product
(§4 rule 4) — the wizard creates a **class**, its **groups**, and their **schedule rules**, which is
what those two objects already express.

Step by step, with the endpoint each one calls. Every one of them exists; nothing here needs a
migration.

| # | Step | Calls | Constraint |
|---|---|---|---|
| 1 | Class identity — name, description, discipline, colour, age range | `POST /api/v1/classes` | `ClassCreate.color` is **a token name, never a hex literal** — the schema says so in a comment and G13 enforces it. The prototype's `brandColor: '#4edea3'` picker becomes the palette chooser the wizard already owes. Its `bannerUrl` has no column and is dropped. |
| 2 | Groups and their weekly schedule | `POST /api/v1/groups`, then `PUT /api/v1/groups/{id}/schedule` per group | The PUT returns a **`ScheduleImpactPreview`**, not a bare 204. The wizard must show that preview before it commits — an existing affordance the prototype has no equivalent of, and losing it would be §0's forbidden move. `GroupCreate` rejects `age_min > age_max` with a 422 naming the field. |
| 3 | Prices | `POST /api/v1/price-plans`, then `PUT /api/v1/price-plans/{id}/class` | The prototype's five price points map onto plans by frequency. **Standing orders are recorded, not created** — §4 rule 7, a `CLAUDE.md` gotcha that predates this port. `cancellationNoticeDays` and `freezeDaysAllowed` have no columns; leave them out rather than draw dead fields. |
| 4 | Belt ladder | `GET /api/v1/belt-presets`, `POST /api/v1/belt-ranks/seed`, `POST /api/v1/belt-ranks` | The ladder is `name` · `kyu` · `order_index` · `color_hex` · `secondary_color_hex`. It has **no** `minMonths`, `minAttendances`, `fee`, `examFee`, `passingScorePercentage` or `requiresCoachRecommendation`. Seed from a preset and let the manager rename and reorder; that is the whole step. `evaluationType: 'levels' \| 'caps'` is §4 rule 5. |
| 5 | Gear and club shop | `POST /api/v1/products`, `POST /api/v1/products/{id}/image` | Prices are agorot. The prototype's `regularPrice` / `discountPrice` pair is one price — D9 took the discount box out. `mandatoryInCart` has no column; drop it. |
| 6 | Coaches | `POST /api/v1/groups/{id}/staff` | Assignment is real and creates the group-scoped role grant in the same call. **Wages are not**: `grep` for `hourly_rate\|wage\|salary` across `app/models` and `app/schemas` returns nothing. §4 rule 3. Permissions are **roles**, which `POST /api/v1/staff/invitations` and `PATCH /api/v1/staff/{id}` already own — the wizard shows which permissions the chosen roles grant, read-only, exactly as `#/staff` does, and never invents a per-capability switch. |
| 7 | Registration and launch | `POST /api/v1/onboarding-link`, `GET /api/v1/students` for the import picker | `requireHealthDeclaration` is **not a toggle** — §5.5 makes it a hard gate, and §3.19 already records that a contract test fails if such a setting reappears. Render it as a stated fact, not a switch. The link is the real onboarding link, with its existing revoke path. |

**Port.** Take the stepper, the two-line step labels, the per-step validation with one named error,
and the "שלב N מתוך 7" footer. The stepper is built once, in
`packages/ui/src/wizard/Stepper.tsx`, and consumed three times — the class wizard now, the setup
wizard at checkpoint 17, rollover at 15. **It keeps a status word on every node, which the
prototype does not have**: the setup wizard already learned that lesson when an owner reported
"finished them all, still says 6/7" because `done` and `skipped` shared one ✓.

**Built at checkpoint 6, not 18.** The owner's correction — *"if want to edit, then the full
wizard, but with the details already in it"* — makes the wizard the only editor a class has, so it
could not wait for a later checkpoint without leaving the classes screen with no way to change
anything.

**Improve.**
- **The wizard must be resumable, or it must not start.** The setup wizard persists through
  `GET /api/v1/setup` and survives a closed app; the prototype's class wizard holds seven steps of
  state in React and loses all of it on a refresh. Creating the class on step 1 and patching
  forward — rather than batching seven steps into one publish — is what makes a half-finished class
  a draft rather than a lost afternoon.
- **Each step commits its own call.** The prototype's single `handlePublishClass` would need a
  seven-call transaction the API does not offer; a failure on call five would leave a class, groups
  and plans behind with no wizard to return to.
- Reuse the setup wizard's step components where the shape matches — `GroupsStep`, `BeltsWizardStep`,
  `PricesWizardStep`, `ItemsWizardStep` and `StaffStep` already exist in
  `packages/ui/src/setup-wizard/` and already talk to these endpoints. Steps 2–6 are those five
  files scoped to one class rather than to the studio.

---

## 4. Deliberately not built

Each of these appears in the prototype and is excluded, with the reason. Naming them here is what
stops them being rediscovered as "missing" three checkpoints from now.

| # | Not built | Why |
|---|---|---|
| 1 | **Inventory / stock levels** | `Product` has no quantity column by an explicit product decision recorded in the model's docstring: "inventory is a different product." Selling an item creates a charge. A stock number would be invented at render time. |
| 2 | **Orders as an entity** — order numbers, pickup states, an order ledger | An order is a `charge`. The nearest real thing is the handout flow (`awaiting-handout` / `hand-over`), which is coach-facing. |
| 3 | **Coach wages and per-program profitability** | `ProgramCoach.hourlyWage` and the revenue-minus-coach-cost table need payroll. No model, no endpoint, nothing. This is a product decision, not a screen. |
| 4 | **Curriculum / `Program` as a first-class entity** | `training_plans` is billing tiers, not curriculum. The real `classes` + `groups` already carry what the prototype's `Program` + `subGroups` express. |
| 5 | **`trackType: 'levels' \| 'caps'`** | The backend models one ladder shape: ordered `belt_ranks`, per class. Two more progression systems is a schema change. |
| 6 | **Multi-discipline studios** (`judo \| crossfit \| swimming \| bjj`) | The prototype models a multi-sport studio throughout — `Member.discipline`, discipline pills on five screens. The product is a judo club with `classes`. Discipline filters port as **class** filters. |
| 7 | **Automated recurring billing** | `ClassWizard` step 3 offers standing orders as a created artefact. Our provider cannot create הוראת קבע programmatically; they are recorded and marked paid manually. This is a `CLAUDE.md` gotcha and predates this port. |
| 8 | **`smsSenderName` and `allowOnlineStorePurchases`** | Neither is built — D11. The SMS sender name configures a channel the product does not send; the shop switch was not asked for. The other two invented settings, `autoDebtReminders` and `healthCertExpiryAlertDays`, **are** built, into `billing/settings` and `attendance/settings` respectively. |
| 9 | **Announcement scheduling** | The prototype's step 4 promises timing and renders no date control. `published_at` exists; scheduled send does not. |
| 10 | **Any AI feature** | `@google/genai` is a dependency imported nowhere in the prototype, and `grep` for `genai\|gemini\|anthropic\|openai\|llm` across `app/` returns nothing. There is nothing to port. |
| 11 | **Material Symbols icons** | A new UI dependency and a CDN font on first paint. `@studio/ui`'s `Icon` is extended instead. Reversible if the owner asks. |
| 12 | **Every toast-only control** | Roughly thirty of them, enumerated per screen in §3. Each is either built against a real endpoint or omitted. A button that reports success and does nothing is worse than no button. |

---

## 5. How this gets built, and in what order

### 5.1 Who does what

**Opus 5 manages. Sonnet 5 writes the code.** The manager investigates, decides, reviews every
diff, and owns every claim made to the owner. It does not write feature code. Each dispatch to
Sonnet carries four things: the files to read, the exact acceptance criteria, the commands to run,
and **what not to touch**.

- **A subagent gets a spec, not a question.** If one comes back asking what something should do,
  that is the manager's failure — answer it and re-dispatch.
- **One screen or one seam per agent.** Never "port the vertical".
- **Parallelise only what cannot collide.** Anything touching the shell, `App.tsx`'s route table,
  `tokens.css`, `tokens.roles.ts`, the audit test, or the i18n registries runs alone.
- **The manager verifies; the agent reports.** Every command is re-run before its result is
  repeated to the owner.

### 5.2 What serialises, and why

The approval gate is what makes the checkpoints sequential — each stops for a yes, so no two are
ever in flight. The collision rules govern parallelism *inside* one checkpoint.

Two shared registries are settled up front rather than discovered later:

- **`tokens.css`, `tokens.roles.ts` and `tokens.audit.test.ts`** all change together in checkpoint 1.
  The audit's list of audited blocks must gain the two new selectors or the suite fails. One edit,
  once.
- **`web/packages/i18n/index.ts` and `types.ts`** are authored once and a lane never edits them. Any
  new namespace is added in checkpoint 1's commit. On present evidence the redesign needs **no new
  namespace** — every screen maps to an existing one (`common`, `schedule`, `people`, `health`,
  `attendance`, `billing`, `events`, `comms`, `reports`).

There is **no Alembic revision in this port.** Everything in §3 is buildable against endpoints that
already exist. If §4's excluded items are ever pulled back in, each brings its own schema work and
its own wave.

### 5.3 The order

Nineteen checkpoints. Each is one screen or one seam. After each: the manager reviews the diff,
screenshots the result beside the prototype into
`docs/screenshots/dashboard-checkpoints/<screen>/`, and **stops and waits for a yes.**

| # | Checkpoint | Note |
|---|---|---|
| 1 | **The palette and the shell** — `[data-surface="studio-os"]` light and dark, the token roles, the audit-test entries, the sidebar, the nav mapping | Serialises. Everything later is drawn on this. Includes deriving the light palette the prototype does not have, and the three contrast corrections in §1.4 |
| 2 | **Home** — layout, KPI cards, today's classes, attendance chart, and the `alert-centre` slot moved onto it | The most-changed screen and the highest-value change. §3.15 |
| 3 | Students list and the class tabs | §3.5 |
| 4 | Student detail — the four-tab drawer, **plus the missing error state** | §3.6. Failing test first for the defect |
| 5 | Weekly schedule — the grid, and `SessionPopover`'s two-tab split | §3.1 |
| 6 | **Classes, and one class's groups** — the class card grid, the drill-in, and the small edit popup | §3.2. **Rebuilt 2026-09-10** after the owner corrected the first pass: classes come first and a class is what you open to find its groups. Adds `PATCH /api/v1/classes/{id}`, which did not exist |
| 7 | One group, and closures | §3.3, §3.4. Includes the closures error state |
| 8 | Attendance — three buttons per student, the stat header | §3.16 |
| 9 | Billing collections, promises, plan changes | §3.20 |
| 10 | Prices and reconciliation | §3.20. Includes the two missing `.catch` paths |
| 11 | Items — the product grid, the sizing guide, the order wizard on `charges/from-product` | §3.20 |
| 12 | Announcements — the four-step wizard and the notification preview | §3.12. The strongest single idea in the prototype |
| 13 | Reports — chart styling, tooltips, KPI strip | §3.13 |
| 14 | Belts, exams, events | §3.9, §3.10. Includes the rank-rename gap and event attendance |
| 15 | Documents, staff, settings, rollover | §3.11, §3.17–3.19. Includes the settings load-error defect. **The setup wizard is not here** — it moved to checkpoint 17, because it is shared with the staff app. Rollover is restyled here and gets its stepper in 17 |
| 16 | Platform | §3.14. One person sees it |
| 17 | **The setup wizard** — mounts the shared stepper | §3.19. Added 2026-09-10 at the owner's request. The stepper itself was built at checkpoint 6 with the class wizard; this checkpoint adopts it and re-composes the setup flow around it. Its changes land in the **staff app** too, so it is proven with two screenshots, not one |
| 18 | ~~**The class wizard**~~ — **done inside checkpoint 6** | §3.21. Pulled forward the same day: the owner cut the small edit popup, which made the wizard the ONLY editor a class has, so it could not wait. It also built the shared stepper that 17 and 15 consume. Nothing is left of this checkpoint |
| 19 | **The uPay receipt link** — **BLOCKED, and that is the result** | **D6 — alone, and after every screen.** The evidence D6 made this conditional on cannot be obtained from a development session, which is the outcome D6 asked to have recorded. `app/` holds exactly one uPay URL — `UPAY_ENDPOINT`, the card form's redirect page — and nothing constructs a receipt URL; the only mention of linking to one is a comment on `payment_order.external_payment_ref`. So the per-receipt URL shape is unknown, there is no live `transactionid` to test one against, and `form.py` already records that nothing CI can run reaches uPay. Guessing a path against a live payment provider is not proof. **What closes it is one look:** the owner opens any paid card transaction in uPay's own dashboard and reports whether its receipt has a URL carrying the transaction id. If yes, the button is a one-line addition and the id is already stored; if no, D6's answer is that the button comes out. Carried as `HB-upay-receipt-link`. The paid row is meanwhile in exactly the state D6 specified as the default — the typed number as plain text, no control beside it |

Checkpoint 1 serialises against everything. Checkpoints 2 and 15 both touch `App.tsx` and must not
run beside each other. Checkpoint 18 depends on 17 for the stepper; nothing else depends on either.
Checkpoint 19's only dependency is checkpoint 9 — it is listed last because its outcome may be to
ship nothing, not because the two wizards block it.

---

## 6. The guards this port must not break

- **`unreachable-screens.test.ts`** — every barrel-exported component must be referenced outside its
  barrel. §2.3's mapping is what keeps this true when nine nav items replace nineteen routes.
- **`inert-buttons.test.ts`** — every `<Button>` needs `onClick`, `href`, `type="submit"`, a spread,
  or an *unconditional* `disabled`. Note that a toast-only handler **passes** this guard; §4's
  rule 12 is a product rule the linter cannot enforce.
- **`slot-wiring.test.ts`** — a component registering into a slot must be registered from a file the
  mounting app actually calls. Moving the `alert-centre` slot onto `#/home` must keep this green.
- **`tokens.audit.test.ts`** — the four rules in §1.3, plus contrast. The new surface must be added
  to its audited-block list or the suite fails on "declares no custom property outside the audited
  blocks."
- **`d10-logical-css.test.ts`** — logical properties only. It builds a full ESLint instance and is
  slow; it will not catch a Tailwind class name.
- **`dead-promise-keys.test.ts`** — a `*Later` / `*ComesLater` i18n key nothing references is dead
  copy. Several will become dead as screens ship; delete them in the same commit.
- **`App.test.tsx`** — the dashboard's own permission-boundary test: a coach hitting a manager-only
  route sees `common.dash.forbidden`, and a signed-in user with no role sees `dashboard-refusal`.
  Both must survive the new shell.
- **`tailwind.isolation.test.ts`** — does **not** exist for the dashboard, because the dashboard has
  no Tailwind. If checkpoint 1 introduces it, this test comes with it, copied from parent.

Every claim of green in this port is one the manager runs before repeating.

