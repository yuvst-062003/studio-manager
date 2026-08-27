# Parent app — canvas-to-code gap spec

**Written:** 2026-08-27
**Surface:** `web/apps/parent/` · 390×844 · Hebrew RTL · installable PWA (§6.5)
**Reference pages:** [`docs/design/canvas/01-parent-app/Parent App.dc.html`](../canvas/01-parent-app/Parent%20App.dc.html) — open in a browser and jump with an anchor, e.g. `Parent App.dc.html#12a`.

> **This is a gap audit, not a design spec.** The per-artboard design specs already exist in
> [`docs/design/specs/`](../specs/README.md) — one file per artboard, with regions, states, token
> roles, primitives and i18n keys. Read those to know *what a screen should be*. Read this to know
> *what shipped, what is missing, and where the code is*.

## How this was measured

All 20 parent artboards (24 variants including light/dark and ×2 pairs) were rendered in
headless Chromium and compared against the shipped app at **exactly 390×844** — the size the
artboards are drawn at — signed in as the `parent1` persona with a seeded family
(5 children, 43 sessions, 3 months of charges).

Counted per screen: lines of rendered text, interactive controls, distinct non-grey accent
colours, coloured bars.

## Summary

The parent app is **the healthiest surface in the product**. Home, payments and the drawer
are at or above their mockups. The gap is concentrated in five screens that ship as empty
states, and in **seven built screens that nothing renders**.

| Metric | Artboards | Shipped |
|---|---|---|
| Distinct accent colours | 1–8 | 0–3 |
| Coloured bars | 12 (`13a` 5, `13c` 7, `2c` 4, `12e` 1) | **0** |

---

## Screen-by-screen

Legend — `OK` close to spec · `PARTIAL` present but thin · `SHELL` empty state only ·
`UNREACHABLE` built but nothing renders it.

### `#/` — home
- **Reference:** `Parent App.dc.html#1a` (33 lines / 12 controls, light + dark) and `#2a` (38 / 37)
- **Source:** [`web/apps/parent/src/features/home/ParentHome.tsx`](../../../web/apps/parent/src/features/home/ParentHome.tsx)
- **Measured:** 34 lines · 37 controls · 3 accents · **Status:** OK

The strongest screen in the product. Day strip, `חוב פתוח 4,800₪`, upcoming lessons, children.

Build:
1. **The combined alert line.** `1a` shows one row — `חוב 320₪ · הצהרת בריאות לנועה חסרה` —
   with a single `טיפול` action. Shipped surfaces debt only and **drops the missing-health
   warning entirely**, which `1a` labels `נדרשת לפני השיעור הבא`.
2. **`מתקיים כעת`** live-now marker on a session in progress.
3. **Per-child rows.** Children currently render as one concatenated string
   (`איתי כהן · דנה כהן · יונתן כהן · …`); `2a` gives each child a row with group and status.
4. Per-lesson hall (`אולם א׳`), the `מחר, יום ב׳` next-day section, and `חזרה להיום`.

### `#/calendar` — child calendar
- **Reference:** `#12b` (54 / 8) · **Source:** [`features/schedule/ChildCalendar.tsx`](../../../web/apps/parent/src/features/schedule/ChildCalendar.tsx), [`ScheduleSection.tsx`](../../../web/apps/parent/src/features/schedule/ScheduleSection.tsx)
- **Measured:** 81 lines · **2** controls · 1 accent · **Status:** PARTIAL

More lines than the mockup, but 81 of them are the numbers 1–31: it is a bare month grid.

Build:
1. **The attendance legend and per-day state** — `נכחה` / `לא נכחה` / `הודעתם מראש` / `מתוכנן`.
   This is the entire purpose of the screen and no day currently carries a state.
2. Per-child header and switcher (`הלוח של דנה`).
3. Week / month toggle.
4. Month summary — `6 מפגשים שהיו · 3 מתוכננים · 67%`.

### `#/payments` — payments
- **Reference:** `#1b` (36 / 15) and `#12f` (26 / 30)
- **Source:** [`features/billing/PaymentsSection.tsx`](../../../web/apps/parent/src/features/billing/PaymentsSection.tsx), [`PaymentsScreen.tsx`](../../../web/apps/parent/src/features/billing/PaymentsScreen.tsx)
- **Measured:** 73 lines · 17 controls · **Status:** OK / PARTIAL

