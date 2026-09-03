# `DR` — the dashboard's five worst screens · a redesign **(proposal)**

| | |
|---|---|
| **Surface** | Manager dashboard · 1440×900 and up · Hebrew RTL |
| **Routes** | `#/attendance` · `#/students` · `#/groups` · `#/staff` · `#/reports` · `#/` |
| **Canvas** | **none, and none may be added.** `tests/contracts/test_canvas_matches_spec.py` asserts the canvas holds exactly 61 artboards; a 62nd fails the build. Artboards `3b`, `4b`, `4c`, `4g` already exist and stay as they are — this file says what the *code* should do, where the code and the artboard disagree, and which artboard findings were never built. |
| **i18n namespaces** | `common`, `people`, `schedule`, `attendance`, `reports` |
| **Status** | Proposal. Nothing here is built. Written 2026-09-03 from the owner's screenshots of production. |

---

## What this is

Six screenshots taken on 2026-09-02 against `admin.gladiatorclub.co.il`. The owner's words,
verbatim:

| Screenshot | Screen | The complaint |
|---|---|---|
| `20.36.33` | נוכחות | "the unmarked classes looks unprofessional · need better design and better overlay · the time is opposite · and the statistics below also look bad" |
| `20.37.13` | חניכים | "חיפוש חניך יושב על התיבת חיפוש ויש בעיה בו" — *the "add student" control sits on top of the search box's label* |
| `20.37.26` | קבוצות ומחזורים | "the קבוצות ומחזורים column looks really disorganised · change the design" |
| `20.38.18` | צוות | "the staff table doesn't look professional" |
| `20.40.39` | דוחות | "can't understand anything from it" |
| `20.35.46` | לוח המנהל | "maybe different layout · more professional design" |

And one instruction that spans all six: **"fix buttons that unfold on each other."**

Every complaint traces to one of six defects. Five of the six are *mechanical* — a missing
stylesheet import, a missing `display`, a missing width cap — and they are why the screens
look unfinished rather than merely plain. **Part A fixes those six. Part B is the actual
design work, and it is much smaller than it looks once Part A has landed.**

## Provenance

