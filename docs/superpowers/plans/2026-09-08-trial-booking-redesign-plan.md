# Implementation plan — trial booking redesign (Door A)

Spec: `docs/superpowers/specs/2026-09-08-trial-booking-redesign.md`. Read it first; this
file is the division of labour and the shared contracts, not a restatement of the design.

**Vertical:** `people`. Gate: `./scripts/lane-check.sh people` — its `feature_dirs`
already lists `landing`, so no change to that script is needed.

**Plan piece:** W8C / `L9`. It did not exist before this work; it is added with the change.

**No contract change.** No migration, no new i18n namespace (`people` already exists), no
schema another vertical reads. `POST /trial-bookings/self` is used exactly as it is today.

---

## Shared contracts — every task obeys these

### i18n key prefix: `people.bookTrial.*`

`people.trial.*` is **taken** by the dashboard and staff screens (14 keys, `trial.one`,
`trial.outcome.*`, …). Do not add to it. All new strings go under `bookTrial.*`.

These keys are authoritative. Task 1 creates exactly them; tasks 3 and 4 use exactly them.

```text
bookTrial.pageTitle            שיעור ניסיון חינם
bookTrial.badge                השיעור הראשון על חשבוננו
bookTrial.heading              ניפגש על המזרן
bookTrial.lede                 ממלאים את הפרטים, בוחרים קבוצה ומועד — ונתראה באימון. שתי דקות, בלי חשבון ובלי סיסמה.

bookTrial.traineeSection       מי מגיע/ה לאימון
bookTrial.traineeN             מתאמן/ת {n}
bookTrial.firstName            שם פרטי
bookTrial.lastName             שם משפחה
bookTrial.birthdate            תאריך לידה
bookTrial.group                קבוצה
bookTrial.slot                 מועד שיעור הניסיון
bookTrial.addTrainee           הוספת ילד/ה נוסף/ת
bookTrial.removeTrainee        הסרה

bookTrial.minorBand            {name} בן/בת {age} — נבקש גם את הפרטים שלכם, ההורים
bookTrial.parentSection        פרטי ההורה / אפוטרופוס
bookTrial.parentName           שם ההורה
bookTrial.parentPhone          טלפון
bookTrial.parentEmail          אימייל
bookTrial.emailHint            האישור נשלח למייל, והוא גם מה שמזהה אתכם אם תיכנסו לאזור האישי בהמשך.
bookTrial.parentCarried        מולא מ{name} — אם זה הורה אחר, שנו כאן
bookTrial.ownPhone             טלפון
bookTrial.ownEmail             אימייל

bookTrial.health.title         הצהרת בריאות
bookTrial.health.lede          נדרשת לפי חוק הספורט. אם הכל תקין — לחיצה אחת.
bookTrial.health.allGood       הכל תקין
bookTrial.health.report        יש מה לדווח
bookTrial.health.confirmed     אין מגבלה רפואית הידועה לנו המונעת מ{name} להתאמן
bookTrial.health.declaredBy    {name} · {date} · אישור דיגיטלי
bookTrial.health.emergency     טלפון לשעת חירום

bookTrial.consent              קראתי ואני מאשר/ת את תקנון המועדון, מדיניות הפרטיות ותנאי התשלום.
bookTrial.readDocuments        קריאת המסמכים
bookTrial.submit               קביעת שיעור הניסיון
bookTrial.submitNote           ללא עלות וללא התחייבות · אישור נשלח למייל מיד
bookTrial.submitting           שולח…

bookTrial.aside.nextTitle      מה קורה אחרי שנרשמים
bookTrial.aside.next1Title     אישור למייל, מיד
bookTrial.aside.next1Body      עם התאריך, השעה והכתובת.
bookTrial.aside.next2Title     מגיעים לאימון
bookTrial.aside.next2Body      בגדים נוחים ובקבוק מים. חליפת ג'ודו לא צריך.
bookTrial.aside.next3Title     מחליטים אחר כך
bookTrial.aside.next3Body      שיעור הניסיון אינו מחייב דבר.
bookTrial.aside.whereTitle     איפה אנחנו
bookTrial.aside.askTitle       שאלה לפני שנרשמים?
bookTrial.aside.askBody        כתבו לנו, עונים תוך כמה שעות.
bookTrial.aside.whatsapp       שיחה בוואטסאפ

bookTrial.legal.title          מסמכים ותקנון
bookTrial.legal.back           חזרה לטופס ההרשמה
bookTrial.legal.contents       תוכן העניינים

bookTrial.error.firstName      נא למלא שם פרטי
bookTrial.error.lastName       נא למלא שם משפחה
bookTrial.error.birthdate      נא למלא תאריך לידה
bookTrial.error.group          נא לבחור קבוצה
bookTrial.error.slot           נא לבחור מועד
bookTrial.error.parentName     נא למלא את שם ההורה
bookTrial.error.phone          נא למלא מספר טלפון
bookTrial.error.email          כתובת אימייל לא תקינה
bookTrial.error.consent        יש לאשר את התקנון כדי להמשיך
bookTrial.error.health         נא לענות על הצהרת הבריאות
```

