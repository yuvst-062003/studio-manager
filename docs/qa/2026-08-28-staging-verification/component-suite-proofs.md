# Component / suite proofs for the login-gated items

Run on current `main`, 2026-08-28, while logged out. These prove the **behaviour** of
items whose live screenshot still needs a Google sign-in. Each is labelled `⏸/✅ suite`
in the verdict table: the logic is proven; the on-screen capture is the only part pending.

All runs exited 0.

| item | what the suite proves | test target | count |
|------|----------------------|-------------|-------|
| **s2** | Today as cards (time, duration, group, hall, headcount), day-strip, header summary, back-to-today | `apps/staff/.../schedule/TodayScreen.test.tsx` (+ ScheduleSection, mounted, sessionRoutes) | 56 in group |
| **s3** | Date picker: month grid, legend, lesson-day / past-unmarked rings, quick jumps | `apps/staff/.../schedule/DatePickerScreen.test.tsx` | (in 56) |
| **s4** | Register marks cycle + counters; bulk-present never overwrites a pre-report | `apps/staff/.../attendance/RosterScreen, RosterRow, slots, screens` (68) + backend `test_bulk_present.py` | 68 |
| **s5** | After marking, the Today card reports נוכחות נרשמה; session routes resolve | attendance `screens.test.tsx`, `sessionRoutes.test.tsx` | (in 56/68) |
| **s6** | Injury report notifies the guardian; post-lesson screens render | backend `test_injury_reports.py` + attendance screens | ✓ |
| **s7** | Student search: class tabs, belt/tenure/% meta, parent-name search, row opens card | `apps/staff/.../people/StaffPeople.test.tsx` | 54 in group |
| **s8** | Health banner counts; **no medical content** coach-visible; never logged | `apps/staff/.../health/HealthBadge, rosterBadge` + backend `test_privacy.py`, `test_no_logging.py` | ✓ |
| **s9** | Events cards (date · venue · consents), future → participants, past exam → results | `apps/staff/.../events/StaffEvents.test.tsx` | 20 |
| **s11** | Invited coach: **no ₪ anywhere**, cash/join-link/setup refused, locked actions | `apps/staff/src/permissionBoundaries.test.tsx`, `StaffBilling.test.tsx` | 21 |
| **s12** | Airplane mode shows לא מקוון; roster opens from cache | `apps/staff/src/offlineVisible.test.tsx` | 2 |
| **s13** | Marks taken offline queue with a count and flush to zero on reconnect | `packages/core/src/offline/pendingOps, sync, network` | 59 |
| **s14** | A failed load offers retry; offline says "offline", not "failed" | `apps/staff/src/offlineVisible.test.tsx` | (in 2) |
| **l8** | Out-of-age group **greyed with reason, not hidden** (`groupFitsAge`: in/below/above/birthday-not-yet/no-birthdate) | `apps/parent/.../landing/BookingFlow.test.tsx` | 67 in group |
| **l9** | Declaration required **per child**; cancelled slot **greyed not hidden**; each sibling gets their own slot | `BookingFlow.test.tsx` ("step 3 requires the trial declaration per child", "step 4 greys out a cancelled slot", "sends each sibling their OWN group and their OWN slot") | (in 67) |
| **l10** | Every child + one declaration each submitted in order; confirmation screen renders | `BookingFlow.test.tsx`, `BookingConfirmed.test.tsx` + backend `.ics` VEVENT-per-child | (in 67) |
| **p6** | Event invite → RSVP → consent sign | `apps/parent/.../events/ParentEvents.test.tsx` + backend RSVP | 13 |
| **e3** | **Dark mode** readable — the published dark-ground contrast audit (e.g. 18.41:1, 7.46:1) | `packages/ui/src/contrast.test.ts` | 40 in group |
| **e4** | 17:00 renders 17:00 in the .ics (Asia/Jerusalem) | `tests/comms/test_the_ics_feed.py`, `tests/events/test_the_event_calendar_file.py` | ✓ |

## Still genuinely blocked — need eyes on the authenticated screen

- **s1** — the staff-app setup-wizard nudge's exact banner (a nudge mechanism *is* proven by the staff App test, and the identical banner is proven live on the dashboard at a1, but the staff-app setup variant itself wasn't screenshotted).
- **s10** — the drawer's contents (name · role · הכיתות שלי · notification prefs · calendar feed) have no component test; needs the live drawer.

Everything else marked `suite` above needs only the screenshot once you sign in.
