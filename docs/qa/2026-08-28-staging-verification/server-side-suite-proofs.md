# Server-side suite + API proofs (no login required)

Captured 2026-08-28 while the browser session was logged out. These cover the
checklist items the prompt explicitly allows to be proven by a targeted test run on
current `main` plus API/CORS transcripts, rather than by a screenshot.

## API / infra (curl against api.staging.gladiatorclub.co.il)

- **CORS preflight** — `OPTIONS /api/v1/public/studios/gladiator` with
  `Origin: https://staff.staging.gladiatorclub.co.il` → **200**, and the response echoes:
  - `access-control-allow-origin: https://staff.staging.gladiatorclub.co.il`
  - `access-control-allow-credentials: true`
  - `access-control-allow-methods: GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS`
  - `access-control-allow-headers: … Authorization, Idempotency-Key, X-Dev-Now, X-Dev-Token`
- **openapi.json** → 200.
- **Public landing payload** (`/api/v1/public/studios/gladiator`) → 200 with club name,
  phone, address, headline, about, trial_steps, 13-belt ladder (see a2 transcript).
- **No such club** (`/api/v1/public/studios/nosuchclub`) → 404 (see l6 transcript).

## Suite proofs on current main (2026-08-28)

All runs below exited 0 (no failures, no errors).

| Checklist coverage | Test target | Result |
|---|---|---|
| §19.6 five restrictions + demo hygiene (E-adjacent invariants) | `tests/restrictions/` (6 files: no-action-in-real-studio, no-dev-routes-in-prod, no-real-health-declaration, flag-not-grantable, no-live-money, demo-data-hygiene) | pass |
| **e4 / l10** — .ics renders session time in Asia/Jerusalem; per-child VEVENT | `tests/comms/test_the_ics_feed.py`, `tests/events/test_the_event_calendar_file.py` | pass |
| **s8** — no medical content is coach-visible; health contents never logged | `tests/health/test_privacy.py`, `tests/health/test_no_logging.py` | pass |
| **s4 ↔ p3** — bulk-present never overwrites a parent's advance notice / pre-report | `tests/attendance/test_bulk_present.py` incl. `test_bulk_does_not_overwrite_a_parents_advance_notice`, `test_a_caller_cannot_ask_the_server_to_overwrite_a_pre_report`, `…pre_report_whose_attendance_row_has_not_landed_yet_is_still_protected` | pass |
| **p3** — absence report is recorded | `tests/attendance/test_absence_reports.py` | pass |
| **s6** — injury report notifies the guardian | `tests/attendance/test_injury_reports.py` | pass |

Combined: 131 tests (restrictions + ics + health-privacy) + 23 attendance tests, all green.

These are labelled SUITE proofs in the verdict table. The **UI** halves of s4, s6, s8,
e4 (a coach's eyes on the register / injury flow / health banner / a 17:00 card and the
downloaded .ics) remain ⏸ BLOCKED-on-login until the owner signs in to the staff app.