**Reused, not duplicated** — do not add new keys for these:
`people.landing.tooYoung`, `people.landing.slotUnavailable`, `people.landing.error`,
`people.landing.alreadyUsed`, `people.landing.rateLimited`,
`people.error.scheduleUnavailable`, `common.loadFailed.retry`,
`people.joinWizard.legal.*` (via `legalDocs()`), `people.joinWizard.step1.faq*`
(via `faqItems()`).

`{n}` `{name}` `{age}` `{date}` are replaced at the call site with `.replace()`, the way
`health.onboarding.stepOf` already is. Never interpolate inside the locale file.

### The legal text has exactly one source

`legalDocs()` from `features/onboarding/wizard/copy.ts` (`people.joinWizard.legal.*`).
**Do not** use `PolicyDocument`, `reports.privacy.*`, `PAYMENT_CLAUSE_KEYS` or
`health.clubTerms.*` anywhere in this feature. Owner's instruction, 2026-09-08.

### Styling

Tailwind under `tw-scope`, matching the join wizard — palette `#001849` `#0056c5`
`#faf8ff` `#e9edff` `#161b28` `#444650` `#dee2f4` `#c5c6d2`. Do **not** mix in
`@studio/ui` primitives (`Card`, `Button`, `Alert`, `LoadFailed`); `features/shell/loadFailed.ts`
records why. `SignaturePad` is not imported by anything in this feature.

RTL logical properties only. Every input a real `<label>`; errors via `aria-describedby`;
group and slot pickers are radio groups with a legend; the two health presets are buttons
with `aria-pressed`; visible focus; 4.5:1 contrast.

### The route contract

`matchLandingPath` gains an optional view segment and returns `{ slug, view }` where
`view` is `'landing' | 'trial' | 'legal'`. `landingSlugFor` returns
`{ slug, view } | null` on the same shape. Task 2 owns those two functions and their
tests **only**; `App.tsx` is wired in phase 3 by the coordinator, so no two tasks touch
it.

---

## Tasks

### Task 1 — strings *(runs alone, first; everything else depends on it)*

Add the `bookTrial.*` keys above to `web/packages/i18n/he/people.ts` (reference locale),
then mirror every key into `en/people.ts` and `ru/people.ts`. Hebrew values are given
above verbatim; write natural English and Russian, not transliteration.

Gate: `node web/scripts/i18n-parity.mjs people` passes.

### Task 2 — routes *(parallel)*

`features/landing/route.ts` + `route.test.ts`.

- `matchLandingPath('/t/gladiator')` → `{ slug: 'gladiator', view: 'landing' }`
- `.../trial` → `view: 'trial'`; `.../legal` → `view: 'legal'`; trailing slash tolerated
- an unknown segment (`/t/gladiator/nope`) → `null`, not a landing page
- `landingSlugFor` on a configured landing host: `/` → landing, `/trial` → trial,
  `/legal` → legal; on any other host those three paths → `null`
- the slug character class stays `[a-z0-9-]{1,80}` — it is interpolated into an API path

