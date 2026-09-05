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
| `myChildren` `/` | Home's per-child chips, and Profile's trainee cards | checkpoints 2 and 5 |
| `calendar` `#/calendar` | a **modal inside Home** (§4) | checkpoint 2 |
| `payments` `#/payments` | **Profile** — balance, method, history | checkpoint 5 |
| `announcements` | **tab 3** | ✅ now |
| `events` `#/events` | **no dedicated surface** (§4) — events appear in Home beside every other session | checkpoint 2 |
| `shop` `#/shop` | **tab 2** | ✅ now |
| `addChild` `#/add-child` | **Profile**, under the trainee cards | checkpoint 5 |

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