Richer than either mockup in raw content. Month and instalment chips work.

Build:
1. **Category tabs** `הכל / מנויים / ציוד / אירועים` (`12f`).
2. **Two summary tiles** — `שולם השנה`, `יתרה פתוחה`.
3. **Paid history rows** with method — `01.08 · כרטיס אשראי ****4471` — and the arrears badge
   `לא שולם · 42 ימי פיגור`.
4. **The D9.3 receipt rule.** `12f` was retitled from `קבלות ותשלומים` to `תשלומים` and its
   email affordance narrowed to card rows: *"קבלה מונפקת לתשלומי כרטיס בלבד — אפשר לשלוח למייל"*.
   §5.10 issues no tax document for cash, bank transfer or הוראת קבע. A non-card row must show
   the payment as recorded **without implying a receipt exists**.
5. **The double-charge warning** — `רשומה הוראת קבע פעילה — ודא שאינך משלם פעמיים` (`1b`).
   §Gotchas: הוראת קבע cannot be created programmatically and is marked paid by hand, so this
   warning is the only guard against a parent paying twice.

### `#/announcements` — club inbox
- **Reference:** `#2b` (21 / 8) · **Source:** [`features/comms/InboxScreen.tsx`](../../../web/apps/parent/src/features/comms/InboxScreen.tsx)
- **Measured:** 5 lines · 1 control · **Status:** SHELL — all 21 mockup lines absent

Build: the `דורש פעולה` action-required card that pins to the top until acknowledged, with
`מילוי הצהרה` / `אחר כך`; dated club announcements with body text; per-child attribution
(`דנה · ג׳ודו / מתחילים`); receipt entries.

**Scope guard:** `2b` had its second tab (`שיחה עם המשרד`) cut by **D9.1** — §2.3 puts in-app
two-way chat out of scope, and §5.11 permits exactly two levels: push, and a one-way inbox.
`tests/contracts/test_canvas_matches_spec.py` fails if it reappears. Build the inbox only.

### `#/events` — events
- **Reference:** `#12h` (31 / 3) · **Source:** [`features/events/ParentEventsScreen.tsx`](../../../web/apps/parent/src/features/events/ParentEventsScreen.tsx)
- **Measured:** 2 lines · 0 controls · **Status:** SHELL (no events existed when measured)

Build: the `2 ממתינים לתשובה שלכם` counter; per-event cards typed
(`תחרות` / `אימון מיוחד` / `מבחן חגורה`) with child attribution, venue, weigh-in time, fee;
`אישור השתתפות` / `לא נגיע`; consent requirement and closing date
(`נדרש אישור הורה · ההרשמה נסגרת ב־30.08`); already-confirmed state (`אישרתם · דנה, יוסי`).

### `#/shop` — club shop
- **Reference:** `#12e` (20 / 24, 1 bar) · **Source:** [`features/billing/ShopSection.tsx`](../../../web/apps/parent/src/features/billing/ShopSection.tsx), [`OrderItemsScreen.tsx`](../../../web/apps/parent/src/features/billing/OrderItemsScreen.tsx)
- **Measured:** 1 line · 0 controls · **Status:** SHELL

Build: product cards (`חגורה 35₪` with `כל הצבעים · מידות 000–4`, `ג׳ודוגי 220₪`,
`תיק מועדון 70₪`); **the promotion-triggered prompt** `דנה קודמה לחגורה ירוקה — כדאי להזמין
חגורה חדשה`; `ההזמנות שלי` with delivery state `שולם 14.10 · ממתין למסירה בשיעור`.
Delivery is marked by the coach in the staff app — see [`staff.md`](staff.md) `11a`.

### `#/profile` — profile and leaving
- **Reference:** `#12i` (19 / 36) · **Source:** [`features/people/ProfileSection.tsx`](../../../web/apps/parent/src/features/people/ProfileSection.tsx), [`ProfileAndLeave.tsx`](../../../web/apps/parent/src/features/people/ProfileAndLeave.tsx)
- **Measured:** 15 lines · 6 controls · **Status:** PARTIAL

