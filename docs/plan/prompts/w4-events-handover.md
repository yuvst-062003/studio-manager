# Lane EVENTS (M7) — handover

Written at the end of the lane's work, for whoever merges it. Nothing below is speculative:
every claim is either a test in this branch or a file you can open.

---

## State

| | |
|---|---|
| Branch | `lane/events`, rebased onto `main` |
| Lane checks | `events` ✅ 7 scoped gates · `belts` ✅ 6 scoped gates |
| Backend suite | exit 0, with one pre-existing worktree failure deselected — see §5 |
| `mypy app` | clean, 146 files |
| `npm run typecheck` / `lint` | clean |
| Web suite | 1546 passed, 15 failed — all three `sw-precache.test.ts` files, which read `dist/` and say "run `npm run build` first" in their own error. Pre-existing; verified by stashing this lane's work and watching them fail identically. |

**Merge order is unchanged: MONEY first.** M7 is a pure caller of M6's seam.

---

## 1. Three fixes this lane made on `main`

Each was a blocker for **both** W4 lanes, each was diagnosed here, and each is on `main`
with its own tests. Lane MONEY needs all three.

### `b5cf3e1` — the clock middleware answers to `dev_tools_allowed`, not to a copy of it

`728b665` taught `dev_tools_allowed` that an empty `DEV_TOOLS_TOKEN` is no token and missed
the second copy of the rule in `DevClockMiddleware`. The copies had drifted **twice**:

- **On the token.** The committed environment template ships the key empty, `SecretStr("")`
  is not `None`, so the middleware demanded a matching `X-Dev-Token` — while every `/dev/*`
  route on the same machine was allowed. Every request carrying `X-Dev-Now` 403'd, which is
  every HTTP test in `tests/health`, `tests/events` and `tests/billing`. Both lane
  worktrees opened that way.
- **On the environment**, which is the security half. The copy in the middleware allowed the
  shift on *any* non-production environment when no token was configured — so on staging an
  unauthenticated caller could move the server's clock, which is the capability
  `DEV_TOOLS_TOKEN` exists to gate.

`configured_dev_token()` is now the one place the empty-is-no-token rule lives, and it reads
`settings` inside its body because `app.core.clock` imports it at module scope and is
deliberately absent from `tests/dev/conftest.py`'s `RELOADABLE` list.

**The middleware order in `app/main.py` is now load-bearing** and its comment says so:
`DevClockMiddleware` reads `request.state.is_developer`, which `AuthContextMiddleware` puts
there.

### `5d159f4` + `b52369f`-adjacent — a worktree resolves its own `@studio` packages

`git worktree add` copies no untracked file, so a lane's `web/node_modules` is a symlink to
main's — right for third-party packages, and wrong for the workspace links npm puts *inside*
it. `@studio/i18n` in a lane resolved to **main's** `web/packages/i18n`. This lane lost a
task to it: thirty-nine key assertions failing against keys provably present in the file.

`web/tools/workspace-aliases.ts` derives the map from each package's own `exports`, longest
find first (`@rollup/plugin-alias` matches a string `find` as a prefix, so `@studio/ui`
before `@studio/ui/dev-bar` rewrites the subpath into `…/src/index.ts/dev-bar`). Applied to
`vitest.config.ts` **and** all three app configs — a test-only alias gives green tests and a
dev server still serving main's components, which is the worse half because it looks fixed.

### `3fcfd77` — `tsc` resolves them too

The third resolver, missed by the second fix. vite serves, vitest tests, `tsc --noEmit`
typechecks, and all three follow `node_modules` unless told otherwise. A worktree with the
vite alias but no tsconfig `paths` gets green tests and a red typecheck reporting that a
property does not exist on a type whose source file the editor is showing with that property
in it. `paths` cannot call a function, so it is the one hand-written copy of the map and a
guard test asserts the two agree key for key.

### `b52369f` — `TextField` grows a `multiline` mode

W4 handover item 1. Four artboards want one and both W4 lanes hit it. A discriminated union
on `multiline`, so `rows`/`maxLength` and `type`/`inputMode` cannot be mixed.

---

## 2. What was cut, and why

Same reasoning D9.2 applies to weight categories: §4.3 carries no column, a lane may not add
one, and a field that existed "for later" gets filled in before later arrives.

