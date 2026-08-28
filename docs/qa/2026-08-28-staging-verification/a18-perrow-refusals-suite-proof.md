# a18 — bulk actions: per-row named refusals (suite proof)

UI walk: bulk bar with העברת קבוצה + סימון כעוזבים; same-group move honestly reports "0 עודכנו"
(code path: services/people/bulk.py silently skips same-group; named refusals fire for
no_enrollment / multiple_enrollments / destination_retired / already_in_destination).

Test runs on current main (2026-08-28):
```
$ npx vitest run apps/dashboard/src/features/people/DashboardPeople.test.tsx  # asserts bulk-refused-st1 renders "יותר משיבוץ אחד — טפלו בנפרד"
Test Files  1 passed (1) · Tests  43 passed (43)

$ .venv/bin/pytest tests/people/test_student_lifecycle.py -q  # F12 bulk move end+start, manager-only
20 passed
```