Shipped lists children and guardians. Build: the guardian's own identity block (name, phone,
email) with `עריכה`; payment method (`****4471`); notification count (`7 מופעלות`); dark-mode
toggle **with a visible state label**; club contact footer. Keep the existing
`עזיבת המועדון` flow and the primary-guardian explainer.

### `#/add-child` — add a sibling
- **Reference:** `#12g` (20 / 13) · **Source:** [`features/people/AddSibling.tsx`](../../../web/apps/parent/src/features/people/AddSibling.tsx)
- **Measured:** 8 lines · 1 control · **Status:** PARTIAL

Shipped is four bare fields and an empty group dropdown.

Build: **group cards** rather than a `<select>` — each with schedule, age band and capacity
(`א׳ 16:00 · ה׳ 16:00 · גילאי 5–7`, `14/20`, and `מלאה — אפשר להצטרף לרשימת המתנה` at
capacity); **the sibling-discount line** `הנחת אח/ות 10% תחול אוטומטית — 288₪ לחודש במקום 320₪`;
the three-step explainer (approval → health declaration → billing starts).

### `#/belts/<studentId>/<classId>` — belt progress
- **Reference:** `#12d` (17 / 2, 6 accents) · **Source:** [`features/belts/BeltProgressScreen.tsx`](../../../web/apps/parent/src/features/belts/BeltProgressScreen.tsx)
- **Measured:** 4 lines · **Status:** PARTIAL

**Note the route takes two segments.** `App.tsx:194` requires `belts.length === 2` — student
*and* class. A single-segment `#/belts/<studentId>` silently falls through to home.

Build: current belt with date and the rank-of-nine explainer
(`דנה בחגורה ירוקה — הדרגה השישית מתוך תשע במועדון`); **the belt bar itself, with the D7 ring**;
the upcoming exam with eligibility evidence (`דנה עומדת בתנאים — 92% נוכחות, 4 חודשים בחגורה`),
fee, and `אישור השתתפות` / `לא נגיע`; past promotions (`כתומה → ירוקה`).

### `#/directions`
- **Source:** [`features/people/DirectionsScreen.tsx`](../../../web/apps/parent/src/features/people/DirectionsScreen.tsx) · 3 lines · no artboard. Currently `המועדון עדיין לא הזין כתובת`.

### Account drawer
- **Reference:** `#2e` (24 / 38) · **Source:** [`web/packages/ui/src/shell/NavDrawer.tsx`](../../../web/packages/ui/src/shell/NavDrawer.tsx), [`AccountDrawerFooter.tsx`](../../../web/packages/ui/src/shell/AccountDrawerFooter.tsx), [`StudioSwitcher.tsx`](../../../web/packages/ui/src/shell/StudioSwitcher.tsx)
- **Measured:** 57 lines · 70 controls · **Status:** OK — exceeds the mockup