| Cut | Artboards asking | Missing thing |
|---|---|---|
| Medals / placings | `12h`, `9i`, `7a` | §5.8 models an RSVP, not a competition result |
| Capacity / max participants | `7d`, `7b` | no column; §5.4 rejects the enrolment framing and an event needs its own |
| Minimum age | `7b` | no column, cross-namespace to M3 |
| Transport (departure/return, its own price) | `7d`, `7a`, `7b`, `9i` | no column, and a second price beside `fee_agorot` is a second answer to what a family owes |
| Makeup sitting | `9d` | no column; a second exam is a second `event` and nothing links them |
| Federation approval | `4d` | in neither §5.9 nor §4.3 |
| A parent's decline reason | `7c` | `event_registration` has no free-text column |
| Belt hand-over queue | `12d`, `12e`, `11a` | three artboards, one flow, no model and no notification kind |
| Invitations as a state distinct from publish | `9i`, `9d`, `7a`, `6b` | no `invited_at`, and `NotificationService` is M8's |

**Every one is asserted as a negative** in the tests, because a cut comes back as a key or a
column long before anyone proposes reinstating the feature.

### Eligibility: rank and tenure only

`events.exam.eligibleHint` — *הזכאות מחושבת לפי הדרגה הנוכחית והוותק בה* — is the shipped
string and §5.9 says the same. Five artboards add a minimum-attendance percentage; `4d` and
`6b` add a block on outstanding debt or a missing health declaration.

All three are cut. `belt_rank` carries no threshold column, `6b`'s own audit says the
decision *"belongs in the W4 contract commit, not in whichever lane builds first"* and W4's
contract commit did not make it — and a debt gate would put M6's balance on a screen §3.2
lets a lead coach open, which is the hard rule rather than a preference.

So `CandidateOut` reports `current_rank`, `next_rank` and `months_at_rank`, and `eligible`
means exactly *there is a rank above the one this student holds*. The manager reads the
tenure and decides, which is what `4d`'s checkbox column and promote button already do.

---

## 3. Gaps found that need someone else's decision

### 3.1 `StudentBeltOut.color_hex` is not a snapshot

`tests/contracts/test_w4_schemas.py::test_a_belt_award_keeps_its_own_colour_so_history_survives_a_recolour`
argues that carrying the colour on the award means a recolour does not rewrite a child's
past. **`student_belt` has no colour column**, so the read joins `belt_rank` and returns
today's value — and it does. The contract test still passes, because it asserts the field
exists rather than that it is a snapshot.

`tests/belts/test_awarding_a_belt.py::test_a_recolour_rewrites_what_a_child_was_given` pins
the current behaviour, so the day it changes that test is what says so. Closing it needs
`student_belt.color_hex`, which is a migration and therefore `main`'s.

### 3.2 The setup wizard asks for belts before classes exist

`WIZARD_STEP_ORDER` is studio · **belts** · groups · prices · staff · students. Classes are
created at step 3, `belt_rank.class_id` is `NOT NULL`, and nothing in step 1 creates a class.
So on every brand-new studio, step 2 cannot seed a ladder at all.

The step reads M1's `/classes`, seeds into the class the manager picks, and when there are
none says so and offers the container's own `onSkip`. **That is the one place it departs from
`5d`**, which draws no defer link — and the audit justified that absence as *"belt setup is
required and pricing is not"*. The requirement stands; it is the **ordering** that makes it
unmeetable at step 2. Someone should decide whether the wizard reorders or step 1 creates a
default class.

### 3.3 `consent_record` cannot name an event

§5.8 wants an event consent recorded as a `consent_record` with `consent_type='event'`, and
`0007` authored that member. The table has `subject_id` and no `event_id`, so it cannot say
*which* event was consented to. `event_registration.consent_signed_at` is therefore the
authoritative per-event fact and the ledger row is written for §11.6's completeness. That
shape is M4's and `0007`'s.

### 3.4 `tests/identity/test_settings.py::test_no_provider_credential_has_a_default`

Fails in both lane worktrees. It builds a fresh `Settings()`, which reads `.env`, and the
committed template ships `GOOGLE_OAUTH_CLIENT_ID=` — an empty string, not `None`. **The same
family as `728b665`, in a third place.** A general "an empty optional setting is unset" rule
would close all three; it is a decision about how every setting parses, so this lane did not
make it. Deselect it or fix it before judging the suite.

---

## 4. `packages/ui` gaps this lane worked around

None of these was added, because a primitive is not a lane's to add.

