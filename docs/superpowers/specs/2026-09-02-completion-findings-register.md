# Completion findings register — 2026-09-02

**This is not a plan.** It is the raw output of one gathering session: what is wrong with
the product, found by looking, before anybody decides what to do about it. A later session
turns some subset of this into work. Nothing here is prioritised for you — the tiers are
by *kind of failure*, not by what to fix first.

| | |
|---|---|
| **Occasion** | The first real club manager is trialing the product. He gives feedback on 2026-09-03. |
| **Environment** | He is on **production**, with real club data. |
| **Method** | Seven code investigations, three screenshot audits (all three apps), a production-vs-staging bundle reconciliation, and the manager's own four complaints traced to cause. |
| **Evidence** | `docs/screenshots/{dashboard,parent app,staff app}/` — 28 captures, 2026-09-02 20:35–20:49. Dashboard from production; parent and staff from staging. `docs/qa/2026-08-28-staging-verification/` — 95 older captures. |
| **Scale** | ~125 findings in 22 groups. |

> **Read [§0](#0-verify-these-first) before anything else.** Three checks take minutes and any
> one of them reorders this whole document.

---

## 0. Verify these first

These are not findings. They are questions the code cannot answer, whose answers change the
severity of everything below.

1. **Are the eight production cron services actually attached?**
   `docs/deploy/railway-runbook.md:200-224` lists attaching source, start command and
   schedule to each as *"Still to do by hand"*, and `docs/plan/state.yaml` does not record
   it done. If they are not attached: nobody has ever been billed, no session has ever
   moved to `completed`, no reminder or health chase has fired — and because `ops-check` is
   one of the eight, **nothing detects any of it**.
2. **Does a 2026-27 training year exist for the live club?** There is none in any seed,
   fixture or migration; every club must create its own. Without one, sessions stop
   generating *silently* (§4.2). Production screenshots show a schedule board for
   30 Aug–5 Sep, so one probably exists — confirm rather than assume.
3. **Does `/api/v1/health` report `"env":"production"`?** The `/dev/*` guard reads
   `settings.ENV`, and the runbook warns Railway's `--duplicate` copies `ENV=staging`
   verbatim. If it reports staging, `GET /dev/sign-in-as/platform` hands out a
   platform-admin session from a URL bar.

Also worth confirming: production is at Alembic head `0020` (migrations do not run on
deploy — the Dockerfile CMD is uvicorn only), and production really is on the custom
subdomains (`infra/railway/domains.json` says yes as of 2026-08-30; the runbook's Hosts
section still says generated Railway domains, and those would break the refresh cookie on
Safari outright).

---

## 1. The manager's four complaints, decoded

He said: *the sign-up wizard is not good — no forward/back buttons, too long*; *the design
of some screens doesn't look professional*; and that he is worried about *payments* and
*notifications*.

| His words | What is actually true |
|---|---|
| "No forward/back buttons" | Correct, **and already fixed on staging and in the working tree.** Production's parent bundle lacks `onboarding-wizard-back` and `join-payment-step`. See §5. |
| "Too long" | 28 required interactions for one child; **49 for two**. See §6.1. |
| "Doesn't look professional" | Confirmed and systemic. The dashboard and staff app have never had a design pass. See §7, §8. |
| "Worried about payments" | Right to be. Three separate wrong-money defects, plus הוראת קבע silently telling the club nothing. See §3. |
| "Worried about notifications" | Right to be, and worse than he knows: **push has never worked**, and the delivery report blames his families for not installing the app. See §2. |

---

## 2. Silent failures — reports success, does nothing

The most dangerous category: the product says it worked.

### 2.1 Push notifications have never worked, in two independent ways

- **No transport.** `app/services/comms/push.py` — no FCM/VAPID credential and no
  service-worker `push` handler. `RecordingPushSender` mints `f"rec-{uuid4().hex}"` and the
  worker writes `delivery.status = "sent"` (`app/workers/notify.py:157`). Tracked as
  `HB-push-transport`.
- **No token is ever created either.** Both registration hooks call
  `pushManager.subscribe({ userVisibleOnly: true })` with **no `applicationServerKey`**
  (`web/apps/parent/src/features/comms/usePushRegistration.ts:103`,
  `web/apps/staff/.../useStaffPushRegistration.ts:59`), and neither manifest carries a
  `gcm_sender_id`. Chrome and Safari both reject that subscribe. The catch sets state
  `'error'` — and `PushDisabledBanner` **renders null for `'error'`**
  (`PushDisabledBanner.tsx:51`), so the parent is told nothing.

**Consequence for the manager.** Every push delivery lands as `no_token`, which renders as
**"האפליקציה לא הותקנה"**. He looks at a delivery report, sees that against families who
*did* install, and starts phoning people whose only problem is a missing key on the server.
Worse than a false green: it sends him to do pointless work and blame parents.

`DeliveryReporter.RECEIVED = ("sent", "delivered")` (`notifications.py:284`) means that
once a transport does exist, "sent" will be counted and rendered as
`'delivery.allReceived'` — "every family received the message".

### 2.2 A cancelled class notifies nobody

The single case the `*/15` cron exists for — `infra/railway/jobs.json` argues for it by
name with *"ביטול שיעור, היום 17:00"*. `cancel_session`
(`app/services/schedule/service.py:955`) notifies no one. Event publish and cancel notify
no one. Belt promotion notifies no one.

**Three preference switches govern nothing**: `session_cancelled`, `coach_substituted`,
`belt` (`app/models/comms.py:87-96`). A parent can toggle "class cancelled" and it changes
nothing, because nothing was ever sent.

### 2.3 Two flagship alerts have no producer

- **`attendance.at_risk`** — §5.14's headline manager alert. Fully specified at
  `kinds.py:76`, consumed by the dashboard client and the staff app's `AtRiskAlert`, and
  **nothing produces it**. It renders an empty list forever.
- **`billing.payment_failed`** — referenced at `kinds.py:46`, `actions.py:57`,
  `models/comms.py:84`. It is the one kind deliberately exempted from the preference
  switch: an exemption for a message nobody sends.

### 2.4 The setup wizard discards coach invitation tokens

`StaffClient.invite` is typed `Promise<void>` (`web/packages/ui/src/setup-wizard/StaffStep.tsx:24`)
and the implementation discards the response body (`client.ts:179-186`). The manager fills
in his coaches at wizard step 5, sees "Awaiting first sign-in", and **holds nothing to send
them.** There is no mailer in this product — invitation links are handed to the manager to
share by hand (`app/services/structure/staff.py:256`). This is among the first things he
does, and it fails invisibly.

`invitedStaffCount: 0` is hardcoded (`client.ts:207`), so the wizard's students step always
reads "0 coaches invited" regardless.

### 2.5 Firing a coach does not end their session

`revoke_sessions_for_identity` (`app/services/identity/refresh.py:196`) is **dead code —
nothing calls it.** §5.2's coach-removal denylist write never happens; `deactivate` revokes
roles only. A removed coach keeps a working token until the 15-minute JWT expires.

### 2.6 Privacy export and erasure fail on purpose, hourly, in production

`assemble_export_bundle` and `purge_subject_data` raise (`app/workers/privacy.py:70`, `:97`).
The job runs at :20 past every hour and turns every request into `failed`. See §10.

### 2.7 Monthly report delivery returns `failed`

`app/routers/reports.py:158` swallows a `NotImplementedError` with the comment "COMMS lane
not yet implemented" — but COMMS shipped in W5. `POST /reports/.../deliver` also hardcodes
`status="queued"` regardless of outcome (`:156`). Stale code or a live hole; needs walking.

### 2.8 The monitor cannot reach anybody

`app/services/ops/checks.py` is genuinely good — it catches jobs that silently stop
running, zero-charge billing runs, and uPay going quiet. But `ALERT_EMAIL_TO` and
`SMTP_HOST` are unset, so `email_configured()` is False and the worker only logs
(`app/workers/ops_check.py:71-79`). It also cannot detect its own silence, by its own
admission. **There is no comms-specific check at all**: a notify run that "sends" 400
pushes to nobody is a green heartbeat.

---

## 3. Wrong money, wrong data

Three of these are visible on screen. He told you he is worried about payments.

### 3.1 The parent's payments screen does not add up

`docs/screenshots/parent app/…20.44.01.png` — total **₪850**; rows are 250 + 250 + 250 =
750, plus a bare **₪100 on its own line with no date, no child and no description.**

### 3.2 Every debt row contradicts itself

Same capture: all three rows read *"החיוב כלול בתשלום שכבר נפתח"* ("already covered by an
open payment") **while still being counted as open debt**.

### 3.3 Money renders mangled on the dashboard

`docs/screenshots/dashboard/…20.38.50.png` — the collection KPI reads **`0%₪0 מהצפוי`**:
amount and percentage fused, bidi putting `%` before `₪`.

### 3.4 The staff app shows `0 חיובים` beside `₪300`

`docs/screenshots/staff app/…20.48.23.png`. Same plural-rule family as §8.5.

### 3.5 Rollover will bill every student at last year's price

**The most consequential finding in this document.** `apply_prices`
(`app/services/schedule/rollover.py:500-545`) calls only `close_price_plan`, which stamps
`active_to` and opens a successor (`catalogue.py:293-331`) — and **never touches
`Student.price_plan_id`**. The billing run then fetches the plan by primary key
(`app/services/billing/run.py:343`) with **no `active_to` predicate anywhere in the file**.

Every existing student is billed last year's amount. The wizard reports `applied`, writes
audit rows and shows the new plan, so it looks like it worked. No log, no tally entry, and
invisible to `unpriced_students`, which filters only for NULL (`catalogue.py:188`). No test
covers it.

He would discover this from parents on 30 September — four weeks after tomorrow.

### 3.6 A student marked not-returning is dropped silently

`apply_students` sets `status='ended'` (`rollover.py:403-404`), which fails the billing
run's filter (`run.py:318`) before any tally. Recorded nowhere.

### 3.7 Two children's chips both read "אייל"

`…20.43.49.png` and `…20.45.40.png` — they are אייל סטולין and אייל ריבי. The child filter
is unusable on both home and calendar.

### 3.8 Home and the calendar disagree about the schedule

Home's "בהמשך השבוע" lists the 6th and 8th; the calendar marks planned sessions on the 3rd
and 4th as well.

### 3.9 Report charts truncate to nonsense

`…20.40.39.png` — month labels render `נובמבר 5…`, `ינואר 26…`: the ellipsis eats the year
and leaves its last digit, so November 2025 reads "November 5". The belt chart is 13 bars
of zero labelled `ל… ש… חו… כ… יר…`.

---

## 4. Rollover and September

Today is 2026-09-02. The Israeli training year turns now. W6 shipped 2026-08-27 with an
accessibility sweep as its exit gate; **`state.yaml` carries no caveat that rollover has
never run on live data.**

### 4.1 Every step is manual, and the entrance is hidden

No worker creates a year, generates sessions or activates anything. Nothing warns that a
year is expiring. `#/rollover` is reachable only from a nav entry inside the `canSeeMoney`
branch (`web/apps/dashboard/src/App.tsx:255, 432-437`).

### 4.2 Sessions stop generating silently

`_year_covering` (`app/services/schedule/service.py:155-159`, used at `:222-227`)
**silently skips** any occurrence whose date falls outside every declared year — the code
says "Silently skipped rather than raised". Downstream, lazily and with no error: the
calendar goes blank, the register cannot be opened (`app/services/attendance/roster.py:12-18`
deliberately never materializes), the trial picker returns empty
(`app/services/people/landing.py:174`), and the public landing page shows no classes.

### 4.3 Schedule edits become silent no-ops

Nothing closes a year by date, so 2025-26 stays `active`. `_preview` (`service.py:523`) and
`apply_schedule_change` (`:596`) expand rules against `ends_on = 2026-08-31` while
`change_window_start` (`:449-458`) forces `window_start = today`. Empty range, zero
sessions, no error.

### 4.4 The closures step is destructive and unguarded

`create_closure` (`service.py:339-347`) has no dedupe and cancels every session in range
(`:360-365`), and `ClosuresStep.tsx:208-214` has **no confirm dialog**. Running the wizard
twice cancels sessions twice. Announce publishes to every guardian in one call with no
confirm (`app/routers/rollover.py:293-300`). Activate has no confirm and no undo. Every
other step is safe to repeat.

### 4.5 The holiday presets are wrong for a September-to-July year

`presetYear` is hardcoded to the year's start (`RolloverWizard.tsx:412`) and
`presets_for_year` filters by that Gregorian year (`holidays.py:181-183`). The manager is
offered Rosh Hashanah, Yom Kippur and Sukkot, **never Pesach, Yom Ha'atzmaut or Shavuot
2027**, and is offered summer_break 2026, already past. The module docstring says a
September-to-June year is "a matter of asking twice"; the UI asks once.

### 4.6 Belts and age groups are manual by design

`rollover.py:36-39` forbids reading a birth date, asserted by
`tests/schedule/test_rollover.py:371`. Belt eligibility reads rank and `months_at_rank`
only. Deliberate, not a defect — recorded so nobody "fixes" it.

---

## 5. Deployment — production runs code that exists in no commit

Production's parent bundle contains `join-onboarding-rail`, `join-step-position` and
`join-terms-step`, and **none of those strings exists in any commit** (`git grep` across
HEAD finds zero files for all five markers). Production was deployed straight from an
uncommitted working directory, which is what `railway up` does.

**Git is not a record of what is running.**

### Bundle reconciliation, 2026-09-02

| App | Production | Staging | Verdict |
|---|---|---|---|
| Staff | 2,510 identifiers | 2,510 | **Identical, zero differences** |
| Dashboard | 2,517 | 2,517 | **Identical, zero differences** |
| Parent | 2,501 | 2,531 | **Staging is 30 strings ahead** |

So the staff and dashboard findings in §7 and §8 — taken from staging captures — apply
exactly to what the manager is testing.

The 30 strings production is missing are precisely the wizard rework: the whole
`join.*` family (address, city, aliyah year, national id and its invalid message, the
relation radio, the pickup card, the students title, the verified-email line), the
adult-student strings (`join.selfChip`, `join.selfStudentAlso`, `join.selfStudentHint`,
`join.soloNote`, `join.yourDetailsSolo`), `clubTerms.onceForFamily`, and
**`onboarding.stepOf`** — the "step X of Y" counter. Plus `onboarding-wizard-back` and
`join-payment-step`.

**His loudest complaint is against a build one iteration old.** He will see the old wizard
tomorrow unless that build ships.

---

## 6. The parent journey

### 6.1 "Too long" is measurable

| Step | Screen | Controls |
|---|---|---|
| 1 | Consent (`ConsentGate.tsx:156-204`) | 2 checkboxes + 2 optional |
| 2 | Club terms (`ClubTermsStep.tsx:97-102`) | 1 checkbox |
| 3 | Family (`JoinFamilyStep.tsx:279-583`) | **18** for one child, 9 required |
| 4 | Health (`DeclarationForm.tsx`) — **per child** | 13 booleans + emergency phone + clause + signature |
| 5 | Payment (`JoinFlow.tsx:271-290`) | 1 of 4 routes, then a per-child summary |

**One child ≈ 28 required interactions. Two children ≈ 49**, because step 4 repeats in full.

Only 8 of the 13 health questions are enforced and the parent cannot tell which 5 are
optional. `markAllHealthy` (`DeclarationForm.tsx:196-203`) fills every blank with "no" in
one tap — the single biggest length mitigation in the product, buried mid-form.

### 6.2 Validation refuses invisibly — the core of "the wizard is not good"

The forward button is disabled while the form is invalid
(`JoinFamilyStep.tsx:606` → `WizardNavButtons.tsx:39`), so `submit()` never runs, so
`setShowErrors(true)` (`JoinFamilyStep.tsx:211`) is **unreachable**. Consequently
`idError`/`requiredError` always return `undefined`, no field ever turns red, and the
"fill the required fields" alert (`:594-598`) never renders. A parent missing one of nine
fields sees a grey button and **no reason at all**. `ClubTermsStep` does not have this bug,
because its button is not disabled.

Separately, `JoinFlow.tsx:189,200-202` collapses every non-2xx to `common.error.generic`,
discarding the `{code, field}` the server sends for an invalid national id
(`app/routers/onboarding.py:365-369`).

### 6.3 Back is broken three different ways

- **Step 3 → 2** works but **destroys all 18 fields** — `JoinFamilyStep` unmounts and
  returns a fresh `emptyChild()` (`JoinFamilyStep.tsx:149`).
- **Step 4 → 3** is a trap. The children already exist server-side, so resubmitting hits
  `DuplicateStudentError` (`app/services/people/onboarding.py:225`), `created_pairs` is
  empty, and `_apply_family_details` is **skipped entirely** (`:428`). The parent retypes
  18 fields and nothing is written.
- **Step 5 → 4** is **inert** — the effect at `JoinFlow.tsx:122-131` immediately pushes
  back to payment. The button visibly does nothing.
- `JoinHealthStep` renders back twice — chrome (`:47`) and a second button (`:98`).

### 6.4 Nothing is saved between steps

No `localStorage`, no `sessionStorage`, no server draft anywhere in `features/onboarding/`,
`ConsentGate.tsx`, `ClubTermsStep.tsx` or `DeclarationForm.tsx`. Close the tab at the
health step and step 3's 18 fields, the terms tick and every health answer are gone.
Reopening `/join/<token>` restarts at `step = 'terms'`. **There is no resume path.**

### 6.5 The adult-student question is asked, badly

The checkbox exists (`JoinFamilyStep.tsx:559-582`, `join.selfStudentAlso` — "אני מתאמנ/ת גם")
but sits **last**, below "add another child", inside the students card. Ticking it *keeps*
the blank child row and appends a self row, so `hasMinorChildren` stays true and the
relation control, the other-parent card and the pickup card all remain. `adultOnly` only
becomes true after the parent manually deletes the blank child — which makes
`join.selfChip`, `join.soloNote` and the `yourDetailsSolo` title unreachable on the
default path.

### 6.6 The three entrances share nothing

- **Landing / trial booking** (`features/landing/BookingFlow.tsx:45,147`) — its own 4-step
  wizard (`you`, `children`, `health`, `slot`) with its own `StepProgress` rail whose
  passed steps are **clickable**. No consent, no club terms, no payment.
- **`/join/<token>`** — the 5-step wizard above.
- **`#/join`** (`people/JoinClubSection.tsx:78-88`) — a group picker for one existing trial
  child. No chrome, no rail, no back.
- **`#/add-child`** (`people/AddSibling.tsx`) — 3 text fields plus a prose explainer. No
  chrome, no rail. Both fall back to the app-level gate stack (`App.tsx:681-700`), which
  also renders without the rail.

### 6.7 The rail — correct, with two dead constants

Consent *is* rendered at position 1 inside the same chrome (`ConsentGate.tsx:255-263`), so
1-2-3-4-5 is consistent. But `JOIN_STEP_POSITION` (`JoinFlow.tsx:36-41`) is read only for
`terms` and `payment`; `family` and `health` are hardcoded in their child components
(`JoinFamilyStep.tsx:270`, `JoinHealthStep.tsx:49`) — two sources of truth that happen to
agree. The rail is **absent** on the sign-in wall (`JoinFlow.tsx:145-155`) and the
expired-token screen (`:134-142`).

### 6.8 Two dead ends where a parent can never finish

- If `client.consents()` rejects, `ConsentGate` stands aside (`:120`) but `JoinShell`'s
  children are `consentReviewed ? <JoinFlow/> : null` — so `/join/<token>` renders a
  **completely blank page**.
- When all children are duplicates, registration details are never written, so
  `registration_complete` stays false (`app/services/health/agreement.py:204-211`),
  `agreement_complete` stays false, and `needsFullDeclaration` keeps returning the same
  child forever. The parent signs the declaration, sees the green "submitted" alert, and
  **the wizard never advances to payment.** That is exactly the trial-family funnel
  `app/routers/onboarding.py:303-310` says this door exists to serve.

---

## 7. Payments

The backend is the strongest thing in this repo — persist-the-raw-IPN-first, idempotent on
`transactionid`, refuses rather than coerces, integer agorot so a `₪1` callback is not
misread as tampering, source IP as a signal and never a gate
(`app/services/billing/reconciliation.py`, `app/routers/webhooks.py`). E2E-3 and E2E-4
specs exist. **The risk is not the plumbing.**

### 7.1 הוראת קבע: the parent picks it and the club learns nothing

`tellTheManager()` loops only `['cash','cheque']` (`PaymentSetup.tsx:283`). A family
choosing standing order for every child presses סיום and **no promise, no flag and no note
is written.** The manager's standing-order filter (`PaymentPromisesPanel.tsx:31`) can never
show a row that came from onboarding. This is the primary Israeli payment route.

Three manual acts follow and the app surfaces only the third: an admin must first paste a
uPay link per price plan (`app/routers/billing.py:286-317`); every arriving mandate IPN
carries no order ref, so `verify_ipn` raises `NotAnOrderIpnError`
(`reconciliation.py:162-166`) and settles nothing until a human presses ✓ in the
reconciliation queue.

### 7.2 In the wizard, standing order hands out zero links

`App.tsx` fetches `/me/standing-order-links` on `[session.status]` — **before the children
exist** — and never refetches after registration, so `PaymentSetup.tsx:363` always misses
and every child shows the wrong fallback sentence. The links also carry no `target`/`rel`
(`:372-384`), so from `/join/<token>` they navigate the tab away and returning restarts the
wizard.

### 7.3 It is a dead end on the payments screen too

`…20.44.21.png` — two sentences, no button, no link, while the other three routes all have
actions.

### 7.4 A failed card payment renders as a successful one

`PaymentCompleteScreen.tsx:38-56` has three branches — `paid`, `amount_mismatch`, and
everything else; `failed`, `expired` and `pending` all render *"התקבל, מאמת תשלום…"*.
`billing.order.status.failed` exists (`i18n/he/billing.ts:208`) with no parent-app call
site. The backend never assigns `failed` either: a declined IPN hits
`UnobservedIpnOutcomeError` and returns `None` with a log line
(`reconciliation.py:167-178`), leaving the order `pending` for 24h. Despite its own header
comment, `PaymentCompleteSection.tsx:24-36` does **one** fetch and no polling, so a parent
landing inside the ~5-minute IPN window sees "verifying" until they manually reload.

### 7.5 Abandonment strands the money

The order keeps holding its charges (`orders.py:54`), released only by the 24h sweeper
(`:326-346`). Back on `#/payments` the rows read `covered-elsewhere`
(`PaymentsScreen.tsx:297-301`) with no resume, no cancel and no expiry shown — and the
parent cannot look one up, because `GET /payment-orders` is manager-only
(`app/routers/payments.py:362-364`).

### 7.6 Three more dead ends

- `PaymentsScreen.pay()` (`:217-233`) creates the order then fetches the form; if that
  second call fails the order still exists, a retry 409s (`orders.py:238-239`), and the
  parent can neither pay nor cancel for 24h.
- `PaymentSetupGate` sits **in front of** `PaymentCompleteSection` (`App.tsx:700` vs
  `:735`), so a parent returning from uPay is asked how they intend to pay — decided by a
  race between two independent fetches.
- `PaymentSetup.tsx:135` catches an `openCharges` failure as "nothing owed" →
  `onNothingToPay()` → `finishWizard` (`JoinFlow.tsx:283`). **A transient 500 bounces a
  family with an unpaid first month out of onboarding.**

### 7.7 Receipts

`app/integrations/upay/form.py:123` — uPay produces a **קבלה, not a חשבונית מס**, and the
app links to uPay's receipt view rather than generating one. For cash, cheque and הוראת קבע
there is only a free-text `external_receipt_number` a manager types by hand
(`app/models/billing.py:367-370`). **For every non-card payment this system produces no
document at all.**

### 7.8 The billing run gives no feedback

`…20.39.11.png` — pressing `הרצה עכשיו` yields a near-empty card with one sentence and a
button. No count, no confirmation, no summary.

### 7.9 Four screens render bare `null`

`PaymentSetup.tsx:176` (which blanks the entire app, since the gate wraps everything),
`PaymentsSection.tsx:287`, `App.tsx:676`, `ConsentGate.tsx:119`.

---

## 8. Design — dashboard

15 captures, 2026-09-02, **production**. The dashboard has never had a design pass; W9D was
parent-only. The root cause is not 27 screens each needing taste — it is a handful of
missing primitives repeated 27 times.

### Rendering failures

- **Buttons physically overlap.** `…20.36.33.png` — the black `סימון עכשיו` sits *on top
  of* the white `תזכורת למאמן` in all seven rows, each pair starting at a different x, a
  ragged staircase.
- **Text fuses into gibberish.** Same capture: `קבוצה 14 בספטמבר 2026` — the group name
  "קבוצה 1" glues to "4 בספטמבר", reading as *group 14*. Below:
  `נבחרת בנותאין סימונים בטווח הזהסומנו 0/1 שיעורים`. Cause: bare sibling `<span>`/`<bdi>`
  in an unstyled `<ul>` (`AttendanceReport.tsx:214-216`, `:255-270`).
- **A button covers a form label.** `…20.37.13.png` — `הוספת חניך` overlaps and hides the
  `חיפוש חניך` label.
- **A chip overflows its own border.** `…20.37.26.png` — `לו״ז שבועי` renders `לו״ז` inside
  the box and `שבועי` spilling below it. Same rows fuse the group name to the discipline.

### The search box he named

`…20.37.13.png` — the search input is ~68px tall; the status select beside it is ~39px, a
1.7× mismatch, 30px apart, on no shared baseline. **`StudentsScreen.tsx:239-241` carries a
comment claiming this exact defect was fixed. It was not.**

### Layout

- **Every screen hugs the right edge and abandons the left half.** On a laptop, 50–60% of
  the viewport is empty ground with content crushed into a right-hand column. No max-width
  container, no centring. Visible in `…20.37.13`, `…20.38.33`, `…20.38.50`, `…20.39.46`,
  `…20.39.59`. **This alone is probably why he said "doesn't look professional".**
- **Internal uPay API URLs printed as page content.** `…20.39.26.png` — three full
  `https://app.upay.co.il/API6/s.php?m=…` strings as visible LTR monospace inside a Hebrew
  screen.
- **A fake chart on the home screen.** `…20.35.46.png` — seven identical grey placeholder
  bars each labelled `אין נתונים`, presented as data. The parent app draws a proper dashed
  empty state in the same situation.

### Systemic

- **No shared layout primitive** — bare `<ul>/<li>` with inline children is the single root
  cause of the fused text, the overlapping buttons and the escaping chip. The parent app's
  screens are consistently carded; the dashboard's are not.
- **Three KPI treatments** in one product; **four date formats** (`2026-08-30–2026-09-05`,
  `02/09/2026`, `4 בספטמבר 2026`, `2026-09-01`); **currency as unguarded bidi** (`300₪`, no
  space, on five screens).
- **Flat hierarchy** — headings, labels, values and captions at near-identical weight, so
  no screen has a focal point.
- **Button chaos** — 4–6 sizes per screen, and destructive `סיום העסקה` is the same size
  and shape as the neutral outline above it. Only colour separates firing a coach from
  editing their roles.
- **Empty states are literal zeros** — `–`, `0`, `אין נתון`.

---

## 9. Design — staff app

7 captures, **staging, which is byte-for-byte equivalent to production** (§5). All captures
are desktop-width, which is also how the manager looked at it.

- **Three links render as one broken word, directly under the register.**
  `סיכום מפגשמסירת פריטהוספת חניך לשיעור`. `RosterScreen.tsx:288-291` emits three bare
  `<a>` in a nav, and **no CSS rule for `roster-actions` exists anywhere in `web/`.** The
  most embarrassing single thing in the set.
- **Nothing caps content width.** The only `max-inline-size` in play is 34rem on the tab
  bar (`primitives.css:950`), so the tab bar is centred at phone width while rows stretch
  to 2900px — the open-card icon sits ~2800px from the student's name.
- **The date picker's buttons lie.** Labelled `שבוע קודם`/`שבוע הבא`
  (`DatePickerScreen.tsx:248-253`) while the handler steps **months**. `שבוע הבא` appears
  again below the grid meaning something else.
- **A raw ISO month label** — `2026-09` (`DatePickerScreen.tsx:251`). The parent calendar
  renders `ספטמבר 2026`.
- **Broken Hebrew plurals** — `1 שיעורים` (`i18n/he/schedule.ts:19` is
  `'{{count}} שיעורים'` with no plural rule), `1 חיובים`, `0 חיובים`.
- **An unstyled native `<select>`** (`TodayScreen.tsx:231`) — a white macOS control with a
  blue stepper, the only white-on-white element on a black screen.
- **The whole app is built from inline style objects** and has exactly one CSS file. The
  project's own D10 rule forbids this, and it is the root cause of the two findings above.
- **Offline is doubled** — `לא מקוון` in a top strip and again in an in-roster banner,
  whose ⚠ renders at **both** ends. The strip is a 0.25rem caption bar, easy to miss in a
  basement.
- **The drawer is a nav and a settings screen stacked** — eight unstyled text links ~96px
  apart, no icons, no active state, no dividers, then identity, then six toggles each
  redundantly labelled `פעיל`.
- Date-range fields both default to today, with `החל`/`נקה` overlapping the field above.
- The students list repeats `לא משויך לקבוצה` as every row's subtitle under a section
  header that already says it.

### The register itself

**Mechanically sound.** The whole row is a `<button>` (`RosterRow.tsx:106`), the cycle is
unmarked → present → absent → unmarked, pre-reported absences are protected from a stray
tap, bulk mark-present exists with an honest hint, and one-handed marking works. Row height
~48px — adequate, not generous, for a thumb on a mat.

**It does not look finished.** Against `docs/design/captures/parent-outward/4-student-card-light.png`,
where attendance marks are chunky rounded tiles in a deliberate grid, the roster is a
hairline list on flat black with the counts as three stretched boxes.

### Offline is still unproven

No capture shows a pending-sync count, a queued-row badge or a sync-in-progress state — the
queue was empty. **The 90-minute airplane-mode run on a real device has never happened**
(`state.yaml`, status `open`), and the manager may do it unrehearsed tomorrow.

### One permission finding

`…20.48.23.png` shows payment amounts and התשלום התקבל / לא התקבל controls **inside the
staff app**, while the spec cited in `attendance.css:154` says a coach sees no payment
data. Nothing signals it is manager-only, so a coach who opens it and gets an error reads
it as broken.

---

## 10. Design — parent app

6 captures. Three of the eight W9D screens were never finished: **home + shell, the signing
flow, and the calendar** (`state.yaml` W9D S1, S3, S6 — `status: pending`). Half this set
is those.

- **Light-lavender cards on near-black** — light-theme components in dark mode. The warm
  navy/cream identity of the W9D pass is absent on home and calendar.
- **Label and value split across the viewport** — "סה״כ חוב" at the far right, "₪850" at
  the far left ~1,800px away *and one row up*. Same missing width cap as §9.
- **The drawer** — "סגירת התפריט" as a heavy white full-width button at the *top*;
  "הילדים שלי" twice, once as a counter masquerading as a nav item; one item inexplicably
  underlined; no club name or logo; no visible scrim.
- **The calendar breaks at desktop** — "סנכרון ליומן" and its three buttons stranded
  bottom-right, ~1,000px from the grid they belong to.
- The legend declares five attendance states; the grid renders two.
- Month chevrons in LTR order around "ספטמבר 2026" — "previous" is ambiguous in RTL.
- The same control is "הכל" on home and "כל הילדים" on the calendar.
- Amounts in two colours (₪1,150 red, ₪250 amber) with no stated meaning.
- `"2" selected, copy says "כולל 1 חודשים מראש"` — arithmetically defensible
  (`prepayMonths = months − owed`, `PaymentsScreen.tsx:373`), reads as a bug, plural
  disagrees.
- The next-lesson card carries no date, and offered מגיע/ה · לא מגיע/ה at 20:43 for a 16:00
  lesson.
- Vertical white pill artifacts on the right edge of every debt row.

**Genuinely good:** no raw i18n keys, no untranslated strings, RTL direction correct
throughout. The parent app's failures are width and data, not mirroring.

---

## 11. Adding a coach

- **The setup wizard discards the token** — see §2.4.
- **The staff screen shows a naked 43-character string.** `StaffScreen.tsx:205-215` renders
  the token as bare `<code>` text. No copy button, no link, no URL. `expires_at` comes back
  from the API (`app/schemas/staff.py:74`) and is dropped at `:150`, so nobody is told it
  dies in **14 days** (`staff.py:240`; parent invites get 30).
- **The fix already exists on the parent side.** On 2026-08-30/31 the parent path got a
  server-built URL (`f"{origin}/?invite={token}"`, `app/routers/students.py:385`), a
  `CopyButton` (`AddStudentScreen.tsx:180`), and `?invite=` prefill surviving the OAuth
  round-trip (`parent/.../Resolve.tsx:32-36`). `StaffInvitationOut` still has no
  `invitation_url` and the staff app never reads a query param. **Identical defect, fixed
  on one side only.**
- **The coach's first experience is a rejection screen** — sign in, be refused, *then*
  redeem. The parent app got a `joining` state so an invited parent never sees the refusal
  (`parent Resolve.tsx:52-66`); the staff app did not.
- **A wrong or expired code does nothing at all.** `staff/.../Resolve.tsx:97-101` is
  `if (response.ok)` with no else. No error, no spinner, no state change. Introduced by the
  fix (`be13efb`) that closed the "nowhere to enter the code" dead end. The parent version
  has the same gap.
- **Pending rows always show "ללא קבוצה"** — `_pending_invitations` hardcodes
  `"groups": []` (`staff.py:179`). A coach invited onto five groups displays as unassigned,
  and the wizard's pending panel loses its chips on reload.
- **Multi-role invites display and roster as one role** — `sorted(set(roles))[0]`
  (`staff.py:314, 328`), `roles: [intended_role]` (`:178`).
- **Revoking makes an invitation vanish** rather than show as revoked — `expires_at = at`
  falls out of the `expires_at > at` filter (`:147`).
- The email field is `str(min_length=3)` (`schemas/staff.py:52`) — `bob` is accepted.
- `StaffScreen.empty` tells the manager to invite coaches from the setup wizard — the one
  path that throws the token away.

### Security in this flow

- **The token is a pure bearer credential.** `accept_invitation`
  (`app/services/identity/resolution.py:292-308`) matches the invitation to the pre-created
  Person by email; the accepting Google address is **never compared**. A forwarded WhatsApp
  message grants `lead_coach`.
- **`revoke_invitation` can revoke an owner.** `staff.py:392-407` revokes **all** live role
  assignments of an unordered `.first()` match, unfiltered by `STAFF_ROLES`.
- **A guardian invited as a coach becomes a second Person.** `invite_staff` adds
  unconditionally (`staff.py:281`) with no lookup and no unique index on
  `(studio_id, email)`, contradicting §3.3's one-Person-two-roles rule. Acceptance's
  unordered `.first()` may then bind the login to the wrong row — coach signs in with zero
  roles.

**Legible and correct:** `GRANTABLE_ROLES` excludes owner; `group_ids` is properly wired
service and UI; `ROLE_PERMISSIONS` omits `money` for both coach roles with a test asserting
it; the staff app gates lead vs assistant in the UI rather than by 403.

---

## 12. Privacy and legal

### What a guardian can do today

Parent app `#/privacy`, linked from the drawer (`web/apps/parent/src/App.tsx:636`): request
an export, request erasure (behind a confirm), and a photo/video consent toggle.
Authorisation is sound — subject, guardian-of-subject or manager
(`app/services/privacy/requests.py:59-75`).

### What happens

The row is created `pending` and audited. Within the hour, `privacy-requests` calls the
raising seam and writes `status='failed'` with the `NotImplementedError` text
(`app/workers/privacy.py:126-135`, `:180-188`). The guardian is told, verbatim: *"The
erasure did not run and nothing was deleted. The request was recorded and stays open —
contact the club to complete it."* The manager sees the queue sorted failures-first with a
"needs attention" count and the raw English traceback (`PrivacyOperatorScreen.tsx:98-105`).

**This is honest, and unusually well-built for a thing that does nothing.** The cost is
that a live club accumulates a **permanent red queue with no way to clear it**.

### SPEC versus code

§11.3 (SPEC.md:1895) promises a bundle of every related record plus rendered health PDFs on
a time-limited link — none exists, and `expires_at` is hardcoded `None`
(`app/routers/privacy.py:416`). §11.4 (SPEC.md:1902) promises overwriting person
name/birthdate/phone/email/photo plus `anonymized_at`, destroying declarations, signatures
and PDFs, deleting notes, retaining financials — none of it happens.
`person.anonymized_at` (`app/models/person.py:105`) is **never written**.

**Nothing in the product can satisfy a Hebrew-law erasure request today.**

### What would have to move, and what could not

~30 tables carry FKs to `person`/`student` (57 references). The sensitive core: `person`
(`national_id_encrypted:85`, `aliyah_year_encrypted:100`, `photo_object_key:75`),
`guardian`, `student` (`coach_note`, `people.py:296`), `health_declaration`
(`answers_encrypted`, `signature_image_encrypted`, `pdf_object_key` — `health.py:145,153,168`),
`consent_record`, `student_pickup_contact` (`contact_encrypted:196`), `registration_request`
(`payload_encrypted:412`), plus attendance, absence reports, session notes, event
registrations, exam results, belts, enrolments, trial bookings, notifications, calendar
feeds and onboarding links.

Could **not** be purged even if the function were written:

- **`audit_log`** — `REVOKE ALL` / `GRANT SELECT, INSERT`
  (`alembic/versions/0002_audit_log.py:62-63`). The app role physically cannot delete a
  row, and privacy requests write `subject_person_id` into `diff` (`requests.py:122`).
  Needs `studio_migrator` and a documented exception.
- **Encrypted blobs** are purgeable as ciphertext, but rotation is `rewrap()` and never
  decrypts, so there is no per-subject crypto-shredding path.
- **Object storage** — health PDFs live on a Railway volume with no lifecycle sweep;
  `expired` exists in the model and nothing sets it.
- Every FK into `person` is `ondelete="RESTRICT"` (`app/models/reports.py:99`), so
  **anonymise-in-place is the only possible shape.**

### Sizing

Export: ~1 week — a serialiser over ~30 tables, the PDF render that already exists
(`app/services/health/declarations.py:811`), a ZIP, a storage `put`, an authorised download
route, an expiry sweep, and a migration for `include_audit_trail` and `expires_at`
(currently accepted and dropped, `requests.py:93`). Deletion: ~2 weeks and mostly
judgement — dependency ordering, the audit-log exception, a §11.5 retention policy, and the
fact that no test can prove data is gone.

---

## 13. Production configuration

Ranked by how badly each bites a live club.

1. **The eight cron services may never have been attached.** See §0.
2. **No outbound channel to a human at all.** No push transport, no user mailer. Every
   message lands only as an in-app inbox row.
3. **`STORAGE_ROOT` defaults to a relative path and nothing checks the volume.**
   `var/storage` against `WORKDIR /srv` is an in-image directory.
   `FilesystemObjectStore.put` `mkdir`s an unmounted path and returns 200
   (`app/core/storage.py:178`), so uploads succeed and vanish on redeploy. **Permanently
   lost: the studio logo, landing photos, health-template source PDFs.** Self-healing:
   health declaration PDFs, which re-render from the encrypted answers
   (`app/routers/health_declarations.py:341-346`). No boot check, no health probe, no ops
   signal — the only detector is one `logger.warning` on the logo read path
   (`app/services/structure/logo.py:103-106`). Already a three-round production incident
   (runbook:59-93). It also pins the API to one instance forever.
4. **`ops-check` would be a wall of red, emailing nothing.** A job with no successful run
   is overdue from declaration (`checks.py:129-136`) = 8 reds;
   `api.unhandled_exceptions` likely green; `billing.zero_charge_run` green by vacuity;
   `upay.callback_silence` correctly **unknown** (`checks.py:224`).
5. **`POLICY_VERSION` moved 0 → 1 on 2026-09-01** (`app/services/privacy/policy.py:33`,
   commit c211c45). `ConsentService.outstanding` requires a grant at the current version,
   so **every existing family is re-gated and must re-accept terms and privacy on next
   login.** Intended — but unwarned, the manager reads it as a regression.
6. **One config landmine is lazy rather than loud.** `JWT_SIGNING_KEY` unset → 503
   `auth_unconfigured`, refused not defaulted (`app/routers/identity.py:103-113`). Google
   OAuth unset → no provider offered, nobody signs in (`providers.py:311`).
   `UPAY_MERCHANT_EMAIL` unset → clean `MerchantEmailMissingError` (`orders.py:364`). But
   **`ENCRYPTION_KEYS` empty boots fine and then raises on the first health-declaration
   write** (`app/core/encryption.py:93-98`). `OAUTH_REDIRECT_BASE_URL` defaults to
   `localhost:8000` and also builds public calendar-feed URLs (`feeds.py:75`).
7. **`/dev/*` in production is genuinely gone** — never imported (`app/main.py:157-159`),
   so absent from the routing table and OpenAPI; empty/whitespace `DEV_TOOLS_TOKEN`
   normalises to `None` and never reaches `compare_digest` (`dev_account.py:79-84`). The
   one residual risk is `settings.ENV` — see §0.
8. **`with_all_tenants` — no leak today, weak by construction.** All 16 sites are
   identity/token/slug-keyed logins, platform-console work behind `require_platform_admin`,
   aggregates, the unmounted dev switcher, or the bootstrap CLI. But the hatch authorises
   nothing — it validates only that `reason` is non-empty (`tenancy.py:86`) — and it
   silently disables the cross-tenant **write** guard too (`:172`). Highest blast radius:
   `DemoStudioService.wipe` deletes every tenant table for a caller-supplied `studio_id`
   behind one `is_demo is not True` check (`app/services/demo/service.py:96-109`).
9. **Migrations do not run on deploy** — Dockerfile CMD is uvicorn only; `alembic upgrade
   head` is manual over `railway ssh` (runbook:461-472). Single linear head at `0020`.
10. **Cron runs in UTC** while every `why:` in `infra/railway/jobs.json` reasons in
    Asia/Jerusalem. Everything fires three hours late — health chases at 12:30, follow-ups
    at noon. The careful 08:30 argument about not dunning a family at 03:15 still holds:
    the shift makes messages late, not rude.
11. **Quiet hours protect 4 paths of 17.** `ReminderService._send` refuses 21:00–08:00 and
    dedupes per (kind, subject) within 24h (`reminders.py:109-113`). Everything else goes
    straight to `enqueue`: the debt ladder, health chases, trial follow-ups, injuries,
    announcements. **Scheduled announcements have no quiet-hours gate at all**
    (`notify.py:104-106`) — a manager can schedule one for 03:00.

**Correct and worth recording:** the production DB role is `studio_app` and the app
**refuses to boot production otherwise** (`app/main.py:51`, `db_roles.py:125`), so the
append-only audit grant is genuinely in force. Staging still runs as superuser
(`HB-staging-superuser`, `open`).

---

## 14. PWA feel

- **iOS auto-zoom, root cause proven.** `.studio-field__input { font-size: var(--text-body) }`
  (`primitives.css:170`) and `--text-body: 0.875rem` = **14px**. iOS Safari auto-zooms any
  input under 16px on focus, so **every text field in all three apps does it.** The fix is
  the control font size, not `user-scalable=no` — but `--text-body` is the body token, so
  raising it reflows the whole design system. The scoped move is a separate control size.
  Note the collision: disabling pinch-zoom fails WCAG 1.4.4, and W6's exit gate was an
  accessibility sweep.
- **Safe-area insets are handled properly** — `AppShell.tsx:70`, `TabBar.tsx`,
  `primitives.css:941, 1003, 1233`.
- **`overscroll-behavior` is set in only two isolated places** (the belts wizard, the
  landing page), so the whole-page rubber-band remains.
- Not yet examined: tap highlight, selection callouts, iOS splash screens, orientation,
  cold-start appearance, update-toast behaviour.

---

## 15. Landing page and the domain

`docs/design/landing-page-gap.md` is blunt: **"the contract was built, the look was not."**
Seven regions in the design; today there is no hero band, no phone, no belt strip, no
"how a trial lesson looks" section (seven strings, none with a key), no location card, no
map, no ניווט or וואטסאפ buttons, no footer band. **`photo_urls` is returned by the API on
every request and rendered nowhere.** Group rows show days but no time of day — the field
does not exist. The reservation form is hidden behind a button when the design makes it the
page's centre of gravity.

Two blockers inside it: the hero headline needs 36px/52px and `--text-display` tops out at
24px, and `tokens.audit.test.ts` fails the build on any token without a role. And an
**unsettled conflict** — the `13a` spec says build a one-step slot picker, the code builds a
two-step one, and the doc says settle it before touching that region.

`landing.scheduleComeLater` — *"לוח השיעורים עדיין נבנה"* — is a live string on the public
page (`i18n/he/people.ts:316`).

**The domain.** Production moved to the custom subdomains on 2026-08-30, so the
refresh-cookie problem that made the domain load-bearing is solved. `infra/railway/README.md:88`
records that avoiding the apex was deliberate and *"leaves the bare domain free for a
marketing page"* — so moving the landing page to `www` is consistent with the existing
design rather than fighting it. One technical catch: an apex needs ALIAS/ANAME support,
which not every registrar has. Confirm LiveDNS before planning.

**The buried question nobody has answered:** is `gladiatorclub.co.il` the *club's* site or
the *product's*? `/t/{slug}` is a per-tenant shape sitting on a single-tenant name. And a
React SPA at the apex gets no WhatsApp link preview — while the same README calls WhatsApp
the entire distribution channel.

---

## 16. Corrections and confirmations

Recorded so a later session does not chase them.

| Claimed during gathering | Actually true |
|---|---|
| "No i18n parity test" | **Wrong.** `web/scripts/i18n-parity.mjs` plus a vitest. `en` is **strict**, `ru` is **report-only** by design until the translation source lands; missing keys fall back to Hebrew per SPEC §9. The only i18n risk is unreviewed Russian. |
| "SMTP unset blocks invites" | **Wrong.** There is no user mailer at all; SMTP is ops-alerting only. Invites are shared by hand by design. |
| "The wizard rail is off by one" | **Wrong.** Consent renders at position 1 in the same chrome; 1-2-3-4-5 is consistent. The real issues are two dead constants and the rail's absence on two screens (§6.7). |
| "Push is recorded as sent, so the report shows false green" | **Incomplete.** In production no token is created at all, so the display is `no_token` → "app not installed" (§2.1). |
| "Prices differ between apps" | **Not a defect.** Dashboard captures are production, parent and staff are staging. All three wrong-money findings (§3.1, §3.3, §3.4) are internal to a single screenshot and stand. |
| Coach "told to enter a code with nowhere to enter it" | **Fixed** 2026-08-31 (`be13efb`) — but the fix introduced the silent-failure bug (§11). |
| Raw key `common.setup.staff.role.owner` on screen | **Fixed** (`1655304`). |

---

## 17. Not investigated

Named so their absence is deliberate rather than forgotten.

- **A real end-to-end walk of all three apps as each persona**, logging every 500, white
  screen and dead end. Everything above is code reading plus static captures.
- **The offline register on a real device** — the 90-minute airplane-mode run
  (`state.yaml`, `open`).
- **Whether the club's real data is correct** — groups, classes, weekly schedule, prices,
  students, guardians, and whether the health questions are *his* questions.
- The remaining PWA-feel items (§14).
- The uPay E2E gates — `e2e/03-upay-happy-path.spec.ts` and `04-forged-ipn.spec.ts` exist;
  W4 is still `active` in `state.yaml`, so its exit gate may never have closed.
- **W7 "Launch" is `pending` with zero pieces.** There is no cutover plan.
- Open `state.yaml` risks not covered here: real devices to test the install on, 3–5 real
  parents for the install walkthrough, the Russian native-speaker review, the current price
  list per group.