Tests first. Do not touch `App.tsx`.

### Task 3 — the booking page *(parallel, the large one)*

New files in `web/apps/parent/src/features/landing/`:
`TrialBookingPage.tsx`, `TrialTraineeCard.tsx`, `TrialHealthBlock.tsx`, `TrialAside.tsx`,
and `TrialBookingPage.test.tsx`.

Props for `TrialBookingPage` mirror what `BookingFlow` takes today — read that file
first: `slug, locale, client, groups, signedIn, today, address, phone, initialGroupId`,
plus `onBooked` is **not** needed (it renders `BookingConfirmed` itself, as `BookingFlow`
does). Reuse `groupFitsAge`, `emptySubjectRow`/`toTrialChildPayloads` from
`../onboarding/familyDraft`, `bookingErrorFor`, and `BookingConfirmed` unchanged.

Behaviour is in spec §2. The parts that are easy to get wrong:

- Birthdate drives `isMinor()` (from `../onboarding/wizard/types`); an unknown birthdate
  counts as a minor.
- The parent block belongs to the **first trainee**; a second trainee shows
  `bookTrial.parentCarried` and edits the same shared parent state. One contact per
  booking — see spec §3.
- A `signedIn` caller is asked nothing about themselves and no `guardian` key is sent.
- Health: `הכל תקין` fills every answer from the template; `יש מה לדווח` reveals the
  questions. Read the template through `makePublicHealthClient(apiFetch, slug)`. Each
  trainee gets its own declaration. `signature_image_base64` is always `''`.
- Submit sends one `client.book({...})` — shape in spec §3, including the new
  `declared_by` / `declared_at` keys. Errors render on the page with a retry.

**The required test is the seam** (CLAUDE.md): fill the form, submit, assert the
**request body** — guardian, one child with the right `group_id`/`session_id`, one
declaration carrying the real answers and an empty `signature_image_base64`,
`agreements_accepted: true`. Plus: minor renders the parent block and 18+ does not; a
second trainee inherits the parent and can override; unfit groups render disabled and
cannot be chosen; `יש מה לדווח` reveals the questions; a signed-in caller sends no
`guardian`.

Do not touch `App.tsx`, `PublicLanding.tsx`, `route.ts`, or delete anything.

### Task 4 — the legal page *(parallel)*

`features/landing/LegalPage.tsx` + `LegalPage.test.tsx`.

Four sections from `legalDocs()` (terms · privacy · payments) plus `faqItems()`. A sticky
contents rail beside the text at ≥`md`, collapsible cards below it. A back link to the
booking form. Tests assert all four titles render, that the payments document shows its 3
paragraphs, and that no `reports.privacy.*` string appears anywhere.

Do not touch `App.tsx` or `route.ts`.

---

## Phase 3 — coordinator, after the tasks land

1. Wire `App.tsx`: `landingSlugFor`'s `view` selects `PublicLanding` / `TrialBookingPage`
   / `LegalPage` inside `LandingShell`.
2. `PublicLanding.tsx`: every `openFlow` call navigates to the trial view instead of
   opening a dialog; add a `/legal` link to the footer.
3. Delete `BookingFlow.tsx`, `BookingFlow.test.tsx`, `BookingDialog.tsx`,
   `JoinWelcomeStep.tsx`, `JoinWelcomeStep.test.tsx`, `JoinHealthStep.tsx`,
   `JoinHealthStep.test.tsx`; update `features/landing/index.ts`. Grep before each
   removal.
4. ~~Check the dashboard's registration-request detail view.~~ **Done 2026-09-08:**
   `RegistrationService.detail` reads only `children`, `guardian` and
   `preferred_group_id`; no declaration is projected anywhere, so the two new keys reach
   no screen. Nothing to change.
5. `./scripts/lane-check.sh people`, plus `npm run typecheck` from `web/`.
6. Add piece `L9` to W8C in `docs/plan/state.yaml`, status `shipped`, in the same commit.
7. Commit by explicit path — never `git add -A`; other sessions share this checkout.