| Needed | Shipped as |
|---|---|
| RSVP confirmed / consent signed | `StatusChip status="paid"` |
| RSVP declined | `status="cancelled"` |
| RSVP pending / not answered | `status="unmarked"` — the dashed one; there is no dashed **pending** variant, and `7c` uses dashed-vs-solid inside `--pending` as a real distinction |
| Consent missing | `status="debt"` — `ChipStatus` has no `danger` member |
| Event type (a category, not a status) | a plain tag in the feature dir |
| Neutral `Alert` | none — `AlertTone` is danger / pending / paid |
| `Checkbox` indeterminate | not needed in the end; still absent |
| Icon-only `Button` | text buttons |
| Stepper, chip-select, single-date field, `ColourSwatchPicker` | feature-local compositions |
| Exam result mark | `ExamResultMark`, a **sibling** of `AttendanceMark` — 9d finding 3 |
| `BeltTransition` | built **twice**: `features/events/BeltTransition.tsx` in the dashboard and `features/events/BeltPair.tsx` in staff. The three apps are three Vite apps and nothing crosses between them; `4d` finding 8 asks for one component and the only place it could live once is `@studio/ui`. |

---

## 5. Things a reviewer should expect

- **`app/routers/events.py` declares `/me/events`** and **`app/routers/belts.py` declares
  `/students/{id}/belts`** — paths not named for their module, following
  `app/routers/health_declarations.py`'s precedent. Not a lane crossing.
- **`app/routers/belts.py` imports `RsvpService`** from the events package, to answer "is
  this caller a guardian of this student" on the belt-history read. Both verticals are this
  one lane.
- **`app/models/events.py` and `app/models/belts.py` are untouched.** Every column the lane
  needed was in the contract commit.
- **`app/schemas/{events,belts}.py` are untouched.** Shapes the contract did not author
  (`CandidateOut`, `LadderRankOut`, `BeltPresetOut`, `ParentEventOut`, …) are declared in the
  router modules, following `HealthTemplatePublishedOut`'s precedent.
- **The api-client was regenerated** for this lane's routes: 126 shapes → 160, none removed.
  Same `chore(w3)` precedent. **Expect a conflict on `schema.d.ts` and `openapi.json` when
  MONEY merges first — resolve it by re-running `npm --prefix web run generate:api-client`,
  not by hand.**
- **Three `App.tsx` files gained lines**: dashboard (2 NAV entries, 3 route branches, 4
  render arms, 2 clients, 1 `registerSlot` call), staff (1 NAV entry, 2 hash reads, 2 render
  arms, 1 client), parent (2 hash reads, 2 render arms, 2 clients). Each follows the
  per-vertical convention those files' own comments prescribe.
- **`SetupWizard.tsx` and `packages/ui/src/setup-wizard/register.ts` were not opened.** The
  belts step registers itself from `web/apps/dashboard/src/features/belts/BeltsWizardStep.tsx`.

---

## 6. The seam, for the MONEY reviewer

`app/services/events/fees.py` is the only file in this lane that imports anything from
`app.services.billing`. It calls:

```python
BillingService().create_charge(
    studio_id=require_current_studio_id(),
    payer_person_id=<the student's primary guardian>,
    kind="event",
    amount_agorot=event.fee_agorot,      # G2 — an integer count of agorot
    due_date=(event.starts_at - timedelta(days=7)).date(),
    student_id=registration.student_id,  # keyword-only in the contract
    event_id=event.id,                   # keyword-only in the contract
)
```

**Every argument is passed by name, including the five that are not keyword-only**, because
`student_id` and `event_id` are `UUID | None` in adjacent positions and a positional call
would bind an event id to `student_id` invisibly.

It is called from exactly one place — `EventFeeService.charge_if_confirmed` — and only when
§5.8's confirmation completes: `rsvp == 'yes'` **and** (the event asks for no consent **or**
the consent is signed). It is idempotent on `event_registration.charge_id`, so a parent
changing their answer back does not bill the family twice. A `NULL` fee raises nothing; zero
is not the same thing and would create a receipt for nothing.

`tests/events/test_rsvp_consent_and_the_fee_seam.py` asserts the call **shape**, with a
double carrying `create_charge`'s real signature rather than a `MagicMock` — a mock accepts a
positional `event_id` happily, which is the one mistake the seam was shaped to prevent. The
double writes a real `charge` row, because `fk_event_registration_charge_id_charge` rejects a
fabricated id and a double returning one could never prove `charge_id` is persisted at all.
**Delete that double when the real `create_charge` lands** rather than keeping it in step.

`tests/invariants/test_05_the_billing_run_is_idempotent.py` still skips, as designed.

---

## 7. E2E-3 and E2E-4

Still not reachable, for the reason `HB-w3-e2e-harness` gives: no router, one `baseURL` for
three Vite apps, and eleven named testids of which none exists. Nothing in this lane changes
that, and the routes it added are hash routes, which the harness will need to address.
