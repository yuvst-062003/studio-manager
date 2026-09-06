# The parent app's shell, after the redesign

Checkpoint 1 of `docs/plan/prompts/redesign-parent-app.md`. This is the structural decision
the rest of the redesign is built on: **four tabs, no side menu** (§4), no app-level header,
and a home for every destination the deleted drawer used to hold.

Source of truth: `~/Desktop/מועדון-ג'ודו-גלדיאטור-2`, read directly.

## What the shell is now

```
ParentShell                      apps/parent/src/features/shell/ParentShell.tsx
├── DevBar                       unchanged — §19.4 draws it above everything
└── #app-wrapper (max-w-md)      the prototype's phone column, ported class for class
    ├── <main> (pb-28)           the active screen; the bar's clearance lives here, once
    └── ParentTabBar             ported from the prototype's BottomNavigation.tsx
```

`@studio/ui`'s `AppShell` is no longer mounted by this app. Staff and dashboard keep it —
the header, the drawer and the studio switcher it draws are still right for them.

## The four tabs

| Tab | Hash | Was |
|---|---|---|
| בית | `#/` | home — unchanged |
| חנות המועדון | `#/shop` | a drawer entry; takes the slot payments used to hold |
| עדכונים | `#/announcements` | was הודעות — same `/me/notifications` read, same badge |
| פרופיל | `#/profile` | profile — unchanged, and now where money lives |

Payments left the tab bar. §4: *"Money moves into Profile: balance, payment method,
history. Debt surfaces on Home's urgent banner."*

## Where every drawer destination went

The drawer held seven entries plus a footer. Nothing was dropped.

| Drawer entry | Where it goes | Landed by |
|---|---|---|
| `myChildren` `/` | Home's per-child chips, and Profile's trainee cards | ✅ checkpoints 2 and 5 |
| `calendar` `#/calendar` | a **modal inside Home** (§4); the route survives as Profile's calendar-feed link | ✅ checkpoints 3 and 5 |
| `payments` `#/payments` | **Profile** — balance, method, history | ✅ checkpoint 5 |
| `announcements` | **tab 3** | ✅ checkpoint 1 |
| `events` `#/events` | **no dedicated surface** (§4) — events appear in Home beside every other session | outstanding, see below |
| `shop` `#/shop` | **tab 2** | ✅ checkpoint 4 |
| `addChild` `#/add-child` | **Profile**, under the trainee cards | ✅ checkpoint 5 |

| Drawer footer | Where it goes | Landed by |
|---|---|---|
| language | Profile — it was already there | ✅ already |
| theme (light/dark/system) | Profile — already there | ✅ already |
| privacy `#/privacy` | Profile — already there | ✅ already |
| **sign out** | Profile, via `AccountControls` | ✅ now |
| **studio switcher** | Profile, via `AccountControls` | ✅ now |

The last two were the only genuinely homeless controls: `GuardianSettings` already carried
language, theme and the privacy link, so deleting the drawer stranded nothing else.

## Screens that sit beside the tabs, not inside one

These keep their hashes and render with the bar showing and **no tab marked current** —
`activeTab` is `null`, which is a real answer rather than a fallback. Marking a tab
`aria-current="page"` on a screen that tab does not lead to is a lie told to a screen reader.

`#/absence` · `#/student/<id>` · `#/plan/<id>` · `#/belts/<id>[/<class>]` ·
`#/events/<id>/<student>` · `#/payments/history` · `#/payment-complete/<ref>` · `#/privacy` ·
`#/directions` · `#/install` · `#/join` · `#/add-child`

The bar hides completely while either of §6.1's blocking gates holds — consent and the
health declaration. "No other screen is reachable" includes the bar that reaches them.

## Two links parked temporarily

Deleting the drawer took the only link in the whole app to `#/calendar` and `#/add-child`.
`routes.reachable.test.ts` exists because three screens have already shipped mounted and
unreachable, so both are held in `AccountControls` — marked `TRANSITIONAL` — until the
screen that owns each one is ported. Everything else was already linked from somewhere: the
shop and announcements from the bar, payments from Home's debt CTA and Profile, events from
the inbox's RSVP action.

## Two things found by rendering it

1. **`primitives.css` leaked into the Tailwind scope.** It sets `a { color: var(--accent) }`
   **unlayered**, and unlayered declarations outrank every `@layer` — so it beat
   `text-slate-400` and painted the whole tab bar accent green. The design system's own rule
   is now `a:not(.tw-scope a)`. The isolation contract only ever checked leaks going *out* of
   the scope; `tailwind.isolation.test.ts` now checks the other direction too, and that guard
   was verified to fail against the old selector.

2. **`dark:` was following the operating system.** Tailwind's default dark variant is
   `prefers-color-scheme`; this app stores its own preference and writes `data-theme` on
   `documentElement`. A parent who chose light on a phone set to dark would have got a light
   design system and dark Tailwind on the same screen. `tailwind.css` now redefines the
   variant against `[data-theme]`.

## Deviations from the prototype, and why

| # | Prototype | Here | Why |
|---|---|---|---|
| 1 | tabs are `<button>` + `useState` | `<a href>` | the app routes on `location.hash`; links survive the back button, open-in-new-tab and a deep link from a push notification |
| 2 | badge at `-right-1.5` | `-end-1.5` | logical properties are required (`.claude/rules/ui-rtl-a11y.md`); **this moves the badge to the bell's top-left in Hebrew** — see the checkpoint note |
| 3 | badge is a bare numeral | count also in `aria-label`, mark `aria-hidden` | a numeral beside a word says nothing about what it counts |
| 4 | badge takes any integer | `99+` above 99 | a parent back from a month away would widen one of four fixed slots |