Build: **multi-club switching** — `מכבי ג׳ודו רעננה · דנה, יוסי` / `קראטה הוד השרון · נועה`
with a `חוב` marker per club (§6.3's guardian across studios); the counts
`הילדים שלי 3`, `מסמכים והצהרות 1 חסר`.

---

## Public landing (§5.4a lead funnel)

- **Reference:** `#13a` mobile (56 lines / 5 controls / **5 bars**), `#13b` confirmation
  (11 / 2), `#13c` desktop (46 / 1 / **7 bars**)
- **Source:** [`features/landing/PublicLanding.tsx`](../../../web/apps/parent/src/features/landing/PublicLanding.tsx), [`BookingFlow.tsx`](../../../web/apps/parent/src/features/landing/BookingFlow.tsx), [`BookingConfirmed.tsx`](../../../web/apps/parent/src/features/landing/BookingConfirmed.tsx)
- **URL:** `/t/<slug>` (e.g. `/t/demo`)
- **Measured:** **10 lines, 157 characters — byte-identical at 390px and 1440px**
- **Status:** SHELL

This is the top of the funnel and §2.1 puts it in v1. There is also a **separate gap note** at
[`docs/design/landing-page-gap.md`](../landing-page-gap.md).

Build:
1. **A desktop layout.** `13c` is a distinct 1440px design with a **sticky side form**;
   shipped renders the mobile layout at every width.
2. The belt-ladder graphic (`מסלול החגורות במועדון — מלבנה עד שחורה`) — 5 bars mobile, 7 desktop.
3. Three credibility stats — `214 חניכים פעילים`, `18 שנים ברעננה`, `4 מאמנים מוסמכים`.
4. `איך נראה שיעור ניסיון` — the three numbered steps.
5. Group times, address, phone.
6. **`13b` confirmation** — `נשמר מקום לאורי`, date and venue, `הוספה ליומן`,
   `חתימה על ההצהרה`, and the WhatsApp fallback line.
7. Groups must be **published** to the landing — it currently reports
   `המועדון עדיין לא פרסם קבוצות`.

**Bug:** the anonymous landing page issues `GET /api/v1/auth/refresh` and takes a **401**.
A public page should make no authenticated call.

---

## Unreachable code — built, tested, rendered by nothing

Each of these is referenced **only** by its feature's barrel `index.ts`. Wiring them is
cheaper than any other item in this spec.

| File | Artboard | Where it belongs |
|---|---|---|
| [`features/absence/AbsenceScreen.tsx`](../../../web/apps/parent/src/features/absence/AbsenceScreen.tsx) | `#12a` | A route + entry from `#/` and `#/calendar` |
| [`features/people/FirstRegistration.tsx`](../../../web/apps/parent/src/features/people/FirstRegistration.tsx) | `#12j` | The invite/onboarding-link flow |
| [`features/billing/PaymentHistoryScreen.tsx`](../../../web/apps/parent/src/features/billing/PaymentHistoryScreen.tsx) | `#12f` | Below `#/payments` |
| [`features/billing/PaymentCompleteScreen.tsx`](../../../web/apps/parent/src/features/billing/PaymentCompleteScreen.tsx) | — | uPay return leg (§5.10) |
| [`features/billing/PaymentStrip.tsx`](../../../web/apps/parent/src/features/billing/PaymentStrip.tsx) | — | Payment summary strip |
| [`features/comms/CalendarSync.tsx`](../../../web/apps/parent/src/features/comms/CalendarSync.tsx) | — | Calendar subscription |
| [`features/comms/EventCalendarButtons.tsx`](../../../web/apps/parent/src/features/comms/EventCalendarButtons.tsx) | `#13b` | `הוספה ליומן` |

**`AbsenceScreen` is the most consequential.** §5.14's *"הודיעו מראש"* is a v1 rule, the staff
roster already consumes the state, and the dashboard counts it — but **nothing in the parent
app can produce it**. `12a` specifies: child picker, session picker, a date range for illness
or holiday, optional reason chips (`מחלה` / `אירוע משפחתי` / `חופשה` / `אחר`), and the deadline
`אפשר לעדכן עד תחילת השיעור`.

## Health declaration — reachable but check the entry

- **Reference:** `#12c` (14 / 6) · **Source:** [`features/health/DeclarationForm.tsx`](../../../web/apps/parent/src/features/health/DeclarationForm.tsx), [`SignaturePad.tsx`](../../../web/apps/parent/src/features/health/SignaturePad.tsx), [`HealthGate.tsx`](../../../web/apps/parent/src/features/health/HealthGate.tsx)

Rendered by `HealthGate`, so it is reachable — but no screen we captured routed to it, and
home drops the `הצהרת בריאות חסרה` warning that is supposed to lead there. Verify the entry
point from home and from the inbox action card.

Per **D11**, the form is a structured question set with a finger signature — not a signed PDF —
because coaches see only `derived_flags`. The screen must state that the bundled template is a
starting point and **not a compliance artefact**.
**Never log declaration contents** (`CLAUDE.md` §Gotchas, §11.1).

## Student card

- **Reference:** `#2c` (22 / 4 — **8 accents and 4 bars, the richest parent artboard**)
- **Source:** [`features/people/StudentCard.tsx`](../../../web/apps/parent/src/features/people/StudentCard.tsx) (reachable via `GuardiansSection`)

Build: belt with date and next exam; an **8-session attendance strip** with counts
(`נכח 5` / `לא נכח 1` / `הודעתם 1` / `לא סומן 1`); documents and debt in one place;
`החלף ילד`.

---

## Cross-cutting work

1. **Bars.** Zero render in this app against 12 in the artboards. Add `BeltBar` (with the
   **D7 1px ring**) and an attendance-strip primitive to `web/packages/ui/src/primitives/`.
2. **Accent colours.** Artboards use 1–8 per screen; shipped uses 0–3. Use the semantic
   tokens (`debt` / `paid` / `pending` / `cancelled`) from
   [`tokens.css`](../../../web/packages/ui/src/tokens.css) — never a raw hex, and never the brand
   colour in a status position (**D2**).
3. **Three 404 endpoints.** The app calls, and takes a 404 on, all three:
   `GET /api/v1/me/standing-order-links`, `GET /api/v1/me/payment-promises`,
   `GET /api/v1/me/prepay-terms` — the features on branch
   `feat/plans-payment-routes-prepayment`. The payments screen degrades silently.
4. **i18n.** Strings live in `web/packages/i18n/he/<namespace>.ts` (`billing`, `comms`,
   `people`, `health`, `schedule`, `events`) mirrored in `en/` and `ru/`. **Rubik covers base
   Cyrillic** (D6) so Russian renders in the same family — do not add a font.
5. **Logical CSS only** (**D10**): `margin-inline-start`, never `margin-left`.

## Log

### 2026-08-27 · P4–P11 — the rest of the parent surface

**P4/L6.** The public routes resolve BEFORE any session hook can mount — the old shape
ran `useSession()` first, so every anonymous landing view fired `/auth/refresh` into a
401. A test asserts `/t/<slug>` signed out issues only the public read. `signedIn` on the
landing is now the in-memory token, never a request.

**P5.** 2b's דורש פעולה card pins unread health notices above the feed (מילוי הצהרה
routes home where the gate holds the form; אחר כך marks read, which clears the pin), and
the events list gained its consent state and closing date. The chat tab stays cut (D9.1,
pinned by the contract test — untouched). 12h's other elements were already built; the
audit measured it with no events seeded.

