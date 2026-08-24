# Arbox dashboard & calendar — teardown

**Date:** 2026-08-23
**Why:** The dashboard (§6.4) must be a superset of the staff app and must contain a
calendar. Arbox is the incumbent our first customer will compare us against.

**Method and its limits.** Built from Arbox's own product pages, their academy
documentation, and reviewer quotes on SoftwareAdvice. **No screenshots were seen** —
the App Store page 429'd and the marketing pages carry no annotated UI. Structural
claims (toolbar contents, view modes, Quick View behaviour) come from their academy
docs and are reliable. Colour and density claims are not available; treat them as unknown.

---

## The schedule toolbar (their academy docs, left to right)

1. **Navigation** — day / week / month switcher + jump to today
2. **Branches** — branch name shown beside "Calendar"; click to switch schedules
3. **Public calendar link** — shareable schedule for customer self-registration
4. **Filters** — by staff, event type, category, space; multiple at once; **selections are savable**
5. **Settings** — event management, registration, cancellation policy, bulk event operations
6. **Views** — a choice of **5 calendar views**

## Quick View — the pattern worth stealing

Clicking an event opens a preview showing *"number of registrants and their names,
participants on the waiting list, event specifics, **attendance marking**, and more."*
Messages can be sent to everyone registered *"with a single click, right through the
event interface."*

This is the single best idea in their product for our purposes. It matches Arbox's own
check-in philosophy — a *"single access point"* — and it maps almost exactly onto our
§5.7 attendance flow on desktop: click a session in the week grid, mark the roster,
never leave the calendar.

## Settings taxonomy

Five sections: Registrations · Notifications · Waiting List · Appointment Policy · General.
Roughly two of these are meaningful to us; the rest are booking-product concerns.

## What reviewers say

- **4.7 / 5 ease of use** across 42 reviews — the bar is not low
- *"pleasing to the eye and not complicated to understand, everything is accessible, organized"*
- *"quick to pick up… easy and straight forward for billing purposes"*
- ⚠ *"there are some bugs in the app, **the design gets messy sometimes** and it affects the user experience"*
- ⚠ *"**The toggle feature can be a bit confusing. I was unsure if I was turning an option on or off**"*

---

## Adopt

| Pattern | Where it lands for us |
|---|---|
| **Quick View with inline attendance** | Click a session in the week grid → popover with roster, present/absent marking, no navigation. Serves §5.7 on desktop. |
| Day / week / month + "today" | Standard, correct, expected. |
| **Savable filter sets** | A manager who always views "ג'ודו only, coach X" should not rebuild that filter daily. |
| Message everyone in a session from the session | Maps to §5.11 group-level announcements. |
| Block time directly on the calendar | Maps to §5.6 closures and cancellations. |

## Reject

| Their choice | Our choice | Why |
|---|---|---|
| **5 calendar views** | **3**: day, week, month | Week is the §6.4 default ("schedule grid for a whole week across all groups"). Day is mat-side. Month is for planning closures and the training year. Five is choice paralysis in a product a coach uses between classes. |
| **Ambiguous toggles** | Every toggle carries a visible state label | Their reviewer named this exact failure. Our [ui-rtl-a11y.md](../../../.claude/rules/ui-rtl-a11y.md) rule already requires an accessible name and state on every interactive element — this makes it a visible requirement too, not just a screen-reader one. |
| Design that "gets messy" over time | Token + component layer locked before screens are built | This is what organic dashboard growth looks like from the outside. It is an argument for doing the design system first, not after. |
| Branch switcher always visible | Studio switcher hidden for single-studio users | Already our behaviour per §5.2. |
| Public self-registration calendar | None | Children are enrolled, not booking (§5.4). No public booking surface exists in our product. |

## The structural difference, again

Arbox's calendar block answers **"how many people registered, and is there a waitlist?"**

Ours answers **"is this session covered, who is on the mat, and has attendance been taken?"**
Sessions are generated from a fixed weekly schedule (§5.6, §5.7) — capacity and waitlists
are near-irrelevant. What a manager scans a week grid for is *gaps*: an unassigned coach,
a cancelled session, a roster nobody marked. Our calendar block must surface **coverage and
completion state**, not registration counts.

## Sources

- [Arbox — the new schedule](https://www.arboxapp.com/blog/new-schedule)
- [Arbox Academy — toolbar and schedule settings](https://academy.arboxapp.com/lesson/toolbar-and-schedule-settings)
- [Arbox Academy — appointments and availabilities](https://academy.arboxapp.com/lesson/appointments-and-availabilities)
- [Arbox — scheduling software](https://www.arboxapp.com/features/gym-scheduling-software)
- [SoftwareAdvice — Arbox reviews](https://www.softwareadvice.com/gym-management/arbox-profile/)