## Where the work has actually got to

| Checkpoint | Surface | State |
|---|---|---|
| 1 | the shell — four tabs, no drawer | ✅ mounted |
| 2 | **בית** | ✅ mounted, incl. the absence sheet and per-session reminders |
| 3 | **עדכונים**, and בית's monthly calendar with its day/lesson absence reports | ✅ mounted |
| 4 | **חנות המועדון** | ✅ mounted |
| 5 | **פרופיל** — and with it the money, the trainee cards and add-a-child | ✅ mounted |
| 6 | strings into `@studio/i18n`, mirrored into `en/` and `ru/` | ✅ done |
| — | the dark sweep | outstanding, and see below |
| — | deleting the screens the redesign replaced | ✅ done (b8621c3) |

### Still outstanding, and deliberately so

- **The date-range absence flow** (the prototype's FLOW B: pick children, pick from/to).
  Home's header button and the floating button both go to `#/absence`, which is a working
  screen that already does multi-child, multi-session picking. Nothing is broken; the
  prototype's version is simply not built.
- **Events folded into Home.** §4 says events appear beside every other session. `GET
  /sessions` returns lessons, not events, so this needs the events read joined into the same
  list. `#/events` is still linked from the inbox's RSVP action, so nothing is stranded.
- **`#/calendar`** is now linked from Profile's quick links as the CALENDAR FEED — §5.12's
  subscription, which is what the route still exists for now that בית draws the month itself
  in a modal. `AccountControls`'s two transitional links are gone: Profile carries
  `#/add-child` under its trainee cards and `#/calendar` here.
- **A section of פרופיל whose fetch fails renders as EMPTY, not as failed.** Each of the
  screen's reads ends `.catch(() => setChildren([]))`, so a network failure tells a family
  they have no trainees. `tools/__tests__/load-failed-recovery.test.ts` catches the shape it
  knows — `setLoaded(true)` in a catch — and not this one. The four tabs that DO have a
  failure state now share `resolveLoadFailedText`, which is where the fix belongs; פרופיל
  needs a failure state of its own first, which is a change to the screen and not to a
  string, so it is not part of step 6.

### The dark-mode correction

Checkpoint 1 recorded that the prototype styles dark mode with `dark:` variants throughout.
That is true of `BottomNavigation` (24) and `ProfileScreen` (318) and FALSE of `HomeScreen`,
`UpdatesScreen` and `GearScreen`, which carry **none** — they get dark mode from 18 global
`html.dark .bg-white{…}` overrides in the prototype's `index.css`.

So the ported Home, Updates and Shop have no `dark:` classes, correctly. The sweep at the end
ports those 18 overrides scoped to `.tw-scope` and matched against `[data-theme="dark"]`,
which is the mechanism `tailwind.css`'s custom variant already points at.


## פרופיל, after two owner reviews on 2026-09-06

The tab shipped as a stacked page of nine sections and ran to four thousand pixels. Two
reviews took it apart.

**First review — the order.** Attendance to the top, language and brightness to the bottom,
contact last, and a new פרטים אישיים section for the guardian's own record.

**Second review — the shape.** "A card of buttons, so the screen isn't full and stacked."
The page is now a menu; each row opens a sheet.

| Row | Sheet holds |
|---|---|
| פרטים אישיים | name, email, phone + an edit sheet writing `PATCH /me/profile` |
| המתאמנים שלי | a row per child **with their attendance %**, → the child's card, + add a child |
| תשלומים | one sentence of coverage, the method, `כל התנועות` |
| המועדון | WhatsApp / call / email, the address, directions |
| הגדרות | language, theme, privacy, calendar feed, studio switcher, sign out |

A row carries its title and nothing else, except a **red dot** when something needs the
parent — an unpaid balance or a missing declaration. "Without the data itself" was the
instruction; a silent row would hide a debt behind a popup, and a dot is a mark, not a number.

### Two sections left the tab

- **נוכחות is no longer a section.** It is a per-child number, and putting it on a family
  screen is what forced a child picker onto a screen about nobody in particular — while the
  child's own card had shown the full record all along. The percentage now sits on the
  child's row inside המתאמנים שלי. **Nothing on Home:** those chips are a FILTER, one
  already carries a count of children, and a second number meaning something else on the
  same row is the confusion the updates counter had to be fixed for.
- **היסטוריית רכישות moved to חנות המועדון**, as ההזמנות שלי. They are shop orders, the
  prototype's own GearScreen puts an order tracker at the top of the shop, and on פרופיל
  they sat two rows under היסטוריית תשלומים reading the same charges.

### תשלומים answers "am I sorted", not "charged versus paid"

The first build led with `סך החיובים ₪1,280 / שולם ₪960` — a bookkeeper's view, and the
owner's review said the filling made no sense. It does not, because most families pay in
bulk: cheques for the season, cash three months ahead. `coverageFrom` takes the furthest
settled TUITION period and says **משולם עד יוני 2027**. Only a card payer sees a balance to
act on, and only a card payer sees the note about where card details are handled.

### The fast path, instead of a side menu

The owner asked whether a side drawer should come back for faster access. It should not —
the drawer's problem was never capacity, it was that a hamburger hides everything equally.
Instead **a child's name on a Home session card is a link to their card**: the name is
already on screen at the moment a parent is thinking about that child.