| Source | What it contributed |
|---|---|
| The six screenshots | Ground truth. Nothing in this file describes a defect that is not visible in one of them. |
| [`4c`](../specs/4c-dashboard-attendance.md), [`4b`](../specs/4b-dashboard-groups.md), [`3b`](../specs/3b-dashboard-students.md), [`4g`](../specs/4g-dashboard-reports.md) | The domain: which columns exist, which denominators are stated, which empty states are the goal state. **All four win on domain correctness.** |
| [`manager-home.md`](./manager-home.md) | The page-header pattern — *one row, not four* — that this file extends to the other five screens. Its own §1 already says the rest of the dashboard should adopt it. |
| [Pencil & Paper, *Enterprise data tables*](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables) | Row density (40/48/56px), *opportunistic disclosure* for row actions, sticky toolbar above the table, bulk bar only after selection. |
| [UX Design World, *Actions in data tables*](https://uxdworld.com/best-practices-for-providing-actions-in-data-tables/) | At most **three** inline actions per row; everything beyond that goes behind one overflow control. |
| [SimpleLocalize, *RTL design guide*](https://simplelocalize.io/blog/posts/rtl-design-guide-developers/) and [Finastra RTL guidelines](https://design.fusionfabric.cloud/foundations/rtl) | Numeric, date and time cells stay left-to-right inside a right-to-left table. Confirms `RangeText`/`bdi`, and names the defect in B1 and B5. |
| [Setproduct, *Data table UI reference 2026*](https://www.setproduct.com/blog/data-table-ui-design) | Multi-value cells: show two or three values and a `+N`, never the whole list. |

**Precedence used, in order:** tokens, RTL and accessibility are non-negotiable · the four
artboards win on domain correctness · the outside references win on composition only ·
anything needing data that does not exist is cut.

---

# Part A — six defects, fixed once, five screens improve

These are shared. They are listed first because **B1 through B6 assume they have landed**,
and because four of the six are one-line changes that account for most of what the owner is
looking at.

## A1 · The attendance screen has a stylesheet, and the app never loads it

`web/apps/dashboard/src/features/attendance/attendance.css` exists, is 127 lines, is
carefully written, and **is imported by nobody.** `App.tsx:40-44` imports five feature
stylesheets and this is not one of them. (`apps/staff/src/App.tsx:87` imports the *staff*
app's file of the same name, which is what makes the omission easy to miss in a grep.)

Everything the owner sees on `#/attendance` follows from that one missing line:

| In the screenshot | Because |
|---|---|
| Bullet points down the left of the unmarked list | `list-style: none` never applied |
| Buttons touching each other and colliding with the row above | `li { display: flex; gap: var(--space-3) }` never applied |
| Every row indented differently, staircase-fashion | the rows are one inline flow, so each row's buttons start wherever its text ended |
| No dashed `--pending` border around the card | the `[data-testid='unmarked-list']` rule never applied |
| `אין סימונים בטווח הזהסומנו 0/1 שיעורים` — two sentences run together | the group-rate row is not a flex row, so its spans have no gap |
| Date pickers and the export button on three separate lines | the `> header` flex rule never applied |

**Fix:** add `import './features/attendance/attendance.css'` to `App.tsx`, in the block at
lines 40–44.

**And make the class of bug impossible.** A vitest test that walks
`apps/dashboard/src/features/**/*.css`, and fails if any file is not reachable from an
`import` in the app's module graph. A stylesheet nobody imports is not a style choice; it is
a screen that shipped naked, and this one shipped naked for weeks with tests green.

## A2 · `.studio-btn` has no `display`, so link-buttons paint over their neighbours

`primitives.css:101`. The rule sets padding, border, radius and colour — and never sets
`display`. A `<button class="studio-btn">` is fine: the user agent gives `<button>` an
`inline-block` default. An **`<a class="studio-btn">` is `display: inline`**, and block
padding on an inline box does not grow the line box — **it overflows and paints on top of
whatever is next.**

This is, exactly and literally, "buttons that unfold on each other". The cropped screenshot
of `#/students` shows the black `הוספת חניך` box painted across the `חיפוש חניך` field
label below it, with the anchor's underline still on.

Five call sites, all of them `<a>`:

| File | What it is |
|---|---|
| `people/StudentsScreen.tsx:230` | `הוספת חניך` — the one in the screenshot |
| `schedule/GroupsAndCycles.tsx:269` | `לו״ז שבועי` — the one that wraps mid-label into `לו״ז / שבועי` in every row of `#/groups` |
| `settings/SettingsScreen.tsx:504` | same shape, not screenshotted |
| `apps/staff/src/features/schedule/TodayScreen.tsx:363`, `apps/parent/.../BookingConfirmed.tsx:176` | same shape, other apps — they get fixed for free |

**Fix, in `primitives.css`:**

```css
.studio-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  text-decoration: none;   /* an <a> wearing a button face is not underlined */
  min-block-size: 44px;    /* §6.2's target size, which only <button> gets today */
  /* …existing declarations unchanged… */
}
```

**And a test.** `Button.test.tsx` gains a case asserting the computed `display` of an
`<a className="studio-btn">` is not `inline`. This bug has now shipped once; a rule that is
only ever exercised through `<button>` will lose its `display` again.

## A3 · `<main>` has no maximum width

`AppShell.tsx:50` — `mainStyle` is `{ padding: var(--space-4), flex: 1 }`. On the owner's
monitor that is a 2400-pixel-wide text column. It is why `#/students` shows one table row
across two thousand pixels, why the attendance list floats in the middle of an empty field,
and why the staff table's seven columns are spread so far apart that no row reads as a row.

**Fix:**

```ts
const mainStyle: CSSProperties = {
  padding: 'var(--space-6) var(--space-4)',
  flex: 1,
  inlineSize: '100%',
  maxInlineSize: '1200px',
  marginInline: 'auto',   /* logical: correct in both directions */
}
```

1200px is the width the six-column staff table and the two-column reports body were both
sized for. Screens that genuinely need more — the week board's seven-day grid — opt out with
a class, not by leaving every screen uncapped.

## A4 · Five screens stack their header as three or four unrelated rows

`PageHeader` exists (`primitives/PageHeader.tsx`), and its own docstring names this defect:
*"The shipped `#/schedule` stacks four things that belong in this row … nothing in the stack
is visibly related to anything else."* Six screens use it. **The five screens in this
document are exactly the ones that do not.**

Today, each of the five hand-rolls a different header:

| Screen | What it renders | Result in the screenshot |
|---|---|---|
| חניכים | `<h1>`, then a bare `<a class="studio-btn">`, then a `<div>` of filters | the button lands on the filter label (A2), and the description sits *below* the button it describes |
| קבוצות | `<h2>`, then a loose `<Button>`, then the table | `קבוצות המועדון והלו״ז שלהן` prints under the `קבוצה חדשה` button rather than under the title |
| צוות | `<h2>`, then a `<p>` count, then a `<p>` coverage line, then a `<Button>` | four stacked left-aligned lines with no rank between them |
| נוכחות | `<h1>`, then the picker, then the export button | three rows, because A1 |
| דוחות | `<h2>`, control, range and button all in one flex row with no wrapping rules | the title is crowded against the period switch |

**Fix — one shape, all five:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                              כותרת המסך                  │   ← PageHeader
│                                        תיאור קצר של מה שיש כאן           │      title + subtitle
│  [ פעולה משנית ]  [ פעולה ראשית ]                                        │      + actions slot
├──────────────────────────────────────────────────────────────────────────┤
│  [ סינון ]  [ סינון ]  [ חיפוש                              ]            │   ← the filter bar,
└──────────────────────────────────────────────────────────────────────────┘      its own row
```

- The **subtitle** carries what is currently a loose `<p>`: `קבוצות המועדון והלו״ז שלהן`,
  `2 אנשי צוות · 15 שעות שבועיות`.
- The **actions slot** carries the primary button. Never a bare `<a class="studio-btn">`
  floating between two blocks.
- The **filter bar** is a separate row below the header, never inside it. New shared class
  `.studio-filter-bar` in `primitives.css` — a wrapping flex row, `align-items: end`, gap
  `--space-3` — replacing the three hand-written `filterRowStyle` objects
  (`StudentsScreen.tsx:21`, and the inline ones in `GroupsAndCycles` and `StaffScreen`).

## A5 · Every table prints its own title twice

`Table` requires a `caption` — correctly; it is the table's accessible name. But four of
these screens pass the same string that the heading directly above already says. That is the
stray `חניכים` under the students search box, the stray `צוות` under the staff button, and
`קבוצות ומחזורים` above the groups table.

`home.css:69-81` already solved this, for the manager home only, by clipping the caption
out of the visual flow while leaving it in the accessibility tree.

**Fix:** promote that rule into `primitives.css` as a `Table` prop —
`captionVisible?: boolean`, defaulting to `false` — so the caption is off-screen unless a
caller asks for it, and delete the local override in `home.css`. Screens that want a visible
description use `PageHeader`'s subtitle, which is where a description belongs.

## A6 · Two tables label their actions column with the name of a button

- `GroupsAndCycles.tsx:360` — the actions column header is `t('schedule.groups.create')`,
  which is **`קבוצה חדשה`**. So a column of rename/archive buttons is headed "new group".
- `StaffScreen.tsx:336` — the actions column header is
  `t('common.staff.invite.roles')`, which is **`תפקידים`**. So a column of
  edit/end-employment buttons is headed "roles", beside a column already headed `תפקיד`.

Both are visible in the screenshots and both are simply wrong. `schedule.ts:412` already has
`rollover.groups.colAction: 'פעולה'` as the precedent.

**Fix:** add `schedule.groups.col.actions` and `common.staff.col.actions`, both `פעולות`,
in `he`, `en` and `ru`. See Part C.

## A7 · A new read-only chip primitive, because two screens invented their own

`SlotChips` is a radio group and cannot serve a read-only list. So `StaffScreen.tsx:37-52`
hand-rolls `chipRowStyle` and `chipStyle` and renders **ten** permission pills per row,
producing the ragged wall in the screenshot; and the `קבוצות` column beside it joins nine
group names with `' · '` into a five-line run-on string.

**Fix — `ChipList` in `packages/ui/src/primitives/`:**

```tsx
<ChipList items={string[]} max={3} moreLabel={(n) => string} />
```

Renders at most `max` chips and then one muted `+7` chip carrying the rest as its
`title`/`aria-label`. Per Setproduct's rule: a table cell shows two or three values and a
count, never the whole list. Used by staff `הרשאות` and staff `קבוצות`; available to any
later cell with the same shape.

---

# Part B — the six screens

## B1 · נוכחות — `#/attendance`

> *"the unmarked classes looks unprofessional · better overlay · the time is opposite · the statistics below also look bad"*

### What is wrong

1. **The whole screen is unstyled** — A1. Fixing that import alone resolves the bullets, the
   colliding buttons, the staircase indent, the missing dashed card and the three-row header.
2. **"The time is opposite" is a real bidi bug, and it survives A1.** The row renders four
   siblings in source order — checkbox, `16:00`, group name, `14 בספטמבר 2026` — and the
   screenshot shows `16:00קבוצה 14 בספטמבר 2026`: the time has jumped across the group name
   and glued itself to the date, with no space. The time and the date are two separate
   left-to-right digit runs with directionally-neutral text between them, and a right-to-left
   paragraph is free to reorder them. `RangeText`'s docstring records this exact failure
   three times already.
3. **The date and the time are two cells that should be one.** A manager scanning for "which
   register did I forget" reads *when*, then *which group*. Right now `when` is split in two
   and straddles `which group`.
4. **Two actions per row × seven rows = fourteen buttons** competing with the seven facts
   they belong to. Pencil & Paper: reveal on hover, and use the bulk bar for the repeated
   case. A bulk bar already exists here (`AttendanceReport.tsx:185`) and only appears after
   a selection — it is doing the right thing and is invisible next to fourteen pills.
5. **The per-group card is a bullet list.** `שיעורים 0/1 סומנו` `אין סימונים בטווח הזה` and
   the group name run together with no gap and no alignment. There is a `ProgressBar` in the
   code that never renders, because every group in this club has a null rate.

### The target

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                             נוכחות         │
│                            שיעורים שלא סומנו אינם נספרים כהיעדרות          │
│  [ ייצוא CSV ]                                                             │
├────────────────────────────────────────────────────────────────────────────┤
│  [ מתאריך 26/08/2026 ]  [ עד תאריך 02/09/2026 ]                            │
├────────────────────────────────────────────────────────────────────────────┤
│  ⚠ שיעורים שלא סומנו                                              7        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ ☐   קבוצה 1                        יום שני, 14 בספטמבר · 16:00    ⋯ │  │
│  │ ☐   קבוצה 2                        יום שני, 11 בספטמבר · 17:00    ⋯ │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  אחוז נוכחות לפי קבוצה     האחוז מחושב מתוך שיעורים שסומנו בלבד            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ נבחרת בנות     ▓▓▓▓▓▓▓▓░░░░░░  62%              0/1 שיעורים סומנו   │  │
│  │ קבוצה 1        —  אין סימונים בטווח הזה         0/1 שיעורים סומנו   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### The changes

**B1.1 — one datetime, one island.** Replace the two sibling spans with a single
`<bdi dir="ltr">` holding day, date and time together, produced by a new
`formatSessionWhen(startsAt, locale)` in `@studio/core` beside `formatDateInStudioZone`.
One element, explicitly `ltr`, is the only construct that survives a right-to-left
paragraph — the lesson `RangeText` was written for, applied to a datetime instead of a
range.

**B1.2 — the row becomes a three-part grid, not a flex row of five things.**

```css
[data-testid='unmarked-list'] li {
  display: grid;
  grid-template-columns: auto 1fr auto auto;   /* select · group · when · actions */
  gap: var(--space-3);
  align-items: center;
  min-block-size: 48px;                        /* Pencil & Paper's "regular" density */
  padding-block: var(--space-2);
}
[data-testid='unmarked-list'] li + li {
  border-block-start: var(--border-width-hairline) solid var(--border);
}
```

The group name takes the free space, so the datetimes align down the column and the eye can
scan them. Rows get a hairline between them; the dashed `--pending` border stays on the
container, where it means *this whole card is the pending state*.

**B1.3 — the two per-row buttons go behind one overflow control.** A single `⋯` button per
row, opening a menu with `תזכורת למאמן` and `סימון עכשיו`. Fourteen pills become seven
quiet controls, and the bulk bar — which already exists and already does the right thing —
becomes the obvious path for the repeated case. Per UX Design World: at most three inline
actions, and only when they are frequent.

The reminder outcome (`נשלח` / `שעות שקטות` / `נכשל`) stays inline as a `StatusChip` in the
actions cell, because it is a *result*, not an action.

**B1.4 — the "overlay" the owner asked for.** `סימון עכשיו` currently calls
`onMarkNow?.(sessionId)`, and `AttendanceSection.tsx` passes **no** `onMarkNow` — the
docstring explains why: the register lives in the staff app on a hostname this app must not
guess. So today the button does nothing at all. It should open a **`QuickViewRoster` popover
in place**, which already exists at `attendance/QuickViewRoster.tsx` and is already built
for exactly this (`1e`'s quick view). Marking happens where the manager already is; no
cross-origin link is invented.

**B1.5 — the per-group card gets the `Table` primitive**, three columns — group · rate ·
coverage — with the bar in the middle column and the coverage counts right-aligned in a
tabular-numeral column. A group with a null rate renders `—` and the reason, never a bar at
zero. That rule is `4c`'s and is already respected in the code; it just has no layout.

### Acceptance

- With Hebrew as the document language, the unmarked row renders `יום שני, 14 בספטמבר · 16:00`
  as one uninterrupted run, and a test asserts the rendered `textContent` of the datetime
  element matches that order.
- `attendance.css` is reachable from `App.tsx`, asserted by the new stylesheet-reachability test.
- No row has more than one visible action control.
- Group rate rows align: every coverage count starts at the same inline offset.

---

## B2 · חניכים — `#/students`

> *"חיפוש חניך יושב על התיבת חיפוש ויש בעיה בו"*

### What is wrong

1. **A2, exactly.** `StudentsScreen.tsx:230` is an `<a class="studio-btn">`. It is
   `display: inline`, its 11px block padding overflows its line box, and the black fill
   paints across the `חיפוש חניך` label beneath it. It is also still underlined, because
   nothing resets `text-decoration` on an anchor wearing a button face.
2. **`alignSelf: 'start'` on line 235 does nothing** — the parent `<section>` is not a flex
   container. Dead style, and a false signal that the position was considered.
3. **A5** — the stray `חניכים` between the filters and the table header is the table's caption.
4. **A3** — one row of data across the full monitor width. Seven columns, all of them
   narrow, all of them a long way apart.
5. **The two link cards at the top are unbalanced.** `העתקה` and `ביטול` stack vertically in
   the join-link card while `העתקה` sits beside its link in the landing-page card; the two
   cards are different heights for no reason a reader can see.
6. **The `העברת קבוצה` column is first and is a bare checkbox with a two-line header.** A
   selection column should be unlabelled and narrow; its header text belongs in the bulk bar
   that appears once something is selected.

### The changes

**B2.1 — A2 and A4.** The `הוספת חניך` link moves into `PageHeader`'s `actions` slot. The
subtitle carries the count (`{n} חניכים`), which the screen already knows and currently
prints nowhere.

**B2.2 — the filter bar becomes `.studio-filter-bar`**, and gains a visible result count on
its inline-end edge so a filtered view says how much it is hiding.

**B2.3 — the selection column loses its header** (`aria-label` only, `width: 3rem`), and the
bulk bar becomes sticky to the bottom of the viewport while a selection exists, per Pencil &
Paper's floating-toolbar pattern. The bar already renders the right controls; it just
scrolls away today.

**B2.4 — the two sharing cards go into a two-column grid with `align-items: stretch`**, and
the join card's two buttons sit in one `ActionBar` row. Same height, same rhythm, actions in
the same place in both.

**B2.5 — A3 and A5.**

### Acceptance

- The computed `display` of `[data-testid="students-add"]` is not `inline`, asserted in
  `DashboardPeople.test.tsx`.
- No element overlaps the search field's label. (Assert the anchor's bounding box does not
  intersect the label's — jsdom will not do this, so it belongs in the Playwright suite.)
- The table caption is not visible and is still the table's accessible name.

---

## B3 · קבוצות ומחזורים — `#/groups`

> *"the קבוצות ומחזורים column looks really disorganised · change the design"*

### What is wrong

The first column packs four things with no layout at all
(`GroupsAndCycles.tsx:255-282`): the group-name link, a space, a `לו״ז שבועי` link-button,
and the discipline name in muted caption text. Then:

1. **A2 again, and worse here.** The `לו״ז שבועי` anchor is `display: inline`, so it wraps
   *inside its own label*: three rows of the screenshot read `לו״ז` on one line and `שבועי`
   on the next, in a box whose border wraps with it.
2. **The column header repeats the page title.** `header: t('schedule.groups.title')` at
   line 259 is `קבוצות ומחזורים` — the same words as the `<h2>` and the same words as the
   caption. Three times, in a column 12rem wide.
3. **A6** — the actions column is headed `קבוצה חדשה`.
4. **The `שיעור` column is empty in every row.** Line 337 heads it `schedule.session.title`
   (`שיעור`) and fills it with the *belt range*, which is a different thing, and which is
   `—` for every group because no group has belt data yet. A column that is empty in every
   row and mislabelled in the header is worse than an absent one.
5. **Two stacked ghost buttons per row** (`שינוי שם`, `העברה לארכיון`) make every row about
   140px tall. Six groups fill the screen.
6. **A4** — `קבוצות המועדון והלו״ז שלהן` prints below the `קבוצה חדשה` button.

### The target

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                                                        קבוצות ומחזורים         │
│                                          קבוצות המועדון והלו״ז שלהן            │
│  [ + קבוצה חדשה ]                                                              │
├──────────────┬────────────────────┬──────────────────┬──────────┬──────────────┤
│ קבוצה        │ לו״ז שבועי         │ השיעור הבא       │ ללא יום  │              │
├──────────────┼────────────────────┼──────────────────┼──────────┼──────────────┤
│ קבוצה 4      │ שלישי 16:00–17:00  │ 4 בספטמבר 16:30  │    0     │      ⋯       │
│ ג'ודו        │ שישי  16:30–17:30  │                  │          │              │
├──────────────┼────────────────────┼──────────────────┼──────────┼──────────────┤
```

### The changes

**B3.1 — the identity column holds a name and a discipline, and nothing else.**

```
קבוצה 4          ← <a>, the row's own link to #/groups/{id}
ג'ודו            ← muted caption
```

The `לו״ז שבועי` link-button is **deleted**. It exists because a comment on line 267 says
the name link "does not LOOK like the door to the schedule editor" — but the fix for a link
that does not look like a link is to style the link, not to put a second link beside it.
The group name becomes the row's identity link with the standard underline-on-hover
affordance, and the weekly schedule column beside it already shows what is behind the door.

**B3.2 — the column header becomes `schedule.groups.col.name` (`קבוצה`).** Not the page
title.

**B3.3 — the belt-range column is cut until it has data.** `4b` ships it as a *stated gap*,
which is right, but the stated gap belongs in the subtitle
(`טווח חגורות יתווסף עם מערכת החגורות`) — one sentence — rather than as an empty column
mislabelled `שיעור` in every row. It returns as `schedule.groups.col.beltRange` when
`belt_rank` has rows.

**B3.4 — A6, plus one overflow control per row.** `שינוי שם`, `העברה לארכיון` /
`החזרה מהארכיון` move behind `⋯`. Row height falls from ~140px to 56px, and six groups stop
filling a laptop screen. The rename form, when open, replaces the row's cells inline —
it already does, and it will finally have room.

**B3.5 — `ללא יום` shortens its header** from `תלמידים ללא יום` and right-aligns as a
tabular-numeral column with the `--danger` treatment it already has for non-zero counts.

**B3.6 — A4, A5.**

---

## B4 · צוות — `#/staff`

> *"the staff table doesn't look professional"*

### What is wrong

1. **Seven equal-weight columns, two of which are walls of text.** The `הרשאות` cell renders
   ten hand-styled pills that wrap into five ragged lines; the `קבוצות` cell joins nine
   group names with `' · '` into another five lines. Both rows are ~200px tall and neither
   is readable.
2. **A6** — the actions column is headed `תפקידים`, beside a column headed `תפקיד`.
3. **A4** — `<h2>`, then `2 אנשי צוות · 15 שעות שבועיות`, then `לכל הקבוצות משובץ מאמן`,
   then the button: four left-aligned lines with no rank.
4. **A5** — the stray `צוות` under the button.
5. **`עריכת תפקידים` and `סיום העסקה` are full-size buttons in every row**, and the
   destructive one is drawn in `--danger` at full weight. Per Fitts's law as the admin
   references state it: frequent actions get size and proximity, destructive ones get
   distance and a confirmation.
6. **The uncovered-groups state prints as prose.** `לכל הקבוצות משובץ מאמן` is a plain `<p>`
   — the good state and the bad state look nothing alike, and the good one looks like a
   leftover debug line.

### The target

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                                                                   צוות         │
│  [ + הוספת איש צוות ]                                                          │
├──────────────────────┬──────────────────────┬──────────────────────────────────┤
│  2                   │  15                  │  ✓ לכל הקבוצות משובץ מאמן        │   ← StatTile ×3
│  אנשי צוות           │  שעות שבועיות        │                                  │
├──────────────┬───────┴──────┬──────┬────────┴───────────┬──────────┬───────────┤
│ איש צוות     │ תפקיד        │ שעות │ קבוצות             │ סטטוס    │           │
├──────────────┼──────────────┼──────┼────────────────────┼──────────┼───────────┤
│ לביא טמיר    │ מאמן ראשי    │ 14.5 │ נבחרת · קבוצה 1 +7 │  פעיל    │     ⋯     │
│ יובל סטולין  │ מנהל         │  0   │ נבחרת · קבוצה 1 +7 │  פעיל    │     ⋯     │
└──────────────┴──────────────┴──────┴────────────────────┴──────────┴───────────┘
```

### The changes

**B4.1 — the header summary becomes three `StatTile`s.** `2 אנשי צוות`, `15 שעות שבועיות`,
and coverage — the last one toned `paid` when every group has a coach and `debt` when some
do not, so the good state and the bad state are the same component wearing two tones rather
than a paragraph and an `Alert`. The existing `Alert` with its per-group links stays, below
the tiles, and appears only when coverage is incomplete.

**B4.2 — `הרשאות` comes out of the table entirely.** Ten permissions per person is not a
table cell; it is the *content of the row's detail*. It moves into the `⋯` menu's
`עריכת תפקידים` panel, which is where permissions are edited anyway. The table drops from
seven columns to six.

**B4.3 — `קבוצות` uses `ChipList` (A7)**: two group chips and a `+7`. The full list is the
chip's `title` and its accessible label.

**B4.4 — A6, plus the overflow control.** `עריכת תפקידים`, `קוד חדש`, `ביטול הזמנה`,
`סיום העסקה` all move behind `⋯`. `סיום העסקה` is the last item, separated, and keeps its
`--danger` colour there — where it has distance, per the references, rather than a permanent
red button on every row.

**B4.5 — A3, A4, A5.**

### Acceptance

- Every staff row is one line tall at 1200px with two people and nine groups each.
- The permissions list is reachable — asserted by a test that opens the roles panel and
  finds all ten.

---

## B5 · דוחות — `#/reports`

> *"can't understand anything from it"*

This screen has the most defects and the fewest layout problems: `reports.css` is thorough
and correct. What fails is that **almost every number in this club is zero or null, and the
screen has no design for that.**

### What is wrong

1. **The period range prints as raw ISO.** `ReportsSection.tsx:270` passes
   `overview.period.from_date` and `to_date` — `YYYY-MM-DD` strings — straight into
   `RangeText`, which formats nothing. The header reads `2026-09-01–2026-09-02`. Every other
   date on the dashboard goes through `formatDateInStudioZone`.
2. **The KPI tiles are not tiles.** `.dash-kpi` has no surface, no border and no padding —
   four columns of naked text with no separation. `StatTile` next to them, on the manager
   home, has a surface, a hairline and a radius. The reasoning in `KpiStrip.tsx:10-14` is
   sound (this artboard tones the *delta*, `StatTile` tones the *value*) and it argues
   against reusing `StatTile`'s **tone**, not against a card.
3. **The fourth tile's footnote breaks the row.** `kpi-attendance-basis` prints three
   sentences under one tile — `שיעורים שלא סומנו אינם נספרים כהיעדרות` plus two counts —
   while the other three tiles have one short line. The grid row ends up three lines taller
   than it needs to be and visibly lopsided.
4. **The twelve-month chart has one bar.** Eleven empty columns, and their labels
   (`אוקטובר …`, `נובמבר 5…`, `דצמבר 5…`) truncate to ellipsis at ~55px per column, so the
   axis is unreadable *and* wrong-looking.
5. **The financial card stacks eight things with no internal rhythm** — chart, legend, basis
   note, month caption, four stat cells, a progress bar, a students-billed note, a button.
   The `ProgressBar` at `0 / 300₪` renders as a full-width empty grey track, which is the
   single most broken-looking element on the screen. A collection rate of zero should print
   the number, not an empty track.
6. **`קידומי חגורה בתקופה` is thirteen zero-height bars with single-letter labels.**
   `.dash-belts__name` truncates to one glyph in a thirteen-column grid at that width. The
   panel says nothing and looks like an error.
7. **`שימור לפי ותק` is four identical rows saying `אין עדיין ותק מספיק` and `מדגם 0`.** The
   honest answer is one empty state, not four rows of the same sentence.

### The changes

**B5.1 — format the range.** `formatDateInStudioZone` on both ends before `RangeText`. One
line, and it removes the most obviously unfinished string on the screen.

**B5.2 — `.dash-kpi` gets the tile's shell** — `background: var(--surface)`, hairline,
`--radius-lg`, `--space-4`/`--space-5` padding — and keeps its delta-toning. The shell and
the tone are separate decisions; taking the shell does not reopen the argument in
`KpiStrip.tsx`. Extract the shared shell as `.studio-tile-shell` so `StatTile` and
`.dash-kpi` cannot drift.

**B5.3 — the attendance footnote moves to a `ⓘ` affordance** on the tile's label, with the
rule and both counts as its content. §5.14's rule stays published — `4g` finding 5 is
right that it must be — but it stops deforming the row it lives in. The two counts stay
visible as the tile's delta line: `12 סימונים · 3 ללא סימון`.

**B5.4 — the chart shows only months that exist.** Trim leading months with no billing and
no collection; if fewer than three remain, render `EmptyState` instead of a chart. Month
labels switch to a short format (`ספט׳`) below 80px per column, and the full label stays in
the visually-hidden description that already exists.

**B5.5 — the financial card splits into three stacked sections with `SectionHeader`s**:
*the trend* (chart + legend + basis), *this month* (four figures + rate), *the email*
(button). Three headed groups instead of eight loose blocks.

**B5.6 — the collection-rate bar is replaced by a printed percentage** when
`total_agorot === 0` or `settled_agorot === 0`. A 0% track carries no information and reads
as a loading state.

**B5.7 — the belt panel renders `EmptyState` when every count is zero**, which it already
knows how to do for an empty `belts` array; the condition just does not cover
"present but all zero". Above eight belts, the chart rotates its labels rather than
truncating them.

**B5.8 — the retention panel collapses to one `EmptyState`** when every bucket's `percent`
is null: `אין עדיין מספיק ותק לחישוב שימור`. Four rows of the same sentence is not more
honest than one.

### Acceptance

- With a studio one day old, `#/reports` shows: four KPI tiles with `אין נתון` where there
  is no datum, and **three** empty states — not eleven blank bars, four repeated rows and an
  empty grey track.
- The period range renders in Hebrew date format and reads left-to-right as one island.

---

## B6 · לוח המנהל — `#/`

> *"maybe different layout · more professional design"*

This screen is the healthiest of the six. It already uses `PageHeader`, `SectionHeader`,
`StatTile`, `Card` and `Table`, and `home.css` is careful. Its problem is **A3 and shape**:
four full-width cards stacked down a 2400-pixel-wide page, so the eye travels a very long
way for four small facts, and the money band's three tiles are different widths because
`auto-fit` with a 14rem floor gives the leftover space to whichever tile wraps last.

### The changes

**B6.1 — A3.** The 1200px cap alone changes this screen more than anything else here.

**B6.2 — a two-column body below the money band.**

```
┌────────────────────────────────────────────────────────────────┐
│  [ חוב פתוח ]     [ נגבה החודש ]     [ משפחות בפיגור ]         │  ← 3 equal tiles
├──────────────────────────────────┬─────────────────────────────┤
│  שיעורים היום                    │  דורש טיפול                 │
│  ┌────────────────────────────┐  │  ┌───────────────────────┐  │
│  │ נבחרת בנות  16:00  לביא    │  │  │ הצהרות בריאות    1 ⚠ │  │
│  │ קבוצה 1     17:00  לביא    │  │  │ מפגשים ללא סימון 7 ⚠ │  │
│  └────────────────────────────┘  │  └───────────────────────┘  │
│                                  │                             │
│  נוכחות — 30 הימים האחרונים      │                             │
│  ┌────────────────────────────┐  │                             │
│  └────────────────────────────┘  │                             │
└──────────────────────────────────┴─────────────────────────────┘
```

`grid-template-columns: minmax(0, 2fr) minmax(0, 1fr)`, collapsing to one column below
60rem — the same rule `.dash-reports__body` already uses, so the two main screens share a
body shape. **Today's classes moves to the top of the wide column**: it is the answer to
*"what needs me today"*, and it is currently the last thing on the page.

**B6.3 — the money tiles become `repeat(3, minmax(0, 1fr))`** above 60rem, falling back to
`auto-fit` below it. Three money figures should be three equal columns; unequal widths read
as accidental, because they are.

**B6.4 — the attendance chart's no-data state.** Seven grey tracks each captioned
`אין נתונים` is seven repetitions of one fact. When *every* group's rate is null, render one
`EmptyState`: `עדיין אין סימוני נוכחות ב־30 הימים האחרונים`, with a link to `#/attendance`.
When *some* are null, keep the current per-column treatment — it is correct there.

---

# Part C — new i18n keys

One namespace file per vertical, per `CLAUDE.md`. Every key lands in `he`, `en` and `ru`.
`web/packages/i18n/index.ts` is not touched — no namespace is added.

| Namespace | Key | he |
|---|---|---|
| `schedule` | `groups.col.name` | `קבוצה` |
| `schedule` | `groups.col.actions` | `פעולות` |
| `schedule` | `groups.col.unscheduledShort` | `ללא יום` |
| `schedule` | `groups.beltRangeLater` | `טווח חגורות יתווסף עם מערכת החגורות` |
| `schedule` | `groups.rowActions` | `פעולות עבור {name}` |
| `common` | `staff.col.actions` | `פעולות` |
| `common` | `staff.stat.people` | `אנשי צוות` |
| `common` | `staff.stat.hours` | `שעות שבועיות` |
| `common` | `staff.stat.coverage` | `כיסוי קבוצות` |
| `common` | `staff.rowActions` | `פעולות עבור {name}` |
| `common` | `chips.more` | `+{n}` |
| `common` | `chips.moreLabel` | `ועוד {n}` |
| `common` | `table.rowActions` | `פעולות` |
| `people` | `student.countSubtitle` | `{n} חניכים` |
| `people` | `filter.resultCount` | `{n} מתוך {total}` |
| `attendance` | `report.when` | `מועד` |
| `attendance` | `report.rowActions` | `פעולות עבור {group}` |
| `attendance` | `report.markHere` | `סימון כאן` |
| `reports` | `retention.emptyAll` | `אין עדיין מספיק ותק לחישוב שימור` |
| `reports` | `belts.allZero` | `לא נרשמו קידומי חגורה בתקופה זו` |
| `reports` | `financial.noCollection` | `טרם נגבה תשלום החודש` |
| `reports` | `attendance.basisLabel` | `על מה מבוסס האחוז` |

**Two keys are retired**, and their call sites corrected: `schedule.groups.openSchedule`
(B3.1 deletes the control) and the *use* of `common.staff.invite.roles` as a column header —
the key stays; it is the legend of the invite form.

---

# Part D — files touched

### Shared (Part A) — six files, and every screen improves

| File | Change |
|---|---|
| `packages/ui/src/primitives/primitives.css` | A2 `.studio-btn` display · A4 `.studio-filter-bar` · A5 caption clipping · A7 `.studio-chip-list` · B5.2 `.studio-tile-shell` |
| `packages/ui/src/shell/AppShell.tsx` | A3 content max width |
| `packages/ui/src/primitives/Table.tsx` | A5 `captionVisible` prop |
| `packages/ui/src/primitives/ChipList.tsx` | A7 — new |
| `packages/ui/src/primitives/RowActions.tsx` | the `⋯` menu, used by B1, B3, B4 — new |
| `apps/dashboard/src/App.tsx` | A1 the missing import |

### Per screen

| File | Sections |
|---|---|
| `features/attendance/AttendanceReport.tsx` · `attendance.css` | B1.1–B1.5 |
| `features/people/StudentsScreen.tsx` · new `people.css` | B2.1–B2.5 |
| `features/schedule/GroupsAndCycles.tsx` · `schedule.css` | B3.1–B3.6 |
| `features/staff/StaffScreen.tsx` · new `staff.css` | B4.1–B4.5 |
| `features/reports/ReportsSection.tsx` · `KpiStrip.tsx` · `RetentionPanel.tsx` · `RevenueChart.tsx` · `reports.css` | B5.1–B5.8 |
| `features/home/ManagerHome.tsx` · `home.css` | B6.1–B6.4 |
| `packages/core/src/datetime.ts` | B1.1 `formatSessionWhen` |
| `packages/i18n/{he,en,ru}/{common,people,schedule,attendance,reports}.ts` | Part C |

No migration. No API change. No new endpoint. Every number on every one of these screens is
already fetched.

---

# Part E — verification

Per `CLAUDE.md` §Verification, scoped to what the change can reach.

1. **New tests, written before the fix:**
   - stylesheet reachability across `apps/dashboard/src/features/**/*.css` (A1)
   - `<a className="studio-btn">` computed `display` is not `inline` (A2)
   - the attendance datetime renders as one left-to-right run in Hebrew (B1.1)
   - `ChipList` renders `max` chips and a `+N` whose accessible name lists the remainder (A7)
   - `RowActions` is keyboard-operable and closes on `Escape`
2. **Scoped runs:** `npx vitest run` over the six feature directories plus
   `packages/ui/src/primitives`. Not the whole suite.
3. **`npm run typecheck && npm run lint`** after the edits, and again after any edit that
   follows the run — a verification claim expires the moment you edit again.
4. **Look at it.** Six screenshots at 1440×900 and six at 390×844, Hebrew, light and dark,
   against the demo studio — whose numbers are all zero, which is the state that broke B5.
   `docs/screenshots/dashboard/` gets an `after/` directory beside the six originals.
5. **Tick `docs/plan/state.yaml` in the same commit as the work.**

---

# Part F — deliberately not in this proposal

- **No charting library.** `reports.css`'s header argues this at length and the argument
  holds: these charts must not bring their own idea of direction.
- **No new artboard.** The canvas is frozen at 61 by contract test.
- **No column-density switcher, no column chooser, no sticky table header.** All three are
  in the references and all three are premature for a club with two staff and six groups.
- **No belt-range column and no capacity column.** Both need data that does not exist. `4b`
  is right that the gap should be stated; B3.3 states it in one sentence rather than in an
  empty column.
- **No change to `DashNav`.** Eighteen items in three labelled sections is working, and it is
  the one part of these six screenshots nobody complained about.
- **No at-risk sidebar on `#/attendance`.** `4c` finding 2 defers it and W3's contract commit
  never decided; that decision is still open and is not this proposal's to make.