**P6.** Group CARDS with schedule days and age band, from the same public projection the
landing shows (resolved through /me/studio's slug), plus the three-step explainer ending
with "nothing is charged yet". **Two deliberate absences:** capacity/waitlist — the
2026-08-27 decision cut group caps from the product, so the spec's מלאה state is stale —
and the sibling-discount line, because NO automatic sibling discount exists in W4's
pricing (a discount is a manager's manual negative charge); drawing a computed 10% would
state a rule the product does not have.

**P7.** A single-segment `#/belts/<student>` resolves through the child's own belt
history (award rows now carry `class_id`) or refuses visibly; bare `#/belts/` refuses the
same way. Found on the way: `GET /belt-ranks` was staff-only — the routed parent
progression screen answered 403 for every guardian — and nothing anywhere linked to 12d.
Both fixed (the guard is signed-in now; the card's belt section links to 12d).

**P9.** `POST /auth/switch-studio` existed and `StudioSwitcher` existed — and no app
passed `onSwitchStudio`, so no multi-studio person had a switcher at all. Wired in all
three apps through a new core `switchStudio()` that adopts the rotated session and
fires `STUDIO_SWITCHED_EVENT`; every mounted `useSession` re-reads, so every /me screen
follows the new club without a reload. The drawer carries 2e's counts (children, missing
declarations). **Decided limitation:** the per-club debt marker renders for the ACTIVE
club only — a cross-club balance would need the cross-tenant read `TenantSession` exists
to forbid, and the switch is one tap.

**P10.** 12d already rendered `BeltBar` (the audit's "nothing imports it" was overtaken
— drift, recorded); 2c now does too, plus the shared strip. The four strings resolved per
the spec's own table: two deleted with their features (P2/P3), the landing's 503 copy
kept (correct as written), and `common.home.childrenComeLater` kept — verified as
guidance ("the manager links a child at registration"), not a promise.

**P11 — the investigation, closed as CONFIRM.** The feared lockout cannot happen:
`chase_renewals` writes nothing to any row (`valid_until` stays NULL; its docstring says
so), and `_advance_status` moves `health_status` only FORWARD — its own comment names
this exact lockout as the reason. A renewal is an always-on inbox warning
(`health.declaration_renewal`, which P5's action card now pins), never a closed door. The
current behaviour already IS the narrower rule the spec proposed, so nothing changed;
`test_a_renewal_never_returns_a_signed_family_to_missing` is the tripwire if either half
ever does.

**P8, status.** Retry everywhere (the LoadFailed sweep), no failed money read renders as
a number (PaymentsSection fails whole rather than zeroing), and §10.1's vocabulary stays
AbsenceScreen's. **The iOS push-ladder walk is NOT done:** it requires installing the PWA
on a physical iPhone, which this session cannot do. The ladder's states are modelled and
unit-tested (`usePushRegistration`, `platformOf`, `PushDisabledBanner`); what remains is
the on-device verification, reported rather than routed around.


### 2026-08-27 · P2 + P3 — the card's four quarters, and a calendar that answers its question

**P2.** The four sections M4, M5, M6 and M7 each left for someone else are registered:
belt (BeltBar with its D7 ring, current belt + date + past promotions, from
`/students/{id}/belts`), attendance (the shared `AttendanceStrip` primitive over
`GET /me/attendance` — this surface and the staff card cannot drift apart now),
documents (declaration STATUS from the summary the container already holds — no fetch,
no contents, per §5.5), and payment (P1's `PaymentStrip`, household balance per §6.3).
`people.card.sectionsComeLater` is deleted from all three locales, with its render sites
in `StudentCard` and `FirstRegistration`. **One simplification, decided:** the belt
section shows current + history but not the "next exam" caption — exam scheduling is
readable through `/me/events` and renders on the events screen; duplicating it on the
card would give the product two answers about the same exam. The full progression stays
on `12d`, one tap away.

**P3.** Every day in the month carries its real state — from `GET /me/attendance`, whose
docstring names this screen as its second consumer — worst-first when two children share
a day (an absence outranks a presence), with the four-state legend, the per-child
switcher (`הלוח של דנה`), a month/week toggle, the month summary
(`X מפגשים שהיו · Y מתוכננים · Z%`), and colour never alone. A filed absence report
renders as `הודעתם מראש`, which P1's routing finally made producible. The month window
sits well inside the endpoint's 62-day cap; a year view would not, and none is offered.
`schedule.calendar.attendanceComesLater` is deleted.


### 2026-08-27 · P1 — the seven screens nothing rendered, plus the container nobody counted

**What was wrong.** Seven built, tested components were referenced only by their barrels.
Worse than the audit knew: the `2c` StudentCard **container itself** was mounted by nothing
(the audit assumed it rendered with three sections; in fact no route reached it, and — per
the S1 guard finding — even its three sections were registered only by tests). And uPay's
`returnurl` pointed the paying parent's browser at the JSON status endpoint — a parent who
paid landed on raw JSON.

**What was built.**
- `#/absence` routes `AbsenceScreen`, entered from home (`דיווח היעדרות` beside the
  lessons). Its refuse-offline behaviour is untouched. Nothing in the product could
  produce an absence report until this line of routing; now the staff `הודיעו מראש` state
  has a producer.
- `#/payments/history` routes `12f` — the hash `PaymentsSection` has linked to since W8.
  The per-row receipt email is **withheld**, not wired to a pretend send: no provider-side
  resend exists (we hold only the uPay form and its IPN; the receipt lives in uPay's
  dashboard). `onEmailReceipt` is optional and the affordance renders only when a real
  handler exists.
- `#/payment-complete/<ref>` is the uPay return leg; `orders.py` now sends the browser to
  the parent app (via `app_origin`, falling back to the API URL while production hosts are
  PENDING), and the screen polls the status endpoint — honest that only the IPN settles.
- `#/student/<id>` routes the `2c` card, entered per child from home. M6's money rows
  landed as `StudentCardBillingSection` rendering `PaymentStrip` — household balance per
  §6.3, hidden at zero by the strip's own contract, and a failed read renders NOTHING
  rather than a reassuring zero (P8's rule).
- `CalendarSync` renders under `#/calendar` — the feed subscription lives where a parent
  thinking about calendars already is.
- `EventCalendarButtons` renders on `7d` once an RSVP is yes (§5.12's per-event add). `13b`
  wiring stays with the landing spec's L5.
- `FirstRegistration` renders in `JoinFlow`'s done state, showing the children `/me/students`
  now holds.

**Decided.** Receipt email withheld (above). The student-card entry is a per-child link
beside the filter chip — the chip keeps 1c's one-tap-one-meaning rule.
