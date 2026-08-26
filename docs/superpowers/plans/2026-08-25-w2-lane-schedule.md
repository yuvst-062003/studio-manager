# W2 · Lane SCHEDULE (M2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the schedule vertical — training years, a closure calendar with Israeli
holiday presets, weekly schedule rules, session materialization for a whole training year,
per-session overrides, ad-hoc sessions, and the impact-preview dialog on
`PUT /groups/{id}/schedule` — such that changing a rule rewrites **only future** sessions and
says so before it does it.

**Architecture:** Three pure modules with no database and no clock (`holidays.py`, `rules.py`,
`impact.py`) carry every decision that can be decided from data alone; one DB-facing
`service.py` applies them inside a `TenantSession`; two thin routers parse and return. The
frontend renders seven artboards against locally-declared response types, because the
generated `api-client` is regenerated on `main` after both W2 lanes merge, not in-lane.

**Tech Stack:** FastAPI · SQLAlchemy 2 · PostgreSQL 16 · Pydantic v2 · Python 3.14 ·
React 19 + TS 5.9 · Vitest · Testing Library

**Spec:** [SPEC.md](../../../SPEC.md) §5.6, §5.15, §7 · [milestone-plan.md](../../plan/milestone-plan.md)
W2 · Lane SCHEDULE · [CLAUDE.md](../../../CLAUDE.md)

---

## Global Constraints

Inherited by every task. Copied verbatim from their sources.

| # | Constraint |
|---|---|
| G1 | Python tooling is `.venv/bin/`-prefixed. A bare `pytest`/`python3` resolves to an old 3.8 interpreter earlier on PATH. |
| G3 | Timestamps are stored UTC `timestamptz` and rendered `Asia/Jerusalem` **regardless of locale**. |
| G4 | No user-facing string is inlined in a component. Everything through `web/packages/i18n/{he,en,ru}/schedule.ts`. |
| G5 | New endpoints are versioned under `/api/v1/` (the prefix is applied by `app/main.py`; routers declare bare paths). |
| G6 | Routers stay thin — parse, call a service, return. All business logic in `app/services/`. |
| G9 | Every tenant-scoped table carries non-null `studio_id`. Queries run through `TenantSession`, which fails closed. |
| G12 | Physical CSS properties are banned by ESLint. Exported canvas CSS is a **visual reference only** — never copy-pasted. |
| G13 | Colours live in named tokens, never hardcoded hex. |
| G16 | Every list endpoint is cursor-paginated (`CursorPage` from `app/schemas/_pagination.py`). Every mutating endpoint accepts an optional `Idempotency-Key`. |
| G18 | A failing test is written before any implementation. Prefer a single test file over the full suite during development. |
| C-clock | `app.core.clock.now()` is the **only** clock. `tests/dev/test_clock.py` AST-scans `app/` and fails the build on any `datetime.now()`, `datetime.utcnow()`, `datetime.today()` or `date.today()` call. Pure functions take `now` as a parameter. |
| C-api | A router serving coaches is tagged `coach` (`APIRouter(tags=["coach"])`) — SPEC §13 invariant 3 is enforced against that tag. Authorization is a router dependency, never inside a service. Errors use `{code, message}`. |

**Lane check (the only gate that counts):** `./scripts/lane-check.sh schedule`

**Ownership.** This lane owns exactly: `app/models/schedule.py`, `app/services/schedule/**`,
`app/routers/schedule.py`, `app/routers/sessions.py`, `app/workers/schedule.py`,
`tests/schedule/**`, `web/apps/{staff,parent,dashboard}/src/features/schedule/**`,
`web/packages/i18n/{he,en,ru}/schedule.ts`.

**Four sanctioned exceptions**, each decided before this plan was written:

1. `tests/contracts/test_seams.py` — Task 5 replaces exactly one test function.
2. `openapi.json` / `web/packages/api-client/**` — **not regenerated in-lane.** The frontend
   declares its own response types per feature folder, the way
   `web/packages/ui/src/setup-wizard/client.ts` already does. Root CI is stale until `main`
   regenerates after both lanes merge.
3. `scripts/lane-check.sh` — **not edited.** Its `*)` branch resolves
   `app/services/schedule`, `app/routers/schedule.py`, `app/models/schedule.py` only, so
   `app/routers/sessions.py` and `app/workers/schedule.py` are typechecked and linted by hand
   in Tasks 7 and 8 and reported.
4. `web/apps/{dashboard,staff,parent}/src/App.tsx` — Task 16 adds one NAV entry and one route
   branch per app. Purely additive; nothing else moves.

**Not modified under any circumstance:** `alembic/versions/**` (a hook blocks it),
`app/models/_pending/**` (never imported either), `app/models/__init__.py`, `app/main.py`,
`app/schemas/**` other than `schedule.py`, `web/packages/{ui,core,api-client}/**`, any i18n
file other than `schedule.ts`, `app/services/people/**`, `web/apps/*/src/features/people/**`.

**Already authored — read, never re-author:** `app/models/schedule.py`,
`app/schemas/schedule.py`, `app/services/schedule/__init__.py`. Revision 0006 created their
tables. Their docstrings carry the reasoning this plan argues from.

---

## Decisions Taken Before Writing Code

Recorded here so no task reopens them.

**D-M2-1 — The Hebrew calendar is arithmetic in this repo, not a dependency.** §5.6 needs
seven Israeli holidays and there is no Hebrew-calendar library in `requirements-dev.txt`.
Adding one is a shared-file change; a static table of dates expires. Task 1 implements
Reingold & Dershowitz's `hebrew-calendar-elapsed-days` / `hebrew-new-year` in about forty
lines of integer arithmetic, verified against nine known real-world dates. Python's
`date.toordinal()` is exactly the R.D. scale the algorithm is written in, so the conversion
is `date.fromordinal(...)` and nothing else. **`HEBREW_EPOCH = -1373427`** — an epoch two off
produces a Rosh Hashanah on a Sunday, which the לא אד״ו ראש rule forbids, and that is the
cheapest way to catch the mistake.

**D-M2-2 — A rule change *cancels*, it does not delete.** `ScheduleImpactPreview` says
`sessions_to_cancel`, `session` carries a `cancel_reason` check constraint, and a class that
vanishes from a parent's calendar without a trace is worse than one marked בוטל. Sessions the
new rules no longer cover are set to `status='cancelled'`, never deleted.

**D-M2-3 — System cancellations write a machine token, not Hebrew.** A manager's
`cancel_reason` is free text they typed. A cancellation the *server* generated writes
`system:schedule_change` or `system:closure`; the client maps a `system:` prefix to an i18n
key and renders anything else verbatim. This keeps §9 honest without putting a second
Hebrew string table in `app/`.

**D-M2-4 — Holiday preset names are keyed.** `HolidayPresetOut` carries both `key` and
`name` because the client renders `t(locale, 'schedule.closure.preset.<key>')` and `name` is
only the fallback and the text written into `studio_closure.reason` when the manager ticks it.

**D-M2-5 — Matching is by Jerusalem date, then by start time within the date.** Desired
occurrences and regeneratable sessions are bucketed by their `Asia/Jerusalem` calendar day,
each bucket sorted by start time, and zipped. Surplus desired → create; surplus existing →
cancel; pairs that differ → update. Deterministic, and correct for the two-sessions-in-one-day
case without inventing a rule-identity join that a rewrite would dangle.

**D-M2-6 — C12 counts students, not enrollments.** `uq_enrollment_live` makes those the same
number inside one group, but the copy says תלמידים and a later schema change must not
silently turn it into a different count. Distinct `student_id`.

**D-M2-7 — `SessionOut.attendance_taken` is always `False` in W2.** The `attendance` table is
W3's and lives in `app/models/_pending/`, which this lane never imports. The field exists in
the authored schema with a `False` default; M5 fills it. **Consequence to report:** E2E-5's
final assertion `expect(held.getByTestId('attendance-taken')).toBeVisible()` cannot pass
until W3. `e2e/` is not this lane's file.

---

## File Structure

**Backend — created**

| File | Responsibility |
|---|---|
| `app/services/schedule/holidays.py` | Hebrew-calendar arithmetic and the seven §5.6 presets. Pure: no DB, no clock. |
| `app/services/schedule/rules.py` | Expand weekly rules into dated occurrences over a range, skipping closures; Jerusalem↔UTC. Pure. |
| `app/services/schedule/impact.py` | The §5.6 diff: create/update/cancel/protected, and C12's count. Pure. |
| `app/services/schedule/service.py` | `ScheduleService` — every database-touching operation, inside a `TenantSession`. |
| `app/routers/schedule.py` | `/training-years`, `/closures`, `/holiday-presets`, `/groups/{id}/schedule`. Manager writes, staff reads. |
| `app/routers/sessions.py` | `/sessions` and `/sessions/{id}/*`. Tagged `coach`. |
| `app/workers/schedule.py` | Marks ended sessions `completed`. The only writer of that status. |

**Backend — modified**

| File | Change |
|---|---|
| `app/services/schedule/__init__.py` | Re-export `ScheduleService` from `service.py`. The seam docstring stays; the class moves so `__init__.py` does not become the service. |
| `app/schemas/schedule.py` | Add `ProtectedSessionOut`, two fields on `ScheduleImpactPreview`, `SessionCreate`, `SessionPatch`, `SessionCancelIn`, `SessionNoteCreate`/`Out`/`Page`, `GenerateSessionsOut`, `ScheduleRulesOut`. Nothing authored is removed or renamed. |
| `tests/contracts/test_seams.py` | Task 5 replaces one test function. |

**Frontend — created** (each folder also gets a `client.ts` declaring its own response types)

| File | Artboard |
|---|---|
| `web/apps/dashboard/src/features/schedule/GroupSchedulePage.tsx` | `6a` עמוד קבוצה + לו״ז שבועי |
| `web/apps/dashboard/src/features/schedule/ImpactDialog.tsx` | §5.6's dialog, **including C12** |
| `web/apps/dashboard/src/features/schedule/WeekBoard.tsx` | `3a` לוח שבועי |
| `web/apps/dashboard/src/features/schedule/GroupsAndCycles.tsx` | `4b` קבוצות ומחזורים |
| `web/apps/dashboard/src/features/schedule/ClosuresPanel.tsx` | closures + holiday presets (reached from `6a`/`4b`) |
| `web/apps/staff/src/features/schedule/TodayScreen.tsx` | `9a` היום **and** `1d` |
| `web/apps/staff/src/features/schedule/DatePickerScreen.tsx` | `9b` בחירת תאריך |
| `web/apps/parent/src/features/schedule/ChildCalendar.tsx` | `12b` לוח הילד |

**Tests — created:** `tests/schedule/{__init__,conftest}.py` plus one file per task, and a
colocated `*.test.tsx` beside every component above.

---

### Task 1: Israeli holiday presets, as arithmetic

§5.6: "The training-year setup pre-fills Israeli holidays … as **proposals the manager
ticks**. Nothing is closed automatically." This task produces the proposals. Nothing here
writes a row.

**Files:**
- Create: `app/services/schedule/holidays.py`
- Create: `tests/schedule/__init__.py` (empty)
- Test: `tests/schedule/test_holidays.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `HEBREW_EPOCH: int`
  - `hebrew_new_year(hebrew_year: int) -> date` — the Gregorian date of 1 Tishrei.
  - `@dataclass(frozen=True) HolidayPreset(key: str, name: str, date_from: date, date_to: date)`
  - `presets_for_year(year: int) -> list[HolidayPreset]` — every preset overlapping Gregorian
    `year`, sorted by `date_from`.
  - `PRESET_KEYS: tuple[str, ...]` — the seven keys, in §5.6's order.

- [ ] **Step 1: Write the failing test**

Create `tests/schedule/__init__.py` empty, then `tests/schedule/test_holidays.py`:

```python
"""§5.6's seven Israeli holidays, as dates a manager can tick.

Every expected date below is a real-world published date, not a value this module
produced. That is the whole point of the file: an arithmetic Hebrew calendar is easy to
write plausibly and wrong, and the two-day epoch error in particular yields a Rosh Hashanah
on a Sunday — which the לא אד״ו ראש rule forbids outright, and which the last test here
catches independently of any single date.
"""

from __future__ import annotations

from datetime import date

import pytest
from app.services.schedule.holidays import (
    PRESET_KEYS,
    HolidayPreset,
    hebrew_new_year,
    presets_for_year,
)

#: 1 Tishrei, published. Five consecutive years, so a formula that happens to be right for
#: one year cannot pass.
KNOWN_ROSH_HASHANAH = {
    5786: date(2025, 9, 23),
    5787: date(2026, 9, 12),
    5788: date(2027, 10, 2),
    5789: date(2028, 9, 21),
    5790: date(2029, 9, 10),
}


@pytest.mark.parametrize(("hebrew_year", "expected"), sorted(KNOWN_ROSH_HASHANAH.items()))
def test_rosh_hashanah_matches_the_published_date(hebrew_year: int, expected: date):
    assert hebrew_new_year(hebrew_year) == expected


def test_one_tishrei_never_falls_on_sunday_wednesday_or_friday():
    """לא אד״ו ראש. Independent of any single published date: a postponement rule dropped
    from the implementation shows up here across a century even if 5787 happens to survive.
    `date.weekday()` is Monday-based, so Sunday is 6, Wednesday 2, Friday 4."""
    forbidden = {6, 2, 4}
    for hebrew_year in range(5750, 5850):
        assert hebrew_new_year(hebrew_year).weekday() not in forbidden, hebrew_year


def test_the_seven_presets_of_5_6_are_offered_and_no_others():
    assert PRESET_KEYS == (
        "rosh_hashanah",
        "yom_kippur",
        "sukkot",
        "pesach",
        "yom_haatzmaut",
        "shavuot",
        "summer_break",
    )


def test_presets_for_2026_carry_the_published_dates():
    """Gregorian 2026 spans the tail of Hebrew 5786 (spring) and the head of 5787 (autumn),
    which is why the endpoint takes a Gregorian year and the function has to look at two
    Hebrew ones."""
    by_key = {p.key: p for p in presets_for_year(2026)}

    assert by_key["pesach"].date_from == date(2026, 4, 2)
    assert by_key["pesach"].date_to == date(2026, 4, 8)       # 15-21 Nisan, Israel keeps 7
    assert by_key["yom_haatzmaut"].date_from == date(2026, 4, 22)
    assert by_key["shavuot"].date_from == date(2026, 5, 22)
    assert by_key["rosh_hashanah"].date_from == date(2026, 9, 12)
    assert by_key["rosh_hashanah"].date_to == date(2026, 9, 13)
    assert by_key["yom_kippur"].date_from == date(2026, 9, 21)
    assert by_key["sukkot"].date_from == date(2026, 9, 26)


def test_yom_haatzmaut_is_moved_when_5_iyar_falls_on_a_monday():
    """The 2004 rule: 5 Iyar on Monday moves the day to Tuesday, so Yom Hazikaron's eve
    does not fall on מוצאי שבת. 5 Iyar 5788 is Monday 1 May 2028."""
    by_key = {p.key: p for p in presets_for_year(2028)}
    assert by_key["yom_haatzmaut"].date_from == date(2028, 5, 2)


def test_summer_break_is_a_gregorian_proposal_not_a_hebrew_date():
    """חופש גדול is the Israeli school summer holiday, not a festival. Proposed as
    1 July – 31 August, which the manager edits or refuses like any other proposal."""
    by_key = {p.key: p for p in presets_for_year(2026)}
    assert by_key["summer_break"] == HolidayPreset(
        key="summer_break",
        name="חופש גדול",
        date_from=date(2026, 7, 1),
        date_to=date(2026, 8, 31),
    )


def test_every_preset_is_returned_in_date_order_and_lands_inside_the_asked_for_year():
    presets = presets_for_year(2027)
    assert presets == sorted(presets, key=lambda p: p.date_from)
    for preset in presets:
        assert preset.date_from.year == 2027 or preset.date_to.year == 2027
        assert preset.date_to >= preset.date_from


def test_a_preset_is_a_proposal_and_carries_no_applied_state():
    """§5.6 — 'proposals the manager ticks, never automatic closures'. A preset that could
    be in a state is a preset something could apply on the manager's behalf."""
    fields = set(HolidayPreset.__dataclass_fields__)
    assert fields == {"key", "name", "date_from", "date_to"}
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
.venv/bin/pytest tests/schedule/test_holidays.py -q
```
Expected: collection error — `ModuleNotFoundError: No module named 'app.services.schedule.holidays'`.

- [ ] **Step 3: Write the implementation**

Create `app/services/schedule/holidays.py`:

```python
"""§5.6's Israeli holiday presets — **proposals the manager ticks, never closures**.

Nothing in this module writes a row or reads one. It answers "which dates might this club
close for", and `StudioClosure` is created only when a human says yes. That separation is
the whole of §5.6's rule: "Nothing is closed automatically — studios differ, and a wrong
guess deletes real lessons."

**Why arithmetic and not a dependency.** Seven holidays need a Hebrew calendar. Adding a
package touches `requirements-dev.txt`, which this lane does not own; a static table of
dates silently expires. The algorithm below is Reingold & Dershowitz's, and it is forty
lines of integers with no state.

Python's `date.toordinal()` **is** the R.D. (Rata Die) scale the algorithm is written in --
`date(1, 1, 1).toordinal() == 1` -- so the conversion out is `date.fromordinal` and nothing
else. `HEBREW_EPOCH` is the R.D. of 1 Tishrei of Hebrew year 1.

**The epoch is the bug worth naming.** `-1373429` appears in circulation and is two days
early; it produces a Rosh Hashanah on a Sunday, which לא אד״ו ראש forbids. That is what
`test_one_tishrei_never_falls_on_sunday_wednesday_or_friday` exists to catch, independently
of whether any single published date happens to line up.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

#: R.D. of 1 Tishrei, Hebrew year 1. See the module docstring on why the value matters.
HEBREW_EPOCH = -1373427

#: §5.6, in the order it lists them. `summer_break` is חופש גדול.
PRESET_KEYS = (
    "rosh_hashanah",
    "yom_kippur",
    "sukkot",
    "pesach",
    "yom_haatzmaut",
    "shavuot",
    "summer_break",
)

#: Hebrew names, used as the fallback label and as the text written into
#: `studio_closure.reason` when a manager ticks the proposal. The client renders
#: `t(locale, 'schedule.closure.preset.<key>')` and only falls back to these (D-M2-4).
PRESET_NAMES = {
    "rosh_hashanah": "ראש השנה",
    "yom_kippur": "יום כיפור",
    "sukkot": "סוכות",
    "pesach": "פסח",
    "yom_haatzmaut": "יום העצמאות",
    "shavuot": "שבועות",
    "summer_break": "חופש גדול",
}

#: The Israeli school summer holiday, as month/day. Not a festival and not derivable from
#: the Hebrew calendar — it is a Ministry of Education date, and a judo club's own summer
#: break usually starts from it. Proposed, then edited or refused like anything else.
SUMMER_BREAK_FROM = (7, 1)
SUMMER_BREAK_TO = (8, 31)


@dataclass(frozen=True)
class HolidayPreset:
    """One proposal. **No `applied` field, deliberately** — a preset is not a thing that
    can be in a state, it is a suggestion. Ticking one creates a `StudioClosure`."""

    key: str
    name: str
    date_from: date
    date_to: date


def _elapsed_days(hebrew_year: int) -> int:
    """Days from the epoch to 1 Tishrei, molad plus the דחיית ל״א אד״ו.

    The two remaining dechiyot (גטר״ד and בט״ו תקפ״ט אקרים) are not applied here; they are
    what `_year_length_correction` reconstructs from the length of the neighbouring years,
    which is the same answer reached from the other side.
    """
    months = (235 * hebrew_year - 234) // 19
    parts = 12084 + 13753 * months
    day = 29 * months + parts // 25920
    return day + 1 if (3 * (day + 1)) % 7 < 3 else day


def _year_length_correction(hebrew_year: int) -> int:
    before = _elapsed_days(hebrew_year - 1)
    this = _elapsed_days(hebrew_year)
    after = _elapsed_days(hebrew_year + 1)
    if after - this == 356:
        return 2
    if this - before == 382:
        return 1
    return 0


def hebrew_new_year(hebrew_year: int) -> date:
    """The Gregorian date of 1 Tishrei — Rosh Hashanah, day one."""
    rd = HEBREW_EPOCH + _elapsed_days(hebrew_year) + _year_length_correction(hebrew_year)
    return date.fromordinal(rd)


def _shift(anchor: date, days: int) -> date:
    return date.fromordinal(anchor.toordinal() + days)


def _spring_anchor(hebrew_year: int) -> date:
    """15 Nisan of `hebrew_year`, as a date.

    Nisan through Elul is a fixed 177 days (30+29+30+29+30+29), so 1 Nisan is always
    `hebrew_new_year(h + 1) - 177` regardless of whether the year is leap or how Cheshvan
    and Kislev fell. Counting forward from Tishrei instead would need both of those.
    """
    return _shift(hebrew_new_year(hebrew_year + 1), -163)


def _yom_haatzmaut(hebrew_year: int) -> date:
    """5 Iyar, with the observance shifts Israel legislated.

    Friday or Saturday moves **earlier**, to Thursday, so the day is not kept on Shabbat.
    Monday moves **later**, to Tuesday (the 2004 amendment), so Yom Hazikaron's eve does
    not fall on מוצאי שבת. `date.weekday()` is Monday-based: 0 Mon … 4 Fri, 5 Sat, 6 Sun.
    """
    day = _shift(_spring_anchor(hebrew_year), 20)
    weekday = day.weekday()
    if weekday == 4:  # Friday -> Thursday
        return _shift(day, -1)
    if weekday == 5:  # Saturday -> Thursday
        return _shift(day, -2)
    if weekday == 0:  # Monday -> Tuesday
        return _shift(day, 1)
    return day


def _presets_for_hebrew_year(hebrew_year: int) -> list[HolidayPreset]:
    new_year = hebrew_new_year(hebrew_year)
    spring = _spring_anchor(hebrew_year)

    def preset(key: str, date_from: date, date_to: date) -> HolidayPreset:
        return HolidayPreset(
            key=key, name=PRESET_NAMES[key], date_from=date_from, date_to=date_to
        )

    atzmaut = _yom_haatzmaut(hebrew_year)
    return [
        # 1-2 Tishrei. Two days in Israel as well as outside it — Rosh Hashanah is the one
        # festival where the diaspora's second day is kept here too.
        preset("rosh_hashanah", new_year, _shift(new_year, 1)),
        preset("yom_kippur", _shift(new_year, 9), _shift(new_year, 9)),
        # 15-22 Tishrei: Sukkot through Simchat Torah. Clubs that train through חול המועד
        # untick it or shorten it; that is what a proposal is for.
        preset("sukkot", _shift(new_year, 14), _shift(new_year, 21)),
        # 15-21 Nisan. Seven days, not eight: this is an Israeli club.
        preset("pesach", spring, _shift(spring, 6)),
        preset("yom_haatzmaut", atzmaut, atzmaut),
        # 6 Sivan, one day.
        preset("shavuot", _shift(spring, 50), _shift(spring, 50)),
    ]


def presets_for_year(year: int) -> list[HolidayPreset]:
    """Every §5.6 proposal touching Gregorian `year`, in date order.

    §7 spells the endpoint `GET /holiday-presets?year=2026`, a **Gregorian** year, and a
    Gregorian year always straddles two Hebrew ones: 2026 holds Pesach of 5786 and Rosh
    Hashanah of 5787. Both are computed and then filtered by overlap, which is also what
    makes a training year spanning September to June a matter of asking twice.
    """
    # Hebrew year H starts in Gregorian H-3761 or H-3760; both candidates are generated
    # and the overlap filter decides, rather than a boundary condition someone has to get
    # right.
    candidates: list[HolidayPreset] = []
    for hebrew_year in (year + 3760, year + 3761):
        candidates.extend(_presets_for_hebrew_year(hebrew_year))
    candidates.append(
        HolidayPreset(
            key="summer_break",
            name=PRESET_NAMES["summer_break"],
            date_from=date(year, *SUMMER_BREAK_FROM),
            date_to=date(year, *SUMMER_BREAK_TO),
        )
    )

    inside = [p for p in candidates if p.date_from.year == year or p.date_to.year == year]
    return sorted(inside, key=lambda p: (p.date_from, p.key))
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
.venv/bin/pytest tests/schedule/test_holidays.py -q
```
Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
.venv/bin/mypy app/services/schedule && .venv/bin/ruff check app/services/schedule && .venv/bin/ruff format app/services/schedule tests/schedule
git add app/services/schedule/holidays.py tests/schedule/
git commit -m "feat(schedule): Israeli holiday presets as arithmetic, offered never applied"
```

---

### Task 2: Rule expansion, closures and the DST boundary

`group_schedule_rule` stores a naive local `Time` and a Sunday-first `weekday`; `session`
stores a UTC instant. This task is the conversion, and the reason it is its own module is
that the Jerusalem DST switch is the one place the two representations disagree.

**Files:**
- Create: `app/services/schedule/rules.py`
- Test: `tests/schedule/test_rules.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `STUDIO_TZ: ZoneInfo` (`Asia/Jerusalem`)
  - `weekday_sunday_first(day: date) -> int` — 0 Sunday … 6 Saturday, matching
    `group_schedule_rule.weekday`.
  - `jerusalem_date(moment: datetime) -> date`
  - `to_utc(day: date, clock: time) -> datetime`
  - `@dataclass(frozen=True) RuleSpec(weekday, start_time, end_time, location_id, effective_from, effective_to, rule_id)`
  - `@dataclass(frozen=True) ClosureSpec(date_from, date_to)`
  - `@dataclass(frozen=True) Occurrence(on_date, starts_at, ends_at, location_id, rule_id)`
  - `expand_rules(rules, from_date, to_date, closures) -> list[Occurrence]` — sorted by
    `starts_at`.
  - `rule_weekdays(rules, on_or_after: date) -> frozenset[int]` — the weekdays a set of rules
    still covers. C12 reads this.

- [ ] **Step 1: Write the failing test**

`tests/schedule/test_rules.py`:

```python
"""Weekly rules -> dated sessions. Pure: no database, no clock, no studio.

The two things this file is really about:

* **Sunday is 0.** `group_schedule_rule.weekday` matches Postgres's `EXTRACT(DOW)` and
  Israel's working week. `date.weekday()` is Monday-based. Conflating them shifts every
  session in the product by one day, and a test that only ever used Wednesdays would not
  notice.
* **A rule keeps wall-clock time across a DST switch.** A 17:00 class is at 17:00 in
  November and 17:00 in June; the UTC instant differs by an hour. Storing a fixed offset
  instead of a zone puts every summer evening class an hour early, and a judo club's
  classes are overwhelmingly in the evening.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time

from app.services.schedule.rules import (
    ClosureSpec,
    RuleSpec,
    expand_rules,
    jerusalem_date,
    rule_weekdays,
    to_utc,
    weekday_sunday_first,
)

SUNDAY = 0
TUESDAY = 2
FRIDAY = 5


def a_rule(**overrides) -> RuleSpec:
    base = dict(
        weekday=SUNDAY,
        start_time=time(17, 0),
        end_time=time(19, 0),
        location_id=None,
        effective_from=date(2026, 9, 1),
        effective_to=None,
        rule_id=None,
    )
    return RuleSpec(**{**base, **overrides})


def test_weekday_is_sunday_first_matching_the_column():
    # 2026-09-06 is a Sunday.
    assert weekday_sunday_first(date(2026, 9, 6)) == 0
    assert weekday_sunday_first(date(2026, 9, 7)) == 1
    assert weekday_sunday_first(date(2026, 9, 11)) == 5
    assert weekday_sunday_first(date(2026, 9, 12)) == 6


def test_a_rule_keeps_wall_clock_time_across_the_dst_switch():
    """Israel leaves summer time on the last Sunday of October — 25 October 2026. A 17:00
    Tuesday class is 14:00Z before it and 15:00Z after it, and both are 17:00 locally."""
    rule = a_rule(weekday=TUESDAY, start_time=time(17, 0), end_time=time(19, 0))
    occurrences = expand_rules([rule], date(2026, 10, 19), date(2026, 11, 4), [])

    by_date = {o.on_date: o for o in occurrences}
    assert by_date[date(2026, 10, 20)].starts_at == datetime(2026, 10, 20, 14, 0, tzinfo=UTC)
    assert by_date[date(2026, 11, 3)].starts_at == datetime(2026, 11, 3, 15, 0, tzinfo=UTC)


def test_an_occurrence_lands_on_every_matching_weekday_in_the_range_inclusive():
    rule = a_rule(weekday=SUNDAY)
    occurrences = expand_rules([rule], date(2026, 9, 6), date(2026, 9, 27), [])
    assert [o.on_date for o in occurrences] == [
        date(2026, 9, 6),
        date(2026, 9, 13),
        date(2026, 9, 20),
        date(2026, 9, 27),
    ]


def test_a_closure_produces_no_session_rather_than_a_cancelled_one():
    """§5.6 — generation skips closures. That is why a parent's month view can show a gap
    with no cancelled row in it: the lesson was never created, so there is nothing to
    cancel. A closure added *later* is a different operation and does cancel."""
    rule = a_rule(weekday=SUNDAY)
    closure = ClosureSpec(date_from=date(2026, 9, 13), date_to=date(2026, 9, 20))
    occurrences = expand_rules([rule], date(2026, 9, 6), date(2026, 9, 27), [closure])
    assert [o.on_date for o in occurrences] == [date(2026, 9, 6), date(2026, 9, 27)]


def test_a_closure_range_is_inclusive_at_both_ends():
    rule = a_rule(weekday=SUNDAY)
    closure = ClosureSpec(date_from=date(2026, 9, 6), date_to=date(2026, 9, 6))
    occurrences = expand_rules([rule], date(2026, 9, 6), date(2026, 9, 13), [])
    assert len(occurrences) == 2
    occurrences = expand_rules([rule], date(2026, 9, 6), date(2026, 9, 13), [closure])
    assert [o.on_date for o in occurrences] == [date(2026, 9, 13)]


def test_a_rule_produces_nothing_before_it_takes_effect_or_after_it_is_closed():
    """§4.3 versions rules by date rather than editing them in place, so expansion has to
    honour both ends of the window or a superseded rule keeps generating sessions."""
    rule = a_rule(
        weekday=SUNDAY, effective_from=date(2026, 9, 13), effective_to=date(2026, 9, 20)
    )
    occurrences = expand_rules([rule], date(2026, 9, 1), date(2026, 10, 4), [])
    assert [o.on_date for o in occurrences] == [date(2026, 9, 13), date(2026, 9, 20)]


def test_two_rules_on_the_same_day_both_produce_a_session_in_start_order():
    morning = a_rule(weekday=FRIDAY, start_time=time(9, 0), end_time=time(10, 0))
    noon = a_rule(weekday=FRIDAY, start_time=time(12, 0), end_time=time(14, 0))
    occurrences = expand_rules([noon, morning], date(2026, 9, 4), date(2026, 9, 4), [])
    assert [o.starts_at.hour for o in occurrences] == [6, 9]  # 09:00 and 12:00 at UTC+3


def test_the_location_and_rule_id_travel_with_the_occurrence():
    location = uuid.uuid4()
    rule_id = uuid.uuid4()
    rule = a_rule(weekday=SUNDAY, location_id=location, rule_id=rule_id)
    occurrence = expand_rules([rule], date(2026, 9, 6), date(2026, 9, 6), [])[0]
    assert occurrence.location_id == location
    assert occurrence.rule_id == rule_id


def test_an_evening_class_is_filed_under_the_jerusalem_day_not_the_utc_one():
    """22:30Z on 14 March is already 15 March in Jerusalem. Grouping by the UTC date files
    an evening class under the previous day, and almost every class here is in the
    evening. `@studio/core`'s `studioDayKey` is the same rule on the client."""
    assert jerusalem_date(datetime(2026, 3, 14, 22, 30, tzinfo=UTC)) == date(2026, 3, 15)
    assert jerusalem_date(datetime(2026, 3, 14, 12, 30, tzinfo=UTC)) == date(2026, 3, 14)


def test_to_utc_round_trips_through_the_studio_zone():
    moment = to_utc(date(2026, 11, 3), time(17, 0))
    assert moment == datetime(2026, 11, 3, 15, 0, tzinfo=UTC)
    assert jerusalem_date(moment) == date(2026, 11, 3)


def test_rule_weekdays_reports_only_rules_still_live_on_the_date_asked_about():
    """C12 reads this. A student's `attends_weekdays` is intersected with it, so a rule
    that has been closed must not keep a student on a roster that no longer exists."""
    live = a_rule(weekday=TUESDAY, effective_from=date(2026, 9, 1))
    retired = a_rule(weekday=FRIDAY, effective_from=date(2025, 9, 1), effective_to=date(2026, 8, 31))
    assert rule_weekdays([live, retired], date(2026, 9, 15)) == frozenset({TUESDAY})
    assert rule_weekdays([live, retired], date(2026, 1, 1)) == frozenset({FRIDAY})


def test_an_empty_rule_set_expands_to_nothing_rather_than_raising():
    assert expand_rules([], date(2026, 9, 1), date(2027, 6, 30), []) == []


def test_a_backwards_range_expands_to_nothing_rather_than_looping_forever():
    rule = a_rule(weekday=SUNDAY)
    assert expand_rules([rule], date(2026, 9, 27), date(2026, 9, 6), []) == []
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
.venv/bin/pytest tests/schedule/test_rules.py -q
```
Expected: collection error — `No module named 'app.services.schedule.rules'`.

- [ ] **Step 3: Write the implementation**

Create `app/services/schedule/rules.py`:

```python
"""Weekly rules -> dated occurrences. Pure: no database, no clock, no studio.

**Sunday is 0**, matching `group_schedule_rule.weekday`, Postgres's `EXTRACT(DOW)` and
Israel's working week. Python's `date.weekday()` is Monday-based, and the one-line
conversion below is the only place in this lane that knows the difference.

**A rule carries a naive `Time`; a session carries an instant.** That is not an
inconsistency, it is the DST rule: a 17:00 class is at 17:00 in November and 17:00 in June,
and those are different UTC instants. Storing the rule as an offset would put every summer
evening class an hour early — and this club's classes are overwhelmingly in the evening.

Nothing here reads the clock. `now` is a parameter everywhere it matters, because
`app.core.clock.now()` is the only clock (§19.5) and a pure function that read it could not
be time-travelled.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

#: SPEC §4.3, G3. `@studio/core`'s `STUDIO_TIMEZONE` is the same constant on the client.
STUDIO_TZ = ZoneInfo("Asia/Jerusalem")


def weekday_sunday_first(day: date) -> int:
    """0 Sunday … 6 Saturday. `date.weekday()` is 0 Monday … 6 Sunday."""
    return (day.weekday() + 1) % 7


def jerusalem_date(moment: datetime) -> date:
    """The Jerusalem calendar day an instant falls on.

    A **key**, not a label — the same distinction `@studio/core`'s `studioDayKey` makes.
    22:30Z on 14 March is already 15 March here, and grouping by the UTC date would file an
    evening class under the previous day.
    """
    return moment.astimezone(STUDIO_TZ).date()


def to_utc(day: date, clock: time) -> datetime:
    """A Jerusalem wall-clock time on a given day, as the UTC instant it names.

    A local time that does not exist (the hour skipped when Israel springs forward, 02:00
    to 03:00 on a Friday morning) resolves through PEP 495's fold rather than raising. No
    club schedules a class in it, and refusing to materialize a year because one theoretical
    slot is ambiguous would be worse than picking an offset.
    """
    return datetime.combine(day, clock, tzinfo=STUDIO_TZ).astimezone(UTC)


@dataclass(frozen=True)
class RuleSpec:
    """One `group_schedule_rule`, or one the manager has typed but not yet saved.

    `rule_id` is `None` exactly when the rule is unsaved, which is what lets the impact
    preview run over rules that do not exist yet — the preview has to answer "what would
    happen" before anything is written.
    """

    weekday: int
    start_time: time
    end_time: time
    location_id: uuid.UUID | None
    effective_from: date
    effective_to: date | None
    rule_id: uuid.UUID | None = None


@dataclass(frozen=True)
class ClosureSpec:
    """One `studio_closure`, inclusive at both ends."""

    date_from: date
    date_to: date

    def covers(self, day: date) -> bool:
        return self.date_from <= day <= self.date_to


@dataclass(frozen=True)
class Occurrence:
    """One session a rule set says should exist. Not yet a row."""

    on_date: date
    starts_at: datetime
    ends_at: datetime
    location_id: uuid.UUID | None
    rule_id: uuid.UUID | None


def _days(from_date: date, to_date: date) -> Iterable[date]:
    day = from_date
    while day <= to_date:
        yield day
        day += timedelta(days=1)


def _live_on(rule: RuleSpec, day: date) -> bool:
    if day < rule.effective_from:
        return False
    return rule.effective_to is None or day <= rule.effective_to


def expand_rules(
    rules: Sequence[RuleSpec],
    from_date: date,
    to_date: date,
    closures: Sequence[ClosureSpec],
) -> list[Occurrence]:
    """Every session `rules` calls for in `[from_date, to_date]`, in start order.

    Closures produce **no occurrence at all** rather than a cancelled one (§5.6). A date the
    club is closed simply has no lesson, which is why a parent's month view shows a gap
    there instead of a row struck through. Cancelling is what happens when a closure is
    added *after* the sessions already exist, and that is `ScheduleService`'s job, not this
    function's.

    A backwards range yields nothing. It is reachable from a manager typing an end date
    before a start date, and looping forever is the one outcome worse than an empty list.
    """
    occurrences: list[Occurrence] = []
    for day in _days(from_date, to_date):
        if any(closure.covers(day) for closure in closures):
            continue
        weekday = weekday_sunday_first(day)
        for rule in rules:
            if rule.weekday != weekday or not _live_on(rule, day):
                continue
            occurrences.append(
                Occurrence(
                    on_date=day,
                    starts_at=to_utc(day, rule.start_time),
                    ends_at=to_utc(day, rule.end_time),
                    location_id=rule.location_id,
                    rule_id=rule.rule_id,
                )
            )
    return sorted(occurrences, key=lambda o: o.starts_at)


def rule_weekdays(rules: Sequence[RuleSpec], on_or_after: date) -> frozenset[int]:
    """The weekdays a rule set still covers as of a date. **C12 reads this.**

    `app/services/people/attendance_pattern.py::expected_weekdays` intersects a student's
    `attends_weekdays` with exactly this set, so a rule that has been closed must drop out
    of it — otherwise a student stays "expected" at a session the group no longer holds and
    is counted absent from it forever, which is C12's bug arriving from the other side.
    """
    return frozenset(rule.weekday for rule in rules if _live_on(rule, on_or_after))
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
.venv/bin/pytest tests/schedule/test_rules.py -q
```
Expected: PASS, 13 tests.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
.venv/bin/mypy app/services/schedule && .venv/bin/ruff check app/services/schedule && .venv/bin/ruff format app/services/schedule tests/schedule
git add app/services/schedule/rules.py tests/schedule/test_rules.py
git commit -m "feat(schedule): expand weekly rules into dated occurrences, DST-correct"
```

---

### Task 3: The impact diff, and C12

The lane's reason to exist, as a pure function. §5.6's dialog "shows exactly what will
happen before it happens", and C12 adds the consequence the dialog was missing: a change
that leaves students expecting nothing looks exactly like the feature working.

**Files:**
- Create: `app/services/schedule/impact.py`
- Modify: `app/schemas/schedule.py` (append only — nothing authored is renamed or removed)
- Test: `tests/schedule/test_impact.py`

**Interfaces:**
- Consumes: `Occurrence`, `jerusalem_date` from Task 2;
  `expected_weekdays` from `app/services/people/attendance_pattern.py` (**imported, never
  modified** — it is the designated C11/C12 seam).
- Produces:
  - `@dataclass(frozen=True) ExistingSession(id, starts_at, ends_at, location_id, status, is_manually_edited, is_ad_hoc)`
  - `@dataclass(frozen=True) ProtectedSession(id, starts_at, ends_at)`
  - `@dataclass(frozen=True) ChangePlan(to_create, to_update, to_cancel, protected_past, protected_manually_edited, protected_ad_hoc, first_affected_date)`
  - `plan_change(existing, desired, *, now: datetime, effective_from: date) -> ChangePlan`
  - `students_left_unscheduled(patterns: Iterable[tuple[uuid.UUID, Sequence[int] | None]], new_weekdays: Iterable[int]) -> int`
  - `SYSTEM_CANCEL_SCHEDULE_CHANGE: str`, `SYSTEM_CANCEL_CLOSURE: str`
- Schema additions consumed by Tasks 6 and 10:
  - `ProtectedSessionOut(id, starts_at, ends_at)`
  - `ScheduleImpactPreview.students_left_unscheduled: int = 0`
  - `ScheduleImpactPreview.protected_manually_edited_sessions: list[ProtectedSessionOut] = []`

- [ ] **Step 1: Write the failing test**

`tests/schedule/test_impact.py`:

```python
"""§5.6's impact preview and C12's warning, as a pure diff. No database, no clock.

**The invariant this lane exists to protect lives here.** A rule change rewrites only
sessions with `starts_at > now`; a session in the past, a session carrying
`is_manually_edited`, and an ad-hoc session are never touched. Every test below that names
a protection is a way that guarantee can be lost, and losing any one of them destroys
history that a coach or a manager already acted on.

**C12 is the other half.** Moving a rule from Tuesday to Wednesday empties the pattern of
every student who only came on Tuesdays. They drop off the roster and stop being counted
absent, which reads exactly like the feature working. The count is the whole point.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from app.services.schedule.impact import (
    ExistingSession,
    plan_change,
    students_left_unscheduled,
)
from app.services.schedule.rules import Occurrence

NOW = datetime(2026, 11, 3, 12, 0, tzinfo=UTC)  # a Tuesday lunchtime in Jerusalem
YEAR_START = date(2026, 9, 1)


def occurrence(day: date, hour: int = 17, *, location=None, rule_id=None) -> Occurrence:
    return Occurrence(
        on_date=day,
        starts_at=datetime(day.year, day.month, day.day, hour - 2, 0, tzinfo=UTC),
        ends_at=datetime(day.year, day.month, day.day, hour, 0, tzinfo=UTC),
        location_id=location,
        rule_id=rule_id,
    )


def existing(
    day: date,
    hour: int = 17,
    *,
    manual: bool = False,
    ad_hoc: bool = False,
    status: str = "scheduled",
    location=None,
) -> ExistingSession:
    return ExistingSession(
        id=uuid.uuid4(),
        starts_at=datetime(day.year, day.month, day.day, hour - 2, 0, tzinfo=UTC),
        ends_at=datetime(day.year, day.month, day.day, hour, 0, tzinfo=UTC),
        location_id=location,
        status=status,
        is_manually_edited=manual,
        is_ad_hoc=ad_hoc,
    )


# -- the three protections ----------------------------------------------------
def test_a_past_session_is_never_rewritten():
    """A session that happened has attendance rows against it. Regenerating it rewrites a
    register a coach already signed."""
    held = existing(date(2026, 10, 6))
    plan = plan_change([held], [occurrence(date(2026, 10, 6), 18)], now=NOW, effective_from=YEAR_START)

    assert plan.protected_past == (held.id,)
    assert plan.to_update == ()
    assert plan.to_cancel == ()


def test_a_manually_edited_future_session_is_never_rewritten_and_is_named():
    """Someone moved this one class deliberately, usually a room clash. A rule change that
    silently undoes it is the product overruling a human who knew something it did not —
    and §5.6's dialog lists them by date for exactly that reason."""
    moved = existing(date(2026, 11, 17), 20, manual=True)
    plan = plan_change([moved], [occurrence(date(2026, 11, 17), 18)], now=NOW, effective_from=YEAR_START)

    assert [p.id for p in plan.protected_manually_edited] == [moved.id]
    assert plan.protected_manually_edited[0].starts_at == moved.starts_at
    assert plan.to_update == ()
    # And the slot it would have occupied is NOT filled with a second session.
    assert plan.to_create == ()


def test_an_ad_hoc_session_survives_a_regenerate_no_rule_created_it():
    one_off = existing(date(2026, 11, 10), 19, ad_hoc=True)
    plan = plan_change([one_off], [], now=NOW, effective_from=YEAR_START)

    assert plan.protected_ad_hoc == (one_off.id,)
    assert plan.to_cancel == ()


def test_a_session_already_cancelled_is_not_resurrected():
    """A closure cancelled this one. A later rule change must not undo the closure — and
    the desired set never contains a closed date, so the row simply stays as it is."""
    closed = existing(date(2026, 11, 24), status="cancelled")
    plan = plan_change([closed], [], now=NOW, effective_from=YEAR_START)

    assert plan.to_update == ()
    assert plan.to_cancel == ()


# -- what actually changes ----------------------------------------------------
def test_a_future_session_at_a_different_time_is_an_update():
    future = existing(date(2026, 11, 17), 19)
    wanted = occurrence(date(2026, 11, 17), 20)
    plan = plan_change([future], [wanted], now=NOW, effective_from=YEAR_START)

    assert plan.to_update == ((future.id, wanted),)
    assert plan.to_create == ()
    assert plan.to_cancel == ()


def test_a_future_session_already_at_the_wanted_time_is_left_alone():
    """Not counted as an update. §5.6's dialog answers 'what am I about to lose', and a row
    that does not move is noise in that answer — and a needless UPDATE would bump
    `updated_at` on a year's worth of sessions."""
    future = existing(date(2026, 11, 17), 19)
    plan = plan_change([future], [occurrence(date(2026, 11, 17), 19)], now=NOW, effective_from=YEAR_START)

    assert plan.to_update == ()
    assert plan.to_create == ()
    assert plan.to_cancel == ()
    assert plan.first_affected_date is None


def test_a_wanted_slot_with_no_session_is_a_create():
    plan = plan_change([], [occurrence(date(2026, 11, 18))], now=NOW, effective_from=YEAR_START)
    assert [o.on_date for o in plan.to_create] == [date(2026, 11, 18)]


def test_a_session_no_rule_covers_any_more_is_a_cancel():
    orphan = existing(date(2026, 11, 20))
    plan = plan_change([orphan], [], now=NOW, effective_from=YEAR_START)
    assert plan.to_cancel == (orphan.id,)


def test_moving_a_rule_to_another_weekday_is_a_cancel_plus_a_create():
    """The Tuesday-to-Wednesday move C12 is about, seen from the sessions' side."""
    tuesday = existing(date(2026, 11, 17))
    plan = plan_change([tuesday], [occurrence(date(2026, 11, 18))], now=NOW, effective_from=YEAR_START)

    assert plan.to_cancel == (tuesday.id,)
    assert [o.on_date for o in plan.to_create] == [date(2026, 11, 18)]
    assert plan.first_affected_date == date(2026, 11, 17)


def test_a_location_change_alone_is_still_an_update():
    elsewhere = uuid.uuid4()
    future = existing(date(2026, 11, 17), 19)
    wanted = occurrence(date(2026, 11, 17), 19, location=elsewhere)
    plan = plan_change([future], [wanted], now=NOW, effective_from=YEAR_START)
    assert plan.to_update == ((future.id, wanted),)


def test_two_sessions_on_one_day_pair_up_in_start_order():
    """D-M2-5. A group training twice on a Friday must not have its morning class matched
    against its afternoon one."""
    morning = existing(date(2026, 11, 20), 11)
    noon = existing(date(2026, 11, 20), 15)
    wanted_morning = occurrence(date(2026, 11, 20), 12)
    wanted_noon = occurrence(date(2026, 11, 20), 16)

    plan = plan_change(
        [noon, morning], [wanted_noon, wanted_morning], now=NOW, effective_from=YEAR_START
    )
    assert plan.to_update == ((morning.id, wanted_morning), (noon.id, wanted_noon))


def test_first_affected_date_is_the_earliest_thing_that_moves():
    late = existing(date(2026, 12, 15), 19)
    early = existing(date(2026, 11, 17), 19)
    plan = plan_change(
        [late, early],
        [occurrence(date(2026, 11, 17), 20), occurrence(date(2026, 12, 15), 20)],
        now=NOW,
        effective_from=YEAR_START,
    )
    assert plan.first_affected_date == date(2026, 11, 17)


# -- the window ---------------------------------------------------------------
def test_nothing_before_effective_from_is_touched_even_though_it_is_future():
    """The manager said 'from December'. A November session is neither past nor changing,
    and rewriting it would apply a change the manager explicitly dated later."""
    november = existing(date(2026, 11, 17), 19)
    plan = plan_change(
        [november],
        [occurrence(date(2026, 12, 15), 20)],
        now=NOW,
        effective_from=date(2026, 12, 1),
    )
    assert plan.to_cancel == ()
    assert plan.to_update == ()
    assert [o.on_date for o in plan.to_create] == [date(2026, 12, 15)]


def test_a_desired_occurrence_in_the_past_is_never_created():
    """plan_change enforces the invariant itself rather than trusting the caller's range.
    One function owns 'only the future', so a caller that expands too wide cannot break it."""
    plan = plan_change([], [occurrence(date(2026, 10, 6))], now=NOW, effective_from=YEAR_START)
    assert plan.to_create == ()


def test_a_session_starting_exactly_now_counts_as_past():
    """The boundary is `starts_at > now`, verbatim from §5.6. A class that is starting
    this second has people on the mat."""
    starting = ExistingSession(
        id=uuid.uuid4(),
        starts_at=NOW,
        ends_at=datetime(2026, 11, 3, 14, 0, tzinfo=UTC),
        location_id=None,
        status="scheduled",
        is_manually_edited=False,
        is_ad_hoc=False,
    )
    plan = plan_change([starting], [], now=NOW, effective_from=YEAR_START)
    assert plan.protected_past == (starting.id,)
    assert plan.to_cancel == ()


# -- C12 ----------------------------------------------------------------------
def test_c12_counts_the_students_a_change_leaves_expecting_nothing():
    """Moving a rule from Tuesday to Wednesday empties the pattern of every student who
    only came on Tuesdays."""
    tuesday_only = [(uuid.uuid4(), [2]) for _ in range(3)]
    comes_to_both = [(uuid.uuid4(), [2, 3])]
    assert students_left_unscheduled(tuesday_only + comes_to_both, new_weekdays={3}) == 3


def test_c12_counts_a_student_with_no_pattern_only_when_the_group_stops_training():
    """`attends_weekdays IS NULL` means 'all of this group's sessions'. That student is
    fine while any rule survives — and is left with nothing the moment the last one goes,
    which is the case most worth warning about."""
    everyone = [(uuid.uuid4(), None), (uuid.uuid4(), None)]
    assert students_left_unscheduled(everyone, new_weekdays={3}) == 0
    assert students_left_unscheduled(everyone, new_weekdays=set()) == 2


def test_c12_counts_students_not_enrollments():
    """D-M2-6. `uq_enrollment_live` makes these the same number inside one group today, and
    the copy says תלמידים — a later schema change must not silently turn it into a
    different count."""
    student = uuid.uuid4()
    assert students_left_unscheduled([(student, [2]), (student, [2])], new_weekdays={3}) == 1


def test_c12_is_zero_when_nobody_loses_their_day():
    patterns = [(uuid.uuid4(), [0]), (uuid.uuid4(), [0, 5]), (uuid.uuid4(), None)]
    assert students_left_unscheduled(patterns, new_weekdays={0, 5}) == 0


def test_c12_ignores_a_day_the_student_asked_for_that_the_group_never_trains():
    """`expected_weekdays` intersects, so a stale pattern naming a day the group dropped
    does not keep the student alive on a roster that no longer has that day."""
    assert students_left_unscheduled([(uuid.uuid4(), [4])], new_weekdays={0, 2}) == 1
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
.venv/bin/pytest tests/schedule/test_impact.py -q
```
Expected: collection error — `No module named 'app.services.schedule.impact'`.

- [ ] **Step 3: Write the implementation**

Create `app/services/schedule/impact.py`:

```python
"""§5.6's impact preview, and C12's warning. Pure: no database, no clock, no studio.

**This module is the invariant.** "Changing a rule rewrites only future sessions. Past
sessions and any session with `is_manually_edited = true` are never overwritten." Every
caller goes through `plan_change`, and `plan_change` enforces the rule against `now`
itself rather than trusting the range its caller expanded — so a service that asks for too
wide a window cannot turn a preview into a rewrite of last term.

**Why the protections are counted apart rather than summed.** The manager's question is not
"how many are safe", it is "what am I about to lose". A single number cannot say whether
last month survived, and a manager who cannot see that the past is safe will not press the
button.

**C12 arrives from the other direction.** A change can be perfectly correct about sessions
and still empty the pattern of every student who only came on the day it moved. They drop
off the roster and stop being counted absent, which looks exactly like the feature working.
`students_left_unscheduled` is that count, and it reads through
`app/services/people/attendance_pattern.py` — the seam W2's contract commit landed for it —
rather than reimplementing the intersection here, because two copies of that rule would
eventually disagree and the roster would be the thing that broke.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from itertools import zip_longest

from app.services.people.attendance_pattern import expected_weekdays
from app.services.schedule.rules import Occurrence, jerusalem_date

#: D-M2-3 — a cancellation the *server* generated. A manager's `cancel_reason` is free text
#: they typed; these are tokens the client maps to an i18n key, so `app/` never holds a
#: second Hebrew string table that §9 cannot reach.
SYSTEM_CANCEL_SCHEDULE_CHANGE = "system:schedule_change"
SYSTEM_CANCEL_CLOSURE = "system:closure"


@dataclass(frozen=True)
class ExistingSession:
    """The seven fields the diff needs. Deliberately not the ORM row: a pure function that
    took a `Session` would be one lazy-load away from needing a database."""

    id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    location_id: uuid.UUID | None
    status: str
    is_manually_edited: bool
    is_ad_hoc: bool


@dataclass(frozen=True)
class ProtectedSession:
    """One row the dialog lists by name. §5.6 prints the manually-edited ones as bullets,
    because a count of two tells a manager nothing about which two."""

    id: uuid.UUID
    starts_at: datetime
    ends_at: datetime


@dataclass(frozen=True)
class ChangePlan:
    to_create: tuple[Occurrence, ...]
    to_update: tuple[tuple[uuid.UUID, Occurrence], ...]
    to_cancel: tuple[uuid.UUID, ...]
    protected_past: tuple[uuid.UUID, ...]
    protected_manually_edited: tuple[ProtectedSession, ...]
    protected_ad_hoc: tuple[uuid.UUID, ...]
    first_affected_date: date | None


def _matches(session: ExistingSession, wanted: Occurrence) -> bool:
    return (
        session.starts_at == wanted.starts_at
        and session.ends_at == wanted.ends_at
        and session.location_id == wanted.location_id
    )


def plan_change(
    existing: Sequence[ExistingSession],
    desired: Sequence[Occurrence],
    *,
    now: datetime,
    effective_from: date,
) -> ChangePlan:
    """What a schedule change would do, without doing any of it.

    `existing` is every session the group already has inside the training year — past ones
    included, because the dialog has to be able to say the past is safe. `desired` is what
    the new rules call for; occurrences at or before `now`, and occurrences before
    `effective_from`, are discarded here rather than by the caller.

    Matching is by **Jerusalem calendar day, then by start time within the day** (D-M2-5).
    A rule-identity join would look tidier and would dangle the moment a rewrite replaces
    the rules, which is precisely the operation being previewed.
    """
    protected_past: list[uuid.UUID] = []
    protected_manual: list[ProtectedSession] = []
    protected_ad_hoc: list[uuid.UUID] = []
    regeneratable: list[ExistingSession] = []

    for session in existing:
        if session.starts_at <= now:
            # §5.6's first protection, and the boundary is `>` verbatim: a class starting
            # this second has people on the mat.
            protected_past.append(session.id)
            continue
        if session.is_manually_edited:
            protected_manual.append(
                ProtectedSession(
                    id=session.id, starts_at=session.starts_at, ends_at=session.ends_at
                )
            )
            continue
        if session.is_ad_hoc:
            protected_ad_hoc.append(session.id)
            continue
        if session.status != "scheduled":
            # Already cancelled — by a closure, almost always. A rule change must not
            # resurrect a lesson the club has told families is not happening.
            continue
        if jerusalem_date(session.starts_at) < effective_from:
            # Future, but before the date the manager dated the change from. Neither
            # protected nor changing: outside the window entirely.
            continue
        regeneratable.append(session)

    wanted = [
        occurrence
        for occurrence in desired
        if occurrence.starts_at > now and occurrence.on_date >= effective_from
    ]

    by_day_existing: dict[date, list[ExistingSession]] = {}
    for session in regeneratable:
        by_day_existing.setdefault(jerusalem_date(session.starts_at), []).append(session)
    by_day_wanted: dict[date, list[Occurrence]] = {}
    for occurrence in wanted:
        by_day_wanted.setdefault(occurrence.on_date, []).append(occurrence)

    to_create: list[Occurrence] = []
    to_update: list[tuple[uuid.UUID, Occurrence]] = []
    to_cancel: list[uuid.UUID] = []

    for day in sorted(by_day_existing.keys() | by_day_wanted.keys()):
        have = sorted(by_day_existing.get(day, ()), key=lambda s: s.starts_at)
        want = sorted(by_day_wanted.get(day, ()), key=lambda o: o.starts_at)
        for session, occurrence in zip_longest(have, want):
            if session is None and occurrence is not None:
                to_create.append(occurrence)
            elif occurrence is None and session is not None:
                to_cancel.append(session.id)
            elif session is not None and occurrence is not None and not _matches(session, occurrence):
                to_update.append((session.id, occurrence))

    affected = [o.on_date for o in to_create]
    affected += [jerusalem_date(o.starts_at) for _, o in to_update]
    affected += [
        jerusalem_date(s.starts_at) for s in regeneratable if s.id in set(to_cancel)
    ]

    return ChangePlan(
        to_create=tuple(to_create),
        to_update=tuple(to_update),
        to_cancel=tuple(to_cancel),
        protected_past=tuple(protected_past),
        protected_manually_edited=tuple(protected_manual),
        protected_ad_hoc=tuple(protected_ad_hoc),
        first_affected_date=min(affected) if affected else None,
    )


def students_left_unscheduled(
    patterns: Iterable[tuple[uuid.UUID, Sequence[int] | None]],
    new_weekdays: Iterable[int],
) -> int:
    """**C12.** How many students this group would leave expecting nothing.

    Takes one `(student_id, enrollment.attends_weekdays)` pair per active enrollment in the
    group, and the weekdays the group would still train on afterwards.

    `attends_weekdays IS NULL` means "all of this group's sessions", so such a student is
    counted only when the group stops training altogether — which is the case most worth
    warning about, and the one a naive "skip the NULLs" implementation misses.

    Distinct students, not enrollments (D-M2-6): `uq_enrollment_live` makes those the same
    number inside one group today, and the copy says תלמידים.
    """
    scheduled = frozenset(new_weekdays)
    stranded = {
        student_id
        for student_id, attends in patterns
        if not expected_weekdays(attends, scheduled)
    }
    return len(stranded)
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
.venv/bin/pytest tests/schedule/test_impact.py -q
```
Expected: PASS, 20 tests.

- [ ] **Step 5: Extend the response schema**

Append to `app/schemas/schedule.py`, immediately **before** the `ScheduleImpactPreview`
class, and add the two fields to it. Nothing already in the file is renamed or removed.

```python
class ProtectedSessionOut(BaseModel):
    """One session the change will not touch, named rather than merely counted.

    §5.6's dialog prints the manually-edited ones as bullets — `· 15.11 אימון ים 90 דק'` —
    because "2 sessions were manually edited" tells a manager nothing about which two. The
    shape carries no title: `session` has no name column, and inventing one here would be a
    field with nothing behind it. The client renders the date and the time range.
    """

    id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
```

Then inside `ScheduleImpactPreview`, after `first_affected_date`:

```python
    #: §5.6's bullet list. Only the manually-edited ones: the past is a count (there is
    #: nothing to decide about it) and an ad-hoc session was never going to be touched.
    protected_manually_edited_sessions: list[ProtectedSessionOut] = Field(default_factory=list)
    #: **C12.** Students this change leaves expecting nothing — `attends_weekdays` no
    #: longer intersects any day the group trains on. They vanish off the roster and stop
    #: being counted absent, which looks exactly like the feature working. The dialog says
    #: `⚠ 3 תלמידים לא רשומים לאף יום אחרי השינוי`; this is the 3.
    students_left_unscheduled: int = 0
```

- [ ] **Step 6: Verify the contract tests still hold, then commit**

```bash
.venv/bin/pytest tests/schedule/test_impact.py tests/contracts/test_w2_schemas.py -q
.venv/bin/mypy app/services/schedule app/schemas/schedule.py && .venv/bin/ruff check app/services/schedule app/schemas/schedule.py && .venv/bin/ruff format app/services/schedule app/schemas/schedule.py tests/schedule
git add app/services/schedule/impact.py app/schemas/schedule.py tests/schedule/test_impact.py
git commit -m "feat(schedule): the §5.6 impact diff, and C12's count of stranded students"
```

---

### Task 4: ScheduleService, training years and closures

The first database-touching task. It also establishes the shape every later service method
follows: an instance holding a `TenantSession`, no `studio_id` passed by hand, `at` taken as
a parameter because `app.core.clock.now()` is the only clock.

**Files:**
- Create: `app/services/schedule/service.py`
- Modify: `app/services/schedule/__init__.py` (re-export; the seam docstring stays)
- Create: `app/routers/schedule.py`
- Modify: `app/schemas/schedule.py` (append `ClosureCreatedOut`, `GenerateSessionsOut`, `ScheduleRulesOut`)
- Create: `tests/schedule/conftest.py`
- Test: `tests/schedule/test_years_and_closures.py`

**Interfaces:**
- Consumes: Tasks 1–3; `TenantSessionDep`, `AnyStaff`, `ManagerOrOwner`, `now()`,
  `CursorPage`, `IdempotencyKey`.
- Produces:
  - `class ScheduleService` with `__init__(self, session: OrmSession)`
  - `NotFoundError`, `ConflictError`
  - `list_training_years(*, cursor, limit)`, `create_training_year(*, name, starts_on, ends_on, at)`, `get_training_year(training_year_id)`
  - `list_closures(*, training_year_id, cursor, limit)`, `create_closure(*, training_year_id, date_from, date_to, reason, source, at) -> tuple[StudioClosure, int]`
  - Router paths `GET/POST /training-years`, `GET/POST /closures`, `GET /holiday-presets`

- [ ] **Step 1: Write the fixtures**

`tests/schedule/conftest.py`. Modelled on `tests/structure/conftest.py`, which cannot be
shared: pytest does not pass a conftest between sibling directories.

```python
"""Signed-in callers and a studio with one group, for the schedule lane.

Every fixture signs in for real rather than forging a token, for the reason
`tests/structure/conftest.py` gives: §3.2's matrix is enforced by a dependency reading
`request.state.roles`, which `app/core/auth_context.py` fills from a VERIFIED claim. A
hand-made token would test the dependency against an input the product cannot produce.

The two sign-ins per caller are not a workaround. The first creates the `auth_identity`
(nothing else can), the rows are attached to it, and the second picks up a token whose
`sid` and `roles` claims reflect them.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime

import pytest
from app.models.identity import AuthIdentity
from app.models.person import Person, RoleAssignment
from app.models.schedule import TrainingYear
from app.models.structure import Class, Group, Location
from app.models.studio import Studio
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.conftest import sign_in

#: A Tuesday lunchtime, well inside the 2026/27 training year. Every test that needs "now"
#: sends it as X-Dev-Now so the clock is the same on the server and in the assertion.
T0 = datetime(2026, 11, 3, 12, 0, tzinfo=UTC)
YEAR_STARTS = date(2026, 9, 1)
YEAR_ENDS = date(2027, 6, 30)


@dataclass
class Caller:
    token: str
    studio_id: uuid.UUID
    person_id: uuid.UUID

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}", "X-Dev-Now": T0.isoformat()}


@pytest.fixture
def studio(app_session: Session) -> Iterator[Studio]:
    row = Studio(name="מועדון לוח זמנים", slug=f"sch-{uuid.uuid4().hex[:8]}")
    app_session.add(row)
    app_session.commit()
    yield row
    app_session.rollback()


def _make_caller(client, fake_provider, app_session, studio, *, role: str | None) -> Caller:
    subject = f"{role or 'guardian'}-{uuid.uuid4()}"
    code = f"code-{subject}"
    fake_provider.register(code=code, subject=subject, email=f"{subject}@example.invalid")
    sign_in(client, code=code, app_name="staff")

    identity_id = app_session.execute(
        select(AuthIdentity.id).where(AuthIdentity.provider_subject == subject)
    ).scalar_one()

    person = Person(
        studio_id=studio.id,
        auth_identity_id=identity_id,
        first_name="בודק",
        last_name=role or "הורה",
    )
    app_session.add(person)
    app_session.flush()
    if role is not None:
        app_session.add(
            RoleAssignment(
                studio_id=studio.id,
                person_id=person.id,
                role=role,
                scope_type="studio",
                granted_at=T0,
            )
        )
    app_session.commit()

    signed = sign_in(client, code=code, app_name="staff")
    return Caller(token=signed.json()["access_token"], studio_id=studio.id, person_id=person.id)


@pytest.fixture
def as_manager(client, fake_provider, app_session, studio) -> Caller:
    return _make_caller(client, fake_provider, app_session, studio, role="manager")


@pytest.fixture
def as_lead_coach(client, fake_provider, app_session, studio) -> Caller:
    return _make_caller(client, fake_provider, app_session, studio, role="lead_coach")


@pytest.fixture
def as_assistant_coach(client, fake_provider, app_session, studio) -> Caller:
    return _make_caller(client, fake_provider, app_session, studio, role="assistant_coach")


@pytest.fixture
def a_location(app_session: Session, studio: Studio) -> uuid.UUID:
    row = Location(studio_id=studio.id, name="אולם א׳")
    app_session.add(row)
    app_session.commit()
    return row.id


@pytest.fixture
def a_group(app_session: Session, studio: Studio) -> uuid.UUID:
    klass = Class(studio_id=studio.id, name="ג'ודו", discipline="judo")
    app_session.add(klass)
    app_session.flush()
    group = Group(studio_id=studio.id, class_id=klass.id, name="מתחילים")
    app_session.add(group)
    app_session.commit()
    return group.id


@pytest.fixture
def an_active_year(app_session: Session, studio: Studio) -> uuid.UUID:
    row = TrainingYear(
        studio_id=studio.id,
        name="תשפ״ז",
        starts_on=YEAR_STARTS,
        ends_on=YEAR_ENDS,
        status="active",
    )
    app_session.add(row)
    app_session.commit()
    return row.id
```

- [ ] **Step 2: Write the failing test**

`tests/schedule/test_years_and_closures.py`:

```python
"""§5.15's training year and §5.6's closures, through the API.

The one rule that shapes both: **a preset is a proposal**. `GET /holiday-presets` never
writes a row, and the only thing that creates a `studio_closure` is a manager POSTing one.
"""

from __future__ import annotations

from tests.schedule.conftest import YEAR_ENDS, YEAR_STARTS

API = "/api/v1"


def test_a_manager_creates_a_training_year_and_it_starts_as_a_draft(client, as_manager):
    """§5.15 — the wizard is resumable and 'nothing is visible to guardians until it is
    activated', which is why `draft` is a persisted state rather than wizard memory."""
    response = client.post(
        f"{API}/training-years",
        headers=as_manager.headers,
        json={"name": "תשפ״ח", "starts_on": "2027-09-01", "ends_on": "2028-06-30"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "draft"
    assert response.json()["name"] == "תשפ״ח"


def test_a_year_that_ends_before_it_starts_is_refused_by_the_schema(client, as_manager):
    response = client.post(
        f"{API}/training-years",
        headers=as_manager.headers,
        json={"name": "הפוך", "starts_on": "2027-09-01", "ends_on": "2027-08-01"},
    )
    assert response.status_code == 422


def test_a_coach_may_read_the_years_but_never_create_one(client, as_lead_coach):
    """§3.2 — 'Create/edit classes, groups, schedules' is owner and manager. A coach reads
    the schedule because a roster is unreadable without it."""
    assert client.get(f"{API}/training-years", headers=as_lead_coach.headers).status_code == 200
    refused = client.post(
        f"{API}/training-years",
        headers=as_lead_coach.headers,
        json={"name": "לא", "starts_on": "2027-09-01", "ends_on": "2028-06-30"},
    )
    assert refused.status_code == 403


def test_an_anonymous_caller_gets_401_not_403(client):
    assert client.get(f"{API}/training-years").status_code == 401


def test_the_year_list_is_cursor_paginated(client, as_manager, an_active_year):
    body = client.get(f"{API}/training-years?limit=1", headers=as_manager.headers).json()
    assert set(body) == {"items", "next_cursor", "has_more"}


def test_holiday_presets_are_offered_for_a_gregorian_year(client, as_manager):
    """§7 — `GET /holiday-presets?year=2026`."""
    response = client.get(f"{API}/holiday-presets?year=2026", headers=as_manager.headers)
    assert response.status_code == 200
    by_key = {p["key"]: p for p in response.json()}
    assert by_key["yom_kippur"]["date_from"] == "2026-09-21"
    assert by_key["summer_break"]["date_from"] == "2026-07-01"


def test_asking_for_presets_creates_no_closure(client, as_manager, an_active_year):
    """§5.6, the whole rule: 'Nothing is closed automatically — studios differ, and a wrong
    guess deletes real lessons.'"""
    client.get(f"{API}/holiday-presets?year=2026", headers=as_manager.headers)
    listed = client.get(
        f"{API}/closures?training_year_id={an_active_year}", headers=as_manager.headers
    )
    assert listed.json()["items"] == []


def test_a_preset_becomes_a_closure_only_when_the_manager_posts_it(
    client, as_manager, an_active_year
):
    response = client.post(
        f"{API}/closures",
        headers=as_manager.headers,
        json={
            "training_year_id": str(an_active_year),
            "date_from": "2026-09-21",
            "date_to": "2026-09-21",
            "reason": "יום כיפור",
            "source": "holiday_preset",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["source"] == "holiday_preset"
    assert response.json()["sessions_cancelled"] == 0


def test_a_closure_source_outside_the_two_the_column_allows_is_refused(
    client, as_manager, an_active_year
):
    response = client.post(
        f"{API}/closures",
        headers=as_manager.headers,
        json={
            "training_year_id": str(an_active_year),
            "date_from": "2026-09-21",
            "date_to": "2026-09-21",
            "reason": "משהו",
            "source": "guessed",
        },
    )
    assert response.status_code == 422


def test_a_closure_for_another_studios_year_is_invisible_rather_than_forbidden(
    client, as_manager, app_session
):
    """The tenant filter makes the row invisible; a 403 would confirm it exists."""
    import uuid as _uuid

    from app.models.schedule import TrainingYear
    from app.models.studio import Studio

    other = Studio(name="מועדון אחר", slug=f"o-{_uuid.uuid4().hex[:8]}")
    app_session.add(other)
    app_session.flush()
    year = TrainingYear(
        studio_id=other.id,
        name="שלהם",
        starts_on=YEAR_STARTS,
        ends_on=YEAR_ENDS,
        status="active",
    )
    app_session.add(year)
    app_session.commit()

    response = client.post(
        f"{API}/closures",
        headers=as_manager.headers,
        json={
            "training_year_id": str(year.id),
            "date_from": "2026-09-21",
            "date_to": "2026-09-21",
            "reason": "לא שלנו",
            "source": "manual",
        },
    )
    assert response.status_code == 404
```

- [ ] **Step 3: Run the test and confirm it fails**

```bash
.venv/bin/pytest tests/schedule/test_years_and_closures.py -q
```
Expected: every test fails with 404 — `app/routers/schedule.py` does not exist, so nothing is
mounted at those paths.

- [ ] **Step 4: Extend the schemas**

Append to `app/schemas/schedule.py`:

```python
class ClosureCreatedOut(ClosureOut):
    """§5.6 — 'adding one cancels the affected sessions and notifies the affected
    guardians'. The count is returned rather than left for the client to discover on the
    next fetch, because a manager who has just closed a fortnight needs to see how many
    lessons that cost before they navigate away. The notification is §5.11's and lands
    in W5."""

    sessions_cancelled: int = 0


class GenerateSessionsOut(BaseModel):
    """§5.15 step 6 — 'materialize every session for the year … and show a summary of what
    was created'."""

    training_year_id: uuid.UUID
    groups: int
    sessions_created: int


class ScheduleRulesOut(BaseModel):
    """`GET /groups/{id}/schedule`. Only rules still in force: a superseded rule is history
    the editor must not offer back for editing."""

    group_id: uuid.UUID
    rules: list[ScheduleRuleOut] = Field(default_factory=list)
```

- [ ] **Step 5: Write the service**

Create `app/services/schedule/service.py`:

```python
"""§5.6 and §5.15 against the database. G6 — the routers parse, call, and return.

Everything here runs inside a `TenantSession`, so the tenant filter is already on every
query and the stamp already on every insert. Nothing below passes `studio_id` by hand:
doing so would be a second, weaker copy of a guarantee `app/core/tenancy.py` already makes,
and the two could disagree.

**An instance, not a namespace of `@staticmethod`s.** W2's contract commit fixed the seam as
`ScheduleService().materialize_sessions(group_id, from_date, to_date)` — three arguments and
no session — so the session has to arrive through the constructor. The rest of the class
follows suit rather than being half one shape and half the other.

`at` is a parameter on every writing method. `app.core.clock.now()` is the only clock
(§19.5) and a service that read it could not be time-travelled, which is what every billing
and reminder test in this product depends on.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import Select, select
from sqlalchemy.orm import Session as OrmSession

from app.models.schedule import GroupScheduleRule, Session, StudioClosure, TrainingYear
from app.models.structure import Group
from app.services.schedule.impact import SYSTEM_CANCEL_CLOSURE
from app.services.schedule.rules import ClosureSpec, jerusalem_date


class NotFoundError(LookupError):
    """A row this studio cannot see.

    Deliberately not distinguished from "does not exist anywhere": the tenant filter makes
    another studio's row invisible, and a 403 would confirm it is real.
    """


class ConflictError(Exception):
    """A state transition the studio's own data forbids."""


def _paged[Row](
    stmt: Select[tuple[Row]], *, cursor: uuid.UUID | None, limit: int
) -> Select[tuple[Row]]:
    """G16 — keyset pagination on the primary key, the same helper shape
    `app/services/structure/service.py` uses. `limit + 1` is fetched so the caller can tell
    "last page" from "one more row" without a second COUNT."""
    if cursor is not None:
        stmt = stmt.where(stmt.column_descriptions[0]["entity"].id > cursor)
    return stmt.limit(limit + 1)


def _page_out[Row](rows: list[Row], limit: int) -> tuple[list[Row], uuid.UUID | None]:
    if len(rows) > limit:
        return rows[:limit], rows[limit - 1].id  # type: ignore[attr-defined]
    return rows, None


class ScheduleService:
    """§5.6's session materialization and everything that feeds it.

    **The invariant every method here inherits**, from §5.6 and E2E-5: changing a rule
    rewrites only future sessions. A session in the past, a session carrying
    `is_manually_edited`, and an ad-hoc session are never overwritten. That rule lives with
    the writer — in `app/services/schedule/impact.py::plan_change` — rather than with the
    callers, which is why M3 reads through this class rather than querying `session` itself.
    """

    def __init__(self, session: OrmSession) -> None:
        self.session = session

    # -- training years -------------------------------------------------------
    def list_training_years(
        self, *, cursor: uuid.UUID | None = None, limit: int = 50
    ) -> tuple[list[TrainingYear], uuid.UUID | None]:
        stmt = _paged(select(TrainingYear).order_by(TrainingYear.id), cursor=cursor, limit=limit)
        return _page_out(list(self.session.execute(stmt).scalars().all()), limit)

    def create_training_year(
        self, *, name: str, starts_on: date, ends_on: date, at: datetime
    ) -> TrainingYear:
        """§5.15 step 1. Always `draft`: the wizard is resumable and nothing is visible to
        guardians until it is activated."""
        clash = self.session.execute(
            select(TrainingYear.id).where(TrainingYear.name == name)
        ).first()
        if clash is not None:
            # Checked rather than caught: the unique index would raise an IntegrityError
            # that reads as a 500, and this is a name the manager typed.
            raise ConflictError(name)
        row = TrainingYear(
            name=name, starts_on=starts_on, ends_on=ends_on, status="draft", created_at=at
        )
        self.session.add(row)
        self.session.flush()
        return row

    def get_training_year(self, training_year_id: uuid.UUID) -> TrainingYear:
        row = self.session.get(TrainingYear, training_year_id)
        if row is None:
            raise NotFoundError(str(training_year_id))
        return row

    def active_training_year(self) -> TrainingYear:
        """The one year sessions are generated into.

        `uq_training_year_one_active` makes "the active year" a single row rather than a
        convention, which is what lets every other method take it without a parameter.
        """
        row = self.session.execute(
            select(TrainingYear).where(TrainingYear.status == "active")
        ).scalars().first()
        if row is None:
            raise NotFoundError("no active training year")
        return row

    # -- closures -------------------------------------------------------------
    def list_closures(
        self,
        *,
        training_year_id: uuid.UUID | None = None,
        cursor: uuid.UUID | None = None,
        limit: int = 50,
    ) -> tuple[list[StudioClosure], uuid.UUID | None]:
        stmt = select(StudioClosure).order_by(StudioClosure.id)
        if training_year_id is not None:
            stmt = stmt.where(StudioClosure.training_year_id == training_year_id)
        rows = self.session.execute(_paged(stmt, cursor=cursor, limit=limit)).scalars().all()
        return _page_out(list(rows), limit)

    def closure_specs(self, training_year_id: uuid.UUID) -> list[ClosureSpec]:
        rows = self.session.execute(
            select(StudioClosure).where(StudioClosure.training_year_id == training_year_id)
        ).scalars().all()
        return [ClosureSpec(date_from=r.date_from, date_to=r.date_to) for r in rows]

    def create_closure(
        self,
        *,
        training_year_id: uuid.UUID,
        date_from: date,
        date_to: date,
        reason: str,
        source: str,
        at: datetime,
    ) -> tuple[StudioClosure, int]:
        """§5.6 — 'Manual closure ranges can be added at any time; adding one cancels the
        affected sessions and notifies the affected guardians.'

        Cancels, rather than deletes: families already have these lessons in their
        calendars, and a row that disappears without a trace is how a child turns up to a
        locked door. The notification is §5.11's and arrives in W5.

        **Only future sessions are cancelled**, for the same reason a rule change only
        rewrites future ones: a lesson that already happened, happened, whatever the
        calendar now says about that date.
        """
        year = self.get_training_year(training_year_id)
        row = StudioClosure(
            training_year_id=year.id,
            date_from=date_from,
            date_to=date_to,
            reason=reason,
            source=source,
            created_at=at,
        )
        self.session.add(row)

        affected = self.session.execute(
            select(Session).where(
                Session.training_year_id == year.id,
                Session.starts_at > at,
                Session.status == "scheduled",
            )
        ).scalars().all()
        cancelled = 0
        for session_row in affected:
            if date_from <= jerusalem_date(session_row.starts_at) <= date_to:
                session_row.status = "cancelled"
                session_row.cancel_reason = SYSTEM_CANCEL_CLOSURE
                cancelled += 1

        self.session.flush()
        return row, cancelled
```

- [ ] **Step 6: Re-export the service so the seam import keeps working**

Replace the final class in `app/services/schedule/__init__.py` with a re-export. Keep the
module docstring exactly as it is — it is the contract commit's reasoning — and append:

```python
from app.services.schedule.service import ConflictError, NotFoundError, ScheduleService

__all__ = ["ConflictError", "NotFoundError", "ScheduleService"]
```

Delete the placeholder `class ScheduleService` and its `materialize_sessions` stub from
`__init__.py`; `tests/contracts/test_seams.py` resolves `app.services.schedule.ScheduleService`
through this re-export and its two signature tests keep passing unchanged. Remove the now
unused `import uuid`, `from datetime import date` and `from app.models.schedule import Session`
lines from `__init__.py`.

- [ ] **Step 7: Write the router**

Create `app/routers/schedule.py`:

```python
"""SPEC §7's schedule endpoints — `/training-years`, `/closures`, `/holiday-presets`,
`/groups/{id}/schedule`.

Every route takes `TenantSessionDep`, which fails closed: a request with no resolved studio
is a 401, never an unscoped session. That is why nothing here passes a `studio_id` around,
and why a cross-studio reference comes back 404 rather than 403.

Reads reach every staff role — a roster is unreadable without the schedule it hangs off.
Writes are owner and manager only (§3.2, 'Create/edit classes, groups, schedules').

**Not tagged `coach`.** `/sessions` is the coach-facing surface and lives in
`app/routers/sessions.py`; these are the manager's setup screens, and tagging them would
claim a §13 invariant-3 guarantee about routes a coach never calls.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, status

from app.core.auth_context import AnyStaff, ManagerOrOwner
from app.core.clock import now
from app.core.tenancy import TenantSessionDep
from app.schemas._pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, IdempotencyKey
from app.schemas.schedule import (
    ClosureCreate,
    ClosureCreatedOut,
    ClosureOut,
    ClosurePage,
    HolidayPresetOut,
    TrainingYearCreate,
    TrainingYearOut,
    TrainingYearPage,
)
from app.services.schedule.holidays import presets_for_year
from app.services.schedule.service import ConflictError, NotFoundError, ScheduleService

router = APIRouter(tags=["schedule"])


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": "no such record"},
    )


def _conflict(message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": "conflict", "message": message},
    )


# -- training years -----------------------------------------------------------
@router.get("/training-years", response_model=TrainingYearPage)
def list_training_years(
    _: AnyStaff,
    session: TenantSessionDep,
    cursor: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> TrainingYearPage:
    rows, next_cursor = ScheduleService(session).list_training_years(cursor=cursor, limit=limit)
    return TrainingYearPage(
        items=[TrainingYearOut.model_validate(r, from_attributes=True) for r in rows],
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


@router.post(
    "/training-years", response_model=TrainingYearOut, status_code=status.HTTP_201_CREATED
)
def create_training_year(
    _: ManagerOrOwner,
    body: TrainingYearCreate,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> TrainingYearOut:
    try:
        row = ScheduleService(session).create_training_year(
            name=body.name, starts_on=body.starts_on, ends_on=body.ends_on, at=now()
        )
    except ConflictError as exc:
        raise _conflict(f"{body.name!r} already exists here") from exc
    session.commit()
    return TrainingYearOut.model_validate(row, from_attributes=True)


# -- closures -----------------------------------------------------------------
@router.get("/closures", response_model=ClosurePage)
def list_closures(
    _: AnyStaff,
    session: TenantSessionDep,
    training_year_id: uuid.UUID | None = None,
    cursor: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> ClosurePage:
    rows, next_cursor = ScheduleService(session).list_closures(
        training_year_id=training_year_id, cursor=cursor, limit=limit
    )
    return ClosurePage(
        items=[ClosureOut.model_validate(r, from_attributes=True) for r in rows],
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


@router.post("/closures", response_model=ClosureCreatedOut, status_code=status.HTTP_201_CREATED)
def create_closure(
    _: ManagerOrOwner,
    body: ClosureCreate,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> ClosureCreatedOut:
    try:
        row, cancelled = ScheduleService(session).create_closure(
            training_year_id=body.training_year_id,
            date_from=body.date_from,
            date_to=body.date_to,
            reason=body.reason,
            source=body.source,
            at=now(),
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return ClosureCreatedOut(
        id=row.id,
        training_year_id=row.training_year_id,
        date_from=row.date_from,
        date_to=row.date_to,
        reason=row.reason,
        source=row.source,
        sessions_cancelled=cancelled,
    )


# -- holiday presets ----------------------------------------------------------
@router.get("/holiday-presets", response_model=list[HolidayPresetOut])
def list_holiday_presets(
    _: AnyStaff,
    year: int = Query(ge=2000, le=2100),
) -> list[HolidayPresetOut]:
    """§5.6 — **proposals the manager ticks, never automatic closures.**

    No session dependency, deliberately: this route reads nothing and writes nothing, and
    a database handle it did not need would be a database handle a later edit could use.
    A Gregorian year always straddles two Hebrew ones, which is why 2026 answers with both
    Pesach of 5786 and Rosh Hashanah of 5787.
    """
    return [
        HolidayPresetOut(
            key=p.key, name=p.name, date_from=p.date_from, date_to=p.date_to
        )
        for p in presets_for_year(year)
    ]
```

- [ ] **Step 8: Run the test and confirm it passes**

```bash
.venv/bin/pytest tests/schedule/test_years_and_closures.py -q
```
Expected: PASS, 10 tests.

- [ ] **Step 9: Confirm the seam's signature tests survived the move**

```bash
.venv/bin/pytest tests/contracts/test_seams.py -q
```
Expected: the two `materialize_sessions` signature tests PASS; the third
(`..._refuses_rather_than_returning_nothing`) still passes here because Task 5 has not
implemented the body yet.

- [ ] **Step 10: Typecheck, lint, commit**

```bash
.venv/bin/mypy app/services/schedule app/routers/schedule.py app/schemas/schedule.py
.venv/bin/ruff check app/services/schedule app/routers/schedule.py app/schemas/schedule.py
.venv/bin/ruff format app/services/schedule app/routers/schedule.py app/schemas/schedule.py tests/schedule
git add app/services/schedule app/routers/schedule.py app/schemas/schedule.py tests/schedule
git commit -m "feat(schedule): training years, closures, and holiday presets as proposals"
```

---

### Task 5: `materialize_sessions` — the cross-lane seam

W2's contract: `ScheduleService.materialize_sessions(group_id, from_date, to_date) -> list[Session]`.
M3's trial-slot picker is a pure reader through it and M5 hangs attendance off what it
produces. This is the one method in the lane another lane calls.

**Files:**
- Modify: `app/services/schedule/service.py`
- Modify: `app/routers/schedule.py` (add `generate-sessions` and `activate`)
- Modify: `tests/contracts/test_seams.py` — **exactly one test function** (sanctioned exception 1)
- Test: `tests/schedule/test_materialization.py`

**Interfaces:**
- Consumes: Tasks 2 and 4.
- Produces:
  - `ScheduleService.materialize_sessions(self, group_id: uuid.UUID, from_date: date, to_date: date) -> list[Session]`
  - `ScheduleService.rule_specs(self, group_id: uuid.UUID) -> list[RuleSpec]`
  - `ScheduleService.activate_training_year(self, training_year_id: uuid.UUID, *, at: datetime) -> TrainingYear`
  - `ScheduleService.generate_sessions_for_year(self, training_year_id: uuid.UUID, *, at: datetime) -> tuple[int, int]` (groups, sessions created)
  - Router paths `POST /training-years/{id}/generate-sessions`, `POST /training-years/{id}/activate`

- [ ] **Step 1: Write the failing test**

`tests/schedule/test_materialization.py`:

```python
"""§5.6's materialization: 'When a group's schedule is set, sessions are generated as real
rows for the **entire training year**, skipping dates covered by `studio_closure`.'

**Materialized, not projected**, and the seam's docstring says why: a caller may hold the
ids. M3's trial booking attaches a `trial_booking.session_id` to one of these rows, so a
computed slot that vanished on the next request would be a booking pointing at nothing.

Generation covers the whole requested range, past dates included. §5.6's "only the future"
rule is about **rewriting** a schedule, not about generating one — a club activating a year
in November still wants September in the calendar.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time

import pytest
from app.core.tenancy import TenantSession, use_studio
from app.core.db import get_engine
from app.models.schedule import GroupScheduleRule, Session, StudioClosure
from app.services.schedule import ScheduleService
from sqlalchemy import select
from tests.schedule.conftest import T0, YEAR_ENDS, YEAR_STARTS

SUNDAY = 0
TUESDAY = 2


@pytest.fixture
def tenant_session(migrated, studio):
    """A `TenantSession` scoped to the fixture studio. The service is written against one,
    so a plain `Session` would bypass the filter the service is relying on."""
    with use_studio(studio.id), TenantSession(bind=get_engine(), expire_on_commit=False) as s:
        yield s


def add_rule(session, studio, group_id, *, weekday, start=time(17, 0), end=time(19, 0), location=None):
    row = GroupScheduleRule(
        studio_id=studio.id,
        group_id=group_id,
        weekday=weekday,
        start_time=start,
        end_time=end,
        location_id=location,
        effective_from=YEAR_STARTS,
    )
    session.add(row)
    session.flush()
    return row


def test_a_whole_training_year_is_materialized_as_real_rows(
    tenant_session, studio, a_group, an_active_year
):
    add_rule(tenant_session, studio, a_group, weekday=SUNDAY)
    created = ScheduleService(tenant_session).materialize_sessions(
        a_group, YEAR_STARTS, YEAR_ENDS
    )
    tenant_session.commit()

    persisted = tenant_session.execute(
        select(Session).where(Session.group_id == a_group)
    ).scalars().all()
    assert len(persisted) == len(created) > 40
    assert all(s.id is not None for s in created)
    assert all(s.training_year_id == an_active_year for s in created)


def test_every_session_lands_on_the_rules_weekday_at_the_rules_wall_clock_time(
    tenant_session, studio, a_group, an_active_year
):
    add_rule(tenant_session, studio, a_group, weekday=TUESDAY, start=time(17, 0), end=time(19, 0))
    created = ScheduleService(tenant_session).materialize_sessions(
        a_group, date(2026, 10, 19), date(2026, 11, 4)
    )
    moments = {s.starts_at for s in created}
    # Either side of the 25 October DST switch: 17:00 local both times, an hour apart in UTC.
    assert datetime(2026, 10, 20, 14, 0, tzinfo=UTC) in moments
    assert datetime(2026, 11, 3, 15, 0, tzinfo=UTC) in moments


def test_a_closure_produces_no_session_at_all(
    tenant_session, studio, a_group, an_active_year
):
    add_rule(tenant_session, studio, a_group, weekday=SUNDAY)
    tenant_session.add(
        StudioClosure(
            studio_id=studio.id,
            training_year_id=an_active_year,
            date_from=date(2026, 9, 13),
            date_to=date(2026, 9, 20),
            reason="סוכות",
            source="holiday_preset",
        )
    )
    tenant_session.flush()

    created = ScheduleService(tenant_session).materialize_sessions(
        a_group, date(2026, 9, 6), date(2026, 9, 27)
    )
    assert [s.starts_at.date() for s in created] == [date(2026, 9, 6), date(2026, 9, 27)]
    assert all(s.status == "scheduled" for s in created)


def test_running_it_twice_creates_nothing_the_second_time(
    tenant_session, studio, a_group, an_active_year
):
    """`POST /training-years/{id}/generate-sessions` is a button a manager can press
    twice, and G16 makes every mutating endpoint safe to replay."""
    add_rule(tenant_session, studio, a_group, weekday=SUNDAY)
    service = ScheduleService(tenant_session)
    first = service.materialize_sessions(a_group, YEAR_STARTS, YEAR_ENDS)
    tenant_session.flush()
    second = service.materialize_sessions(a_group, YEAR_STARTS, YEAR_ENDS)

    assert [s.id for s in first] == [s.id for s in second]


def test_the_result_is_ordered_by_start_and_scoped_to_the_range(
    tenant_session, studio, a_group, an_active_year
):
    add_rule(tenant_session, studio, a_group, weekday=SUNDAY)
    add_rule(tenant_session, studio, a_group, weekday=TUESDAY, start=time(18, 0), end=time(20, 0))
    created = ScheduleService(tenant_session).materialize_sessions(
        a_group, date(2026, 9, 6), date(2026, 9, 15)
    )
    assert [s.starts_at for s in created] == sorted(s.starts_at for s in created)
    assert all(date(2026, 9, 6) <= s.starts_at.date() <= date(2026, 9, 16) for s in created)


def test_it_returns_ad_hoc_and_cancelled_sessions_in_the_range_too(
    tenant_session, studio, a_group, an_active_year
):
    """The seam's contract is 'every session for `group_id` in the range', not 'every
    session a rule produced'. M3's picker filters on `is_bookable` itself; a reader that
    could not see a cancelled lesson would offer a trial slot on a closed day."""
    tenant_session.add(
        Session(
            studio_id=studio.id,
            group_id=a_group,
            training_year_id=an_active_year,
            starts_at=datetime(2026, 9, 9, 14, 0, tzinfo=UTC),
            ends_at=datetime(2026, 9, 9, 16, 0, tzinfo=UTC),
            status="scheduled",
            is_ad_hoc=True,
        )
    )
    tenant_session.flush()
    created = ScheduleService(tenant_session).materialize_sessions(
        a_group, date(2026, 9, 6), date(2026, 9, 13)
    )
    assert any(s.is_ad_hoc for s in created)


def test_a_group_in_another_studio_is_invisible_rather_than_forbidden(
    tenant_session, studio, an_active_year
):
    from app.services.schedule.service import NotFoundError

    with pytest.raises(NotFoundError):
        ScheduleService(tenant_session).materialize_sessions(
            uuid.uuid4(), YEAR_STARTS, YEAR_ENDS
        )


def test_a_group_with_no_rules_materializes_nothing_rather_than_raising(
    tenant_session, studio, a_group, an_active_year
):
    assert ScheduleService(tenant_session).materialize_sessions(
        a_group, YEAR_STARTS, YEAR_ENDS
    ) == []


def test_activating_a_year_closes_the_one_that_was_active(
    tenant_session, studio, an_active_year
):
    """`uq_training_year_one_active` is a partial unique index, so 'activate' has to close
    the incumbent in the same transaction or the insert fails at the database."""
    from app.models.schedule import TrainingYear

    draft = TrainingYear(
        studio_id=studio.id,
        name="תשפ״ח",
        starts_on=date(2027, 9, 1),
        ends_on=date(2028, 6, 30),
        status="draft",
    )
    tenant_session.add(draft)
    tenant_session.flush()

    ScheduleService(tenant_session).activate_training_year(draft.id, at=T0)
    tenant_session.flush()

    assert tenant_session.get(TrainingYear, draft.id).status == "active"
    assert tenant_session.get(TrainingYear, an_active_year).status == "closed"


def test_generate_for_a_year_covers_every_active_group(
    tenant_session, studio, a_group, an_active_year, app_session
):
    from app.models.structure import Group

    second = Group(
        studio_id=studio.id,
        class_id=tenant_session.get(Group, a_group).class_id,
        name="מתקדמים",
    )
    tenant_session.add(second)
    tenant_session.flush()
    add_rule(tenant_session, studio, a_group, weekday=SUNDAY)
    add_rule(tenant_session, studio, second.id, weekday=TUESDAY)

    groups, created = ScheduleService(tenant_session).generate_sessions_for_year(
        an_active_year, at=T0
    )
    assert groups == 2
    assert created > 80
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
.venv/bin/pytest tests/schedule/test_materialization.py -q
```
Expected: every test fails with `NotImplementedError: M2 — lane SCHEDULE owns app/services/schedule/**`
or `AttributeError` for the two new methods.

- [ ] **Step 3: Implement the seam**

Append to `app/services/schedule/service.py`, and add the imports it needs
(`GroupScheduleRule`, `Group`, `RuleSpec`, `expand_rules`, `Occurrence`) to the import block:

```python
    # -- rules ----------------------------------------------------------------
    def rule_specs(self, group_id: uuid.UUID) -> list[RuleSpec]:
        """Every rule row for a group, live and superseded alike.

        `expand_rules` honours `effective_from`/`effective_to` per date, so handing it the
        full history is what makes "the schedule as it was in October" answerable from the
        same code path as "the schedule now". Filtering here would throw that away.
        """
        rows = self.session.execute(
            select(GroupScheduleRule).where(GroupScheduleRule.group_id == group_id)
        ).scalars().all()
        return [
            RuleSpec(
                weekday=r.weekday,
                start_time=r.start_time,
                end_time=r.end_time,
                location_id=r.location_id,
                effective_from=r.effective_from,
                effective_to=r.effective_to,
                rule_id=r.id,
            )
            for r in rows
        ]

    def _require_group(self, group_id: uuid.UUID) -> Group:
        row = self.session.get(Group, group_id)
        if row is None:
            raise NotFoundError(str(group_id))
        return row

    def _year_covering(self, day: date, years: list[TrainingYear]) -> TrainingYear | None:
        for year in years:
            if year.starts_on <= day <= year.ends_on:
                return year
        return None

    def sessions_between(
        self, group_id: uuid.UUID, from_date: date, to_date: date
    ) -> list[Session]:
        """The group's sessions whose **Jerusalem** day falls in the range, in start order.

        The window is widened by a day at each end before the database sees it and narrowed
        in Python afterwards: a 20:00 Jerusalem class on the last day of the range is 17:00Z
        or 18:00Z the same day, but a 00:30 one would be the previous day in UTC, and a
        naive `starts_at >= from_date` would drop it.
        """
        lower = datetime.combine(from_date - timedelta(days=1), datetime.min.time(), tzinfo=UTC)
        upper = datetime.combine(to_date + timedelta(days=2), datetime.min.time(), tzinfo=UTC)
        rows = self.session.execute(
            select(Session)
            .where(
                Session.group_id == group_id,
                Session.starts_at >= lower,
                Session.starts_at < upper,
            )
            .order_by(Session.starts_at)
        ).scalars().all()
        return [r for r in rows if from_date <= jerusalem_date(r.starts_at) <= to_date]

    # -- the seam -------------------------------------------------------------
    def materialize_sessions(
        self,
        group_id: uuid.UUID,
        from_date: date,
        to_date: date,
    ) -> list[Session]:
        """Every session for `group_id` in `[from_date, to_date]`, in start order.

        Materialized, not projected: the rows exist in `session` before this returns, so a
        caller may hold their ids. M3's `trial_booking.session_id` points at one of them,
        and a computed slot would be a booking pointing at nothing.

        Closures (§5.6) are skipped — a date the studio is closed produces no session, which
        is why a parent's month view shows a gap there rather than a cancelled row.

        **Idempotent.** A session already sitting at the wanted instant is kept, not
        duplicated: `POST /training-years/{id}/generate-sessions` is a button a manager can
        press twice, and pressing it twice must not double a year.

        **This does not rewrite anything.** It creates what is missing. Moving an existing
        session is `apply_schedule_change`'s job, and keeping the two apart is what makes
        "only the future is rewritten" a property of one function rather than a habit.
        """
        self._require_group(group_id)
        years = list(self.session.execute(select(TrainingYear)).scalars().all())
        closures = [
            spec for year in years for spec in self.closure_specs(year.id)
        ]
        occurrences = expand_rules(self.rule_specs(group_id), from_date, to_date, closures)

        existing = self.sessions_between(group_id, from_date, to_date)
        taken = {row.starts_at for row in existing}

        for occurrence in occurrences:
            if occurrence.starts_at in taken:
                continue
            year = self._year_covering(occurrence.on_date, years)
            if year is None:
                # `session.training_year_id` is non-null, so a date outside every declared
                # year cannot become a row. Silently skipped rather than raised: a rule
                # that runs past the end of the year is ordinary, not an error.
                continue
            self.session.add(
                Session(
                    group_id=group_id,
                    training_year_id=year.id,
                    starts_at=occurrence.starts_at,
                    ends_at=occurrence.ends_at,
                    location_id=occurrence.location_id,
                    status="scheduled",
                    is_manually_edited=False,
                    generated_from_rule_id=occurrence.rule_id,
                    is_ad_hoc=False,
                )
            )
            taken.add(occurrence.starts_at)

        self.session.flush()
        return self.sessions_between(group_id, from_date, to_date)

    # -- §5.15's wizard steps 1 and 6 -----------------------------------------
    def activate_training_year(
        self, training_year_id: uuid.UUID, *, at: datetime
    ) -> TrainingYear:
        """§5.15 — 'nothing is visible to guardians until it is activated'.

        The incumbent is closed in the same transaction. `uq_training_year_one_active` is a
        partial unique index, so doing it in two steps would fail at the database with a
        constraint name rather than a sentence.
        """
        year = self.get_training_year(training_year_id)
        if year.status == "closed":
            raise ConflictError("a closed year cannot be reactivated")
        for other in self.session.execute(
            select(TrainingYear).where(TrainingYear.status == "active")
        ).scalars().all():
            if other.id != year.id:
                other.status = "closed"
        self.session.flush()
        year.status = "active"
        year.updated_at = at
        self.session.flush()
        return year

    def generate_sessions_for_year(
        self, training_year_id: uuid.UUID, *, at: datetime
    ) -> tuple[int, int]:
        """§5.15 step 6 — 'materialize every session for the year, skipping closures, and
        show a summary of what was created'. Returns (groups, sessions created).

        Every **active** group: a retired one (§5.15 step 3) keeps its history and gains no
        future.
        """
        year = self.get_training_year(training_year_id)
        groups = list(
            self.session.execute(select(Group).where(Group.is_active.is_(True)))
            .scalars()
            .all()
        )
        created = 0
        for group in groups:
            before = len(self.sessions_between(group.id, year.starts_on, year.ends_on))
            after = len(self.materialize_sessions(group.id, year.starts_on, year.ends_on))
            created += after - before
        return len(groups), created
```

- [ ] **Step 4: Add the two routes**

Append to `app/routers/schedule.py`:

```python
@router.post("/training-years/{training_year_id}/activate", response_model=TrainingYearOut)
def activate_training_year(
    _: ManagerOrOwner,
    training_year_id: uuid.UUID,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> TrainingYearOut:
    try:
        row = ScheduleService(session).activate_training_year(training_year_id, at=now())
    except NotFoundError as exc:
        raise _not_found() from exc
    except ConflictError as exc:
        raise _conflict(str(exc)) from exc
    session.commit()
    return TrainingYearOut.model_validate(row, from_attributes=True)


@router.post(
    "/training-years/{training_year_id}/generate-sessions", response_model=GenerateSessionsOut
)
def generate_sessions(
    _: ManagerOrOwner,
    training_year_id: uuid.UUID,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> GenerateSessionsOut:
    """§5.15 step 6. Safe to press twice — `materialize_sessions` keeps a session already
    sitting at the wanted instant rather than adding a second one."""
    try:
        groups, created = ScheduleService(session).generate_sessions_for_year(
            training_year_id, at=now()
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return GenerateSessionsOut(
        training_year_id=training_year_id, groups=groups, sessions_created=created
    )
```

Add `GenerateSessionsOut` to the router's import block from `app.schemas.schedule`.

- [ ] **Step 5: Replace the one seam test that is now false**

In `tests/contracts/test_seams.py`, replace
`test_materialize_sessions_refuses_rather_than_returning_nothing` — and **only** that
function; the two signature tests above it are untouched — with:

```python
def test_materialize_sessions_is_implemented_and_no_longer_a_stub():
    """W2 lane SCHEDULE (M2) filled this in.

    The stub this replaces asserted `NotImplementedError`, and it was right to: a seam that
    returned `[]` would have let M3 pass its own tests against a lie and ship a permanently
    empty trial-slot picker. Now that a body exists, the useful assertion is that the body
    exists — `tests/schedule/test_materialization.py` owns the behaviour, and duplicating it
    here would give two files an opinion about one rule.
    """
    assert ScheduleService.materialize_sessions.__doc__ is not None
    source = inspect.getsource(ScheduleService.materialize_sessions)
    assert "NotImplementedError" not in source
```

- [ ] **Step 6: Run both suites and confirm they pass**

```bash
.venv/bin/pytest tests/schedule/test_materialization.py tests/contracts/test_seams.py -q
```
Expected: PASS. Show the output.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
.venv/bin/mypy app/services/schedule app/routers/schedule.py
.venv/bin/ruff check app/services/schedule app/routers/schedule.py
.venv/bin/ruff format app/services/schedule app/routers/schedule.py tests/schedule tests/contracts/test_seams.py
git add app/services/schedule app/routers/schedule.py tests/schedule tests/contracts/test_seams.py
git commit -m "feat(schedule): materialize a training year's sessions — W2's cross-lane seam"
```

---

### Task 6: `PUT /groups/{id}/schedule` — the impact preview, and the invariant

**The task this lane exists for.** §7: "PUT returns an impact preview before applying."
§5.6: the change rewrites only future sessions and shows exactly what will happen first.

**Files:**
- Modify: `app/services/schedule/service.py`
- Modify: `app/routers/schedule.py`
- Test: `tests/schedule/test_schedule_change.py`

**Interfaces:**
- Consumes: Tasks 2, 3, 5.
- Produces:
  - `ScheduleService.live_rules(self, group_id, *, on: date) -> list[GroupScheduleRule]`
  - `ScheduleService.preview_schedule_change(self, group_id, *, rules: list[ScheduleRuleIn], effective_from: date, at: datetime) -> ScheduleImpactPreview`
  - `ScheduleService.apply_schedule_change(self, group_id, *, rules, effective_from, at, actor_person_id, actor_identity_id) -> ScheduleImpactPreview`
  - Router paths `GET /groups/{group_id}/schedule`, `PUT /groups/{group_id}/schedule`

- [ ] **Step 1: Write the failing test**

`tests/schedule/test_schedule_change.py`:

```python
"""**The invariant this lane exists to protect.**

§5.6, verbatim: "Changing a schedule rule rewrites only sessions with `starts_at > now()`.
Two categories are protected and never overwritten: sessions in the past — historical
attendance keeps its true times — and sessions with `is_manually_edited = true`." E2E-5 is
this file, driven through a browser.

Every test below is written against the API rather than the service, because the guarantee
a manager relies on is the one the endpoint makes. A service-level test would still pass if
the router forgot to pass `apply` through, and the default for `apply` is the entire
difference between a preview and a rewritten year.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
from app.models.people import Enrollment, Student
from app.models.schedule import Session
from sqlalchemy import select
from tests.schedule.conftest import T0

API = "/api/v1"
SUNDAY, TUESDAY, WEDNESDAY = 0, 2, 3


def rule(weekday: int, start: str = "17:00:00", end: str = "19:00:00") -> dict:
    return {
        "weekday": weekday,
        "start_time": start,
        "end_time": end,
        "location_id": None,
        "effective_from": "2026-09-01",
    }


def put(client, caller, group_id, rules, *, apply: bool, effective_from="2026-09-01"):
    return client.put(
        f"{API}/groups/{group_id}/schedule",
        headers=caller.headers,
        json={"rules": rules, "effective_from": effective_from, "apply": apply},
    )


@pytest.fixture
def a_scheduled_group(client, as_manager, a_group, an_active_year):
    """A group with a Tuesday rule and a materialized year — the state every test below
    starts from. A change tested against a clean group proves nothing, because there is
    nothing to protect."""
    assert put(client, as_manager, a_group, [rule(TUESDAY)], apply=True).status_code == 200
    client.post(
        f"{API}/training-years/{an_active_year}/generate-sessions", headers=as_manager.headers
    )
    return a_group


# -- preview is a preview -----------------------------------------------------
def starts(app_session, group_id) -> list:
    """Every session's start instant, straight from the table. Read here rather than
    through `GET /sessions` so this file tests the change and not Task 7's reader."""
    app_session.expire_all()
    return [
        row.starts_at
        for row in app_session.execute(
            select(Session).where(Session.group_id == group_id).order_by(Session.starts_at)
        ).scalars().all()
    ]


def test_apply_defaults_to_false_so_a_forgotten_field_previews_rather_than_rewrites(
    client, as_manager, a_scheduled_group, app_session
):
    before = starts(app_session, a_scheduled_group)
    assert before, "the fixture must have materialized a year"

    response = client.put(
        f"{API}/groups/{a_scheduled_group}/schedule",
        headers=as_manager.headers,
        json={"rules": [rule(WEDNESDAY)], "effective_from": "2026-09-01"},
    )
    assert response.status_code == 200
    assert response.json()["sessions_to_cancel"] > 0

    assert starts(app_session, a_scheduled_group) == before


def test_the_preview_names_the_three_protections_separately(
    client, as_manager, a_scheduled_group
):
    """'12 sessions will change' tells a manager nothing about whether last month survived."""
    body = put(client, as_manager, a_scheduled_group, [rule(TUESDAY, "18:00:00", "20:00:00")], apply=False).json()
    assert {
        "sessions_to_create",
        "sessions_to_update",
        "sessions_to_cancel",
        "sessions_protected_past",
        "sessions_protected_manually_edited",
        "sessions_protected_ad_hoc",
        "first_affected_date",
        "protected_manually_edited_sessions",
        "students_left_unscheduled",
    } <= set(body)


# -- the invariant ------------------------------------------------------------
def test_a_past_session_keeps_its_time_after_the_change(
    client, as_manager, a_scheduled_group, app_session
):
    held = app_session.execute(
        select(Session)
        .where(Session.group_id == a_scheduled_group, Session.starts_at < T0)
        .order_by(Session.starts_at)
    ).scalars().first()
    assert held is not None, "the fixture must produce sessions before T0"
    was = held.starts_at

    body = put(client, as_manager, a_scheduled_group, [rule(TUESDAY, "18:00:00", "20:00:00")], apply=True).json()
    assert body["sessions_protected_past"] > 0

    app_session.expire_all()
    assert app_session.get(Session, held.id).starts_at == was


def test_a_manually_edited_future_session_keeps_its_time_and_is_listed_first(
    client, as_manager, a_scheduled_group, app_session
):
    """§5.6 prints them as bullets. A manager who cannot see WHICH two were protected
    cannot tell whether the one they care about is among them."""
    future = app_session.execute(
        select(Session)
        .where(Session.group_id == a_scheduled_group, Session.starts_at > T0)
        .order_by(Session.starts_at)
    ).scalars().first()

    # Written directly rather than through PATCH /sessions/{id} (Task 7). This test is
    # about what a schedule change does to an edited session, not about how it came to be
    # edited, and routing it through a second endpoint would make it fail for two reasons.
    future.is_manually_edited = True
    future.starts_at = datetime(2026, 11, 17, 18, 30, tzinfo=UTC)
    future.ends_at = datetime(2026, 11, 17, 20, 30, tzinfo=UTC)
    app_session.commit()

    body = put(client, as_manager, a_scheduled_group, [rule(TUESDAY, "18:00:00", "20:00:00")], apply=True).json()
    assert body["sessions_protected_manually_edited"] >= 1
    assert str(future.id) in [p["id"] for p in body["protected_manually_edited_sessions"]]

    app_session.expire_all()
    assert app_session.get(Session, future.id).starts_at == datetime(
        2026, 11, 17, 18, 30, tzinfo=UTC
    )
    assert app_session.get(Session, future.id).is_manually_edited is True


def test_an_ad_hoc_session_survives_a_rule_that_no_longer_covers_its_day(
    client, as_manager, a_scheduled_group, an_active_year, app_session, studio
):
    # Inserted directly, for the same reason the manually-edited test does: POST /sessions
    # is Task 7's, and this test is about what a rule change does to an ad-hoc session.
    one_off = Session(
        studio_id=studio.id,
        group_id=a_scheduled_group,
        training_year_id=an_active_year,
        starts_at=datetime(2026, 12, 11, 10, 0, tzinfo=UTC),
        ends_at=datetime(2026, 12, 11, 12, 0, tzinfo=UTC),
        status="scheduled",
        is_ad_hoc=True,
    )
    app_session.add(one_off)
    app_session.commit()

    body = put(client, as_manager, a_scheduled_group, [rule(WEDNESDAY)], apply=True).json()
    assert body["sessions_protected_ad_hoc"] >= 1

    app_session.expire_all()
    survivor = app_session.get(Session, one_off.id)
    assert survivor.starts_at == datetime(2026, 12, 11, 10, 0, tzinfo=UTC)
    assert survivor.status == "scheduled"


def test_a_future_session_actually_moves(client, as_manager, a_scheduled_group, app_session):
    put(client, as_manager, a_scheduled_group, [rule(TUESDAY, "18:00:00", "20:00:00")], apply=True)

    app_session.expire_all()
    moved = app_session.execute(
        select(Session)
        .where(
            Session.group_id == a_scheduled_group,
            Session.starts_at > T0,
            Session.status == "scheduled",
        )
        .order_by(Session.starts_at)
    ).scalars().first()
    # 18:00 Jerusalem in November is 16:00Z.
    assert moved.starts_at.astimezone(UTC).hour == 16


def test_moving_the_rule_to_another_weekday_cancels_and_creates(
    client, as_manager, a_scheduled_group
):
    body = put(client, as_manager, a_scheduled_group, [rule(WEDNESDAY)], apply=True).json()
    assert body["sessions_to_cancel"] > 0
    assert body["sessions_to_create"] > 0
    assert body["first_affected_date"] is not None


def test_a_cancelled_session_carries_the_machine_reason_not_hebrew(
    client, as_manager, a_scheduled_group, app_session
):
    """D-M2-3 — a cancellation the SERVER generated writes a token the client translates.
    `app/` never grows a second Hebrew string table §9 cannot reach."""
    put(client, as_manager, a_scheduled_group, [rule(WEDNESDAY)], apply=True)
    app_session.expire_all()
    cancelled = app_session.execute(
        select(Session).where(
            Session.group_id == a_scheduled_group, Session.status == "cancelled"
        )
    ).scalars().first()
    assert cancelled.cancel_reason == "system:schedule_change"


def test_the_old_rule_is_closed_rather_than_edited_in_place(
    client, as_manager, a_scheduled_group, app_session
):
    """§4.3 — 'Versioned by date, never edited in place.' A rule rewritten in place has
    already destroyed the 'before' the impact preview exists to show."""
    from app.models.schedule import GroupScheduleRule

    put(
        client, as_manager, a_scheduled_group, [rule(WEDNESDAY)],
        apply=True, effective_from="2026-12-01",
    )
    app_session.expire_all()
    rows = app_session.execute(
        select(GroupScheduleRule).where(GroupScheduleRule.group_id == a_scheduled_group)
    ).scalars().all()

    closed = [r for r in rows if r.effective_to is not None]
    live = [r for r in rows if r.effective_to is None]
    assert [r.weekday for r in closed] == [TUESDAY]
    assert closed[0].effective_to == date(2026, 11, 30)
    assert [r.weekday for r in live] == [WEDNESDAY]


def test_get_returns_only_the_rules_still_in_force(client, as_manager, a_scheduled_group):
    put(client, as_manager, a_scheduled_group, [rule(WEDNESDAY)], apply=True, effective_from="2026-12-01")
    body = client.get(
        f"{API}/groups/{a_scheduled_group}/schedule", headers=as_manager.headers
    ).json()
    assert [r["weekday"] for r in body["rules"]] == [WEDNESDAY]


# -- C12 ----------------------------------------------------------------------
def test_c12_counts_the_students_the_change_leaves_expecting_nothing(
    client, as_manager, a_scheduled_group, app_session, studio
):
    """C12. Moving the rule from Tuesday to Wednesday silently empties the pattern of every
    student who only came on Tuesdays. They drop off the roster and stop being counted
    absent, which looks exactly like the feature working."""
    for index in range(3):
        student = Student(
            studio_id=studio.id, first_name=f"ילד{index}", last_name="טוב", status="active"
        )
        app_session.add(student)
        app_session.flush()
        app_session.add(
            Enrollment(
                studio_id=studio.id,
                student_id=student.id,
                group_id=a_scheduled_group,
                status="active",
                started_on=date(2026, 9, 1),
                attends_weekdays=[TUESDAY],
            )
        )
    app_session.commit()

    body = put(client, as_manager, a_scheduled_group, [rule(WEDNESDAY)], apply=False).json()
    assert body["students_left_unscheduled"] == 3


def test_c12_is_zero_when_the_change_keeps_everyones_day(
    client, as_manager, a_scheduled_group, app_session, studio
):
    student = Student(studio_id=studio.id, first_name="דנה", last_name="טוב", status="active")
    app_session.add(student)
    app_session.flush()
    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=student.id,
            group_id=a_scheduled_group,
            status="active",
            started_on=date(2026, 9, 1),
            attends_weekdays=[TUESDAY],
        )
    )
    app_session.commit()

    body = put(client, as_manager, a_scheduled_group, [rule(TUESDAY, "18:00:00", "20:00:00")], apply=False).json()
    assert body["students_left_unscheduled"] == 0


def test_c12_ignores_a_student_who_has_left_the_group(
    client, as_manager, a_scheduled_group, app_session, studio
):
    """An ended enrollment is not a person the change strands."""
    student = Student(studio_id=studio.id, first_name="עבר", last_name="טוב", status="left")
    app_session.add(student)
    app_session.flush()
    app_session.add(
        Enrollment(
            studio_id=studio.id,
            student_id=student.id,
            group_id=a_scheduled_group,
            status="ended",
            started_on=date(2026, 9, 1),
            ended_on=date(2026, 10, 1),
            attends_weekdays=[TUESDAY],
        )
    )
    app_session.commit()

    body = put(client, as_manager, a_scheduled_group, [rule(WEDNESDAY)], apply=False).json()
    assert body["students_left_unscheduled"] == 0


# -- permissions --------------------------------------------------------------
def test_a_coach_may_read_the_schedule_but_never_change_it(
    client, as_lead_coach, a_scheduled_group
):
    assert client.get(
        f"{API}/groups/{a_scheduled_group}/schedule", headers=as_lead_coach.headers
    ).status_code == 200
    assert put(client, as_lead_coach, a_scheduled_group, [rule(WEDNESDAY)], apply=False).status_code == 403
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
.venv/bin/pytest tests/schedule/test_schedule_change.py -q
```
Expected: 404 on `PUT /groups/{id}/schedule` for every test.

- [ ] **Step 3: Implement the service methods**

Append to `app/services/schedule/service.py`:

```python
    def live_rules(self, group_id: uuid.UUID, *, on: date) -> list[GroupScheduleRule]:
        rows = self.session.execute(
            select(GroupScheduleRule)
            .where(GroupScheduleRule.group_id == group_id)
            .order_by(GroupScheduleRule.weekday, GroupScheduleRule.start_time)
        ).scalars().all()
        return [
            r
            for r in rows
            if r.effective_from <= on and (r.effective_to is None or r.effective_to >= on)
        ]

    def _enrollment_patterns(
        self, group_id: uuid.UUID
    ) -> list[tuple[uuid.UUID, list[int] | None]]:
        """C12's input: one `(student_id, attends_weekdays)` pair per **active** enrollment.

        `app/models/people.py` is lane PEOPLE's file and is read, never written, from here.
        The intersection itself is not reimplemented — `students_left_unscheduled` reads
        through `app/services/people/attendance_pattern.py`, the seam W2's contract commit
        landed so both lanes share one definition of "expected".
        """
        rows = self.session.execute(
            select(Enrollment.student_id, Enrollment.attends_weekdays).where(
                Enrollment.group_id == group_id,
                Enrollment.status == "active",
                Enrollment.ended_on.is_(None),
            )
        ).all()
        return [(student_id, attends) for student_id, attends in rows]

    def _specs_from_input(
        self, rules: Sequence[ScheduleRuleIn], effective_from: date
    ) -> list[RuleSpec]:
        return [
            RuleSpec(
                weekday=r.weekday,
                start_time=r.start_time,
                end_time=r.end_time,
                location_id=r.location_id,
                # The change's date is a floor. A rule may name a later start of its own;
                # it may not quietly back-date the change the manager dated.
                effective_from=max(r.effective_from, effective_from),
                effective_to=None,
                rule_id=None,
            )
            for r in rules
        ]

    def _preview(
        self,
        group_id: uuid.UUID,
        *,
        specs: Sequence[RuleSpec],
        effective_from: date,
        at: datetime,
    ) -> ScheduleImpactPreview:
        year = self.active_training_year()
        window_start = max(effective_from, jerusalem_date(at))
        desired = expand_rules(
            specs, window_start, year.ends_on, self.closure_specs(year.id)
        )
        existing = [
            ExistingSession(
                id=row.id,
                starts_at=row.starts_at,
                ends_at=row.ends_at,
                location_id=row.location_id,
                status=row.status,
                is_manually_edited=row.is_manually_edited,
                is_ad_hoc=row.is_ad_hoc,
            )
            for row in self.sessions_between(group_id, year.starts_on, year.ends_on)
        ]
        plan = plan_change(existing, desired, now=at, effective_from=window_start)
        stranded = students_left_unscheduled(
            self._enrollment_patterns(group_id), rule_weekdays(specs, window_start)
        )
        return ScheduleImpactPreview(
            sessions_to_create=len(plan.to_create),
            sessions_to_update=len(plan.to_update),
            sessions_to_cancel=len(plan.to_cancel),
            sessions_protected_past=len(plan.protected_past),
            sessions_protected_manually_edited=len(plan.protected_manually_edited),
            sessions_protected_ad_hoc=len(plan.protected_ad_hoc),
            first_affected_date=plan.first_affected_date,
            protected_manually_edited_sessions=[
                ProtectedSessionOut(id=p.id, starts_at=p.starts_at, ends_at=p.ends_at)
                for p in plan.protected_manually_edited
            ],
            students_left_unscheduled=stranded,
        ), plan

    def preview_schedule_change(
        self,
        group_id: uuid.UUID,
        *,
        rules: Sequence[ScheduleRuleIn],
        effective_from: date,
        at: datetime,
    ) -> ScheduleImpactPreview:
        """§5.6's dialog. **Writes nothing** — that is the entire contract."""
        self._require_group(group_id)
        preview, _ = self._preview(
            group_id,
            specs=self._specs_from_input(rules, effective_from),
            effective_from=effective_from,
            at=at,
        )
        return preview

    def apply_schedule_change(
        self,
        group_id: uuid.UUID,
        *,
        rules: Sequence[ScheduleRuleIn],
        effective_from: date,
        at: datetime,
        actor_person_id: uuid.UUID | None = None,
        actor_identity_id: uuid.UUID | None = None,
    ) -> ScheduleImpactPreview:
        """Close the old rules, open the new ones, rewrite **only** the future.

        The rules are inserted first and the plan recomputed against the saved rows, rather
        than the created sessions being stamped from a map built by hand. Nothing about the
        plan changes — the same dates, the same times — except that each occurrence now
        carries the `rule_id` it came from, which is what makes a session traceable back to
        the rule that produced it. Building that mapping by matching on (weekday, time,
        location) would be the same answer reached by a route that can go wrong.
        """
        group = self._require_group(group_id)
        year = self.active_training_year()

        # §4.3 — versioned by date, never edited in place. A rule rewritten in place has
        # already destroyed the "before" the preview exists to show.
        closes_on = effective_from - timedelta(days=1)
        for existing_rule in self.live_rules(group_id, on=effective_from):
            existing_rule.effective_to = closes_on

        for spec in self._specs_from_input(rules, effective_from):
            self.session.add(
                GroupScheduleRule(
                    group_id=group_id,
                    weekday=spec.weekday,
                    start_time=spec.start_time,
                    end_time=spec.end_time,
                    location_id=spec.location_id,
                    effective_from=spec.effective_from,
                    effective_to=None,
                    created_at=at,
                )
            )
        self.session.flush()

        saved = [
            spec
            for spec in self.rule_specs(group_id)
            if spec.effective_to is None
        ]
        preview, plan = self._preview(
            group_id, specs=saved, effective_from=effective_from, at=at
        )

        by_id = {row.id: row for row in self.sessions_between(group_id, year.starts_on, year.ends_on)}
        for occurrence in plan.to_create:
            self.session.add(
                Session(
                    group_id=group_id,
                    training_year_id=year.id,
                    starts_at=occurrence.starts_at,
                    ends_at=occurrence.ends_at,
                    location_id=occurrence.location_id,
                    status="scheduled",
                    is_manually_edited=False,
                    generated_from_rule_id=occurrence.rule_id,
                    is_ad_hoc=False,
                    created_at=at,
                )
            )
        for session_id, occurrence in plan.to_update:
            row = by_id[session_id]
            row.starts_at = occurrence.starts_at
            row.ends_at = occurrence.ends_at
            row.location_id = occurrence.location_id
            row.generated_from_rule_id = occurrence.rule_id
        for session_id in plan.to_cancel:
            row = by_id[session_id]
            row.status = "cancelled"
            row.cancel_reason = SYSTEM_CANCEL_SCHEDULE_CHANGE

        AuditService.record(
            self.session,
            action="group.schedule.changed",
            entity_type="group",
            entity_id=group.id,
            studio_id=group.studio_id,
            actor_person_id=actor_person_id,
            actor_identity_id=actor_identity_id,
            # Counts and dates only. A year's worth of session ids in an append-only table
            # is a row nobody can ever prune, and the counts are what an auditor asks for.
            diff={
                "effective_from": effective_from.isoformat(),
                "created": len(plan.to_create),
                "updated": len(plan.to_update),
                "cancelled": len(plan.to_cancel),
                "protected_past": len(plan.protected_past),
                "protected_manually_edited": len(plan.protected_manually_edited),
                "students_left_unscheduled": preview.students_left_unscheduled,
            },
        )
        self.session.flush()
        return preview
```

New imports for `service.py`: `Sequence` from `collections.abc`; `Enrollment` from
`app.models.people`; `AuditService` from `app.services.audit`; `ExistingSession`,
`plan_change`, `students_left_unscheduled`, `SYSTEM_CANCEL_SCHEDULE_CHANGE` from
`app.services.schedule.impact`; `rule_weekdays` from `app.services.schedule.rules`;
`ProtectedSessionOut`, `ScheduleImpactPreview`, `ScheduleRuleIn` from `app.schemas.schedule`.

`_preview` returns a tuple; annotate it
`-> tuple[ScheduleImpactPreview, ChangePlan]` and import `ChangePlan`.

> **A service importing a schema is a departure from `StructureService`, and it is
> deliberate.** `ScheduleImpactPreview` is not a transport shape here, it is the *result
> type* of a computation two endpoints share, and inventing a second dataclass identical
> to it so the service could stay schema-free would give one concept two names.

- [ ] **Step 4: Add the two routes**

Append to `app/routers/schedule.py`:

```python
@router.get("/groups/{group_id}/schedule", response_model=ScheduleRulesOut)
def get_group_schedule(
    _: AnyStaff, group_id: uuid.UUID, session: TenantSessionDep
) -> ScheduleRulesOut:
    service = ScheduleService(session)
    try:
        service._require_group(group_id)
    except NotFoundError as exc:
        raise _not_found() from exc
    rows = service.live_rules(group_id, on=jerusalem_date(now()))
    return ScheduleRulesOut(
        group_id=group_id,
        rules=[ScheduleRuleOut.model_validate(r, from_attributes=True) for r in rows],
    )


@router.put("/groups/{group_id}/schedule", response_model=ScheduleImpactPreview)
def put_group_schedule(
    _: ManagerOrOwner,
    group_id: uuid.UUID,
    body: SchedulePutIn,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> ScheduleImpactPreview:
    """§7 — 'PUT returns an impact preview before applying.'

    One endpoint serves both halves because `apply` is the only difference, and defaulting
    it to `false` means a caller that forgets the field gets a preview rather than an
    unreviewed rewrite of a whole training year.
    """
    service = ScheduleService(session)
    at = now()
    try:
        if not body.apply:
            return service.preview_schedule_change(
                group_id, rules=body.rules, effective_from=body.effective_from, at=at
            )
        person_id, identity_id = _actor(request)
        preview = service.apply_schedule_change(
            group_id,
            rules=body.rules,
            effective_from=body.effective_from,
            at=at,
            actor_person_id=person_id,
            actor_identity_id=identity_id,
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return preview
```

Add to the router: `from fastapi import Request`, the `_actor(request)` helper copied from
`app/routers/studio.py:66-72`, `jerusalem_date` from `app.services.schedule.rules`, and
`ScheduleImpactPreview`, `ScheduleRuleOut`, `ScheduleRulesOut`, `SchedulePutIn` in the
schemas import.

- [ ] **Step 5: Run the test and confirm it passes**

```bash
.venv/bin/pytest tests/schedule/test_schedule_change.py -q
```
Expected: PASS, 15 tests. The file has **no dependency on Task 7** — the two tests about
protected sessions write the `is_manually_edited` and `is_ad_hoc` rows directly, so a
failure here is a failure of the schedule change and of nothing else.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
.venv/bin/mypy app/services/schedule app/routers/schedule.py
.venv/bin/ruff check app/services/schedule app/routers/schedule.py
.venv/bin/ruff format app/services/schedule app/routers/schedule.py tests/schedule
git add app/services/schedule app/routers/schedule.py tests/schedule
git commit -m "feat(schedule): the §5.6 impact preview — only the future is rewritten, C12 counted"
```

---

### Task 7: `/sessions` — the reader, per-session overrides, ad-hoc sessions and notes

§5.6: "A manager or lead coach can change any single session's start time, duration,
location and staff, or cancel it with a reason. Doing so sets `is_manually_edited = true`.
They can also add an ad-hoc session that belongs to no rule."

This is also the **coach-facing** router, so it is tagged `coach` and SPEC §13's third
invariant is enforced against it.

**Files:**
- Create: `app/routers/sessions.py`
- Modify: `app/services/schedule/service.py`
- Modify: `app/schemas/schedule.py`
- Test: `tests/schedule/test_sessions_router.py`

**Interfaces:**
- Consumes: Tasks 4–6.
- Produces:
  - Schemas `SessionStaffIn`, `SessionCreate`, `SessionPatch`, `SessionCancelIn`,
    `SessionNoteCreate`, `SessionNoteOut`, `SessionNotePage`
  - `ScheduleService.project_sessions(self, rows) -> list[SessionOut]`
  - `ScheduleService.list_sessions(self, *, from_date, to_date, group_id, coach_person_id, visible_group_ids, cursor, limit)`
  - `ScheduleService.get_session`, `create_ad_hoc_session`, `patch_session`, `cancel_session`
  - `ScheduleService.list_notes`, `add_note`
  - `ScheduleService.groups_visible_to_guardian(self, person_id) -> set[uuid.UUID]`
  - Router paths `GET/POST /sessions`, `GET/PATCH /sessions/{id}`, `POST /sessions/{id}/cancel`, `GET/POST /sessions/{id}/notes`

- [ ] **Step 1: Extend the schemas**

Append to `app/schemas/schedule.py`:

```python
class SessionStaffIn(BaseModel):
    """Who is actually on the mat for this one session. Distinct from `group_staff`, which
    is who normally coaches the group — §5.14's 'sessions without a coach' report is the
    difference between the two."""

    person_id: uuid.UUID
    role: str = Field(pattern=SESSION_STAFF_ROLE_PATTERN)
    is_substitute: bool = False


class SessionCreate(BaseModel):
    """§5.6 — 'They can also add an ad-hoc session that belongs to no rule.'

    `is_ad_hoc` is not a field a caller may set: every session created here is ad-hoc by
    construction, and a flag the client controlled would let a caller mint a session that a
    regenerate then silently destroys.
    """

    group_id: uuid.UUID
    training_year_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    location_id: uuid.UUID | None = None
    staff: list[SessionStaffIn] = Field(default_factory=list)

    @model_validator(mode="after")
    def _the_session_ends_after_it_starts(self) -> SessionCreate:
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class SessionPatch(BaseModel):
    """§5.6's per-session override.

    **Every field is optional and absence is not `null`.** `location_id: null` clears the
    location; omitting `location_id` leaves it alone. The router distinguishes them with
    `model_fields_set`, which is the only way to express "remove the room" and "do not
    touch the room" in one shape.

    Times move as a pair. A start without an end would silently redefine the duration, and
    "the class is an hour shorter now" is not something anyone typed.
    """

    starts_at: datetime | None = None
    ends_at: datetime | None = None
    location_id: uuid.UUID | None = None
    staff: list[SessionStaffIn] | None = None

    @model_validator(mode="after")
    def _times_move_together(self) -> SessionPatch:
        moved = {"starts_at", "ends_at"} & self.model_fields_set
        if moved and len(moved) != 2:
            raise ValueError("starts_at and ends_at must be given together")
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class SessionCancelIn(BaseModel):
    """§5.6 — 'or cancel it with a reason'. The reason is required by the column's own
    check constraint, so a blank one is refused here rather than at the database."""

    reason: str = Field(min_length=1, max_length=200)


class SessionNoteCreate(BaseModel):
    body: str = Field(min_length=1)


class SessionNoteOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    author_person_id: uuid.UUID
    body: str
    created_at: datetime


SessionNotePage = CursorPage[SessionNoteOut]
```

- [ ] **Step 2: Write the failing test**

`tests/schedule/test_sessions_router.py`:

```python
"""§5.6's per-session overrides, ad-hoc sessions and §5.13's coach note.

The rule the whole file turns on: **any deliberate change to one session sets
`is_manually_edited`**, and that flag is what a later rule change reads to decide what it
may not touch. A PATCH that forgot to set it would leave a coach's careful change looking
machine-made, and the next schedule edit would quietly undo it.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
from app.models.schedule import Session
from sqlalchemy import select
from tests.schedule.conftest import T0

API = "/api/v1"
TUESDAY = 2


@pytest.fixture
def a_session(client, as_manager, a_group, an_active_year, app_session):
    client.put(
        f"{API}/groups/{a_group}/schedule",
        headers=as_manager.headers,
        json={
            "rules": [
                {
                    "weekday": TUESDAY,
                    "start_time": "17:00:00",
                    "end_time": "19:00:00",
                    "location_id": None,
                    "effective_from": "2026-09-01",
                }
            ],
            "effective_from": "2026-09-01",
            "apply": True,
        },
    )
    client.post(
        f"{API}/training-years/{an_active_year}/generate-sessions", headers=as_manager.headers
    )
    return app_session.execute(
        select(Session).where(Session.group_id == a_group, Session.starts_at > T0)
        .order_by(Session.starts_at)
    ).scalars().first()


# -- reading ------------------------------------------------------------------
def test_a_coach_lists_sessions_in_a_date_range(client, as_lead_coach, a_session):
    response = client.get(
        f"{API}/sessions?from=2026-11-01&to=2026-11-30", headers=as_lead_coach.headers
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert items
    assert all(item["starts_at"] for item in items)
    assert items == sorted(items, key=lambda s: s["starts_at"])


def test_a_session_carries_the_group_and_location_names_it_needs_to_be_drawn(
    client, as_lead_coach, a_session
):
    """`SessionOut` is deliberately flat and complete: a caller that has one never needs a
    second request to decide what to draw, which is what makes it cacheable in IndexedDB
    (§10.6) rather than a join the client has to redo offline."""
    item = client.get(f"{API}/sessions/{a_session.id}", headers=as_lead_coach.headers).json()
    assert item["group_name"] == "מתחילים"
    assert item["location_name"] is None
    assert item["is_manually_edited"] is False
    assert item["is_ad_hoc"] is False
    assert item["attendance_taken"] is False


def test_the_coach_filter_replaces_a_split_screen(client, as_manager, as_lead_coach, a_session):
    """Artboard 9a — 'מסנן מאמן במקום פיצול מסכים'. Assigning the coach to this one session
    is `session_staff`, not `group_staff`: who actually coached THIS session."""
    client.patch(
        f"{API}/sessions/{a_session.id}",
        headers=as_manager.headers,
        json={"staff": [{"person_id": str(as_lead_coach.person_id), "role": "lead_coach"}]},
    )
    mine = client.get(
        f"{API}/sessions?from=2026-11-01&to=2026-11-30"
        f"&coach_person_id={as_lead_coach.person_id}",
        headers=as_lead_coach.headers,
    ).json()["items"]
    assert [s["id"] for s in mine] == [str(a_session.id)]
    assert mine[0]["staff"][0]["display_name"] == "בודק lead_coach"


def test_a_guardian_sees_only_the_groups_their_children_are_enrolled_in(
    client, fake_provider, app_session, studio, a_group, a_session
):
    """Artboard 12b — the parent's calendar. A guardian holds no role_assignment (§3.1), so
    the staff dependency would refuse them outright; the reader admits them and narrows the
    query to groups reachable through `guardian -> student -> enrollment`."""
    import uuid

    from app.models.identity import AuthIdentity
    from app.models.people import Enrollment, Student
    from app.models.person import Guardian, Person
    from app.models.structure import Class, Group
    from tests.conftest import sign_in

    subject = f"guardian-{uuid.uuid4()}"
    code = f"code-{subject}"
    fake_provider.register(code=code, subject=subject, email=f"{subject}@example.invalid")
    sign_in(client, code=code, app_name="parent")
    identity_id = app_session.execute(
        select(AuthIdentity.id).where(AuthIdentity.provider_subject == subject)
    ).scalar_one()

    parent = Person(
        studio_id=studio.id, auth_identity_id=identity_id, first_name="הורה", last_name="א׳"
    )
    child = Student(studio_id=studio.id, first_name="ילד", last_name="א׳", status="active")
    app_session.add_all([parent, child])
    app_session.flush()
    app_session.add_all(
        [
            Guardian(
                studio_id=studio.id,
                student_id=child.id,
                person_id=parent.id,
                is_primary=True,
                relation="parent",
            ),
            Enrollment(
                studio_id=studio.id,
                student_id=child.id,
                group_id=a_group,
                status="active",
                started_on=date(2026, 9, 1),
            ),
        ]
    )
    # A group the child is NOT in.
    other_class = Class(studio_id=studio.id, name="קראטה")
    app_session.add(other_class)
    app_session.flush()
    stranger = Group(studio_id=studio.id, class_id=other_class.id, name="זרים")
    app_session.add(stranger)
    app_session.commit()

    token = sign_in(client, code=code, app_name="parent").json()["access_token"]
    headers = {"Authorization": f"Bearer {token}", "X-Dev-Now": T0.isoformat()}

    mine = client.get(f"{API}/sessions?from=2026-11-01&to=2026-11-30", headers=headers)
    assert mine.status_code == 200
    assert {s["group_id"] for s in mine.json()["items"]} == {str(a_group)}

    refused = client.get(
        f"{API}/sessions?from=2026-11-01&to=2026-11-30&group_id={stranger.id}", headers=headers
    )
    assert refused.json()["items"] == []


# -- the override -------------------------------------------------------------
def test_moving_one_session_sets_is_manually_edited(client, as_manager, a_session):
    response = client.patch(
        f"{API}/sessions/{a_session.id}",
        headers=as_manager.headers,
        json={"starts_at": "2026-11-17T16:30:00Z", "ends_at": "2026-11-17T18:30:00Z"},
    )
    assert response.status_code == 200
    assert response.json()["is_manually_edited"] is True
    assert response.json()["starts_at"].startswith("2026-11-17T16:30")


def test_a_start_without_an_end_is_refused(client, as_manager, a_session):
    """Moving one and not the other silently redefines the duration, and 'the class is an
    hour shorter now' is not something anyone typed."""
    response = client.patch(
        f"{API}/sessions/{a_session.id}",
        headers=as_manager.headers,
        json={"starts_at": "2026-11-17T16:30:00Z"},
    )
    assert response.status_code == 422


def test_omitting_the_location_leaves_it_alone_and_null_clears_it(
    client, as_manager, a_session, a_location
):
    client.patch(
        f"{API}/sessions/{a_session.id}",
        headers=as_manager.headers,
        json={"location_id": str(a_location)},
    )
    after_staff_only = client.patch(
        f"{API}/sessions/{a_session.id}",
        headers=as_manager.headers,
        json={"staff": []},
    ).json()
    assert after_staff_only["location_id"] == str(a_location)

    cleared = client.patch(
        f"{API}/sessions/{a_session.id}", headers=as_manager.headers, json={"location_id": None}
    ).json()
    assert cleared["location_id"] is None


def test_cancelling_one_session_needs_a_reason_and_marks_it_edited(
    client, as_manager, a_session
):
    blank = client.post(
        f"{API}/sessions/{a_session.id}/cancel", headers=as_manager.headers, json={"reason": ""}
    )
    assert blank.status_code == 422

    response = client.post(
        f"{API}/sessions/{a_session.id}/cancel",
        headers=as_manager.headers,
        json={"reason": "אין חשמל באולם"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert response.json()["cancel_reason"] == "אין חשמל באולם"
    # §5.6 — cancelling is a deliberate act, so a later rule change must not undo it.
    assert response.json()["is_manually_edited"] is True


def test_an_assistant_coach_may_read_a_session_but_not_move_it(
    client, as_assistant_coach, a_session
):
    """§5.6 — 'A manager or lead coach can change any single session'."""
    assert client.get(
        f"{API}/sessions/{a_session.id}", headers=as_assistant_coach.headers
    ).status_code == 200
    refused = client.patch(
        f"{API}/sessions/{a_session.id}",
        headers=as_assistant_coach.headers,
        json={"starts_at": "2026-11-17T16:30:00Z", "ends_at": "2026-11-17T18:30:00Z"},
    )
    assert refused.status_code == 403


# -- ad hoc -------------------------------------------------------------------
def test_an_ad_hoc_session_belongs_to_no_rule(client, as_manager, a_group, an_active_year):
    response = client.post(
        f"{API}/sessions",
        headers=as_manager.headers,
        json={
            "group_id": str(a_group),
            "training_year_id": str(an_active_year),
            "starts_at": "2026-12-11T08:00:00Z",
            "ends_at": "2026-12-11T10:00:00Z",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["is_ad_hoc"] is True
    assert response.json()["is_manually_edited"] is True


def test_an_ad_hoc_session_that_ends_before_it_starts_is_refused(
    client, as_manager, a_group, an_active_year
):
    response = client.post(
        f"{API}/sessions",
        headers=as_manager.headers,
        json={
            "group_id": str(a_group),
            "training_year_id": str(an_active_year),
            "starts_at": "2026-12-11T10:00:00Z",
            "ends_at": "2026-12-11T08:00:00Z",
        },
    )
    assert response.status_code == 422


# -- notes --------------------------------------------------------------------
def test_a_coach_writes_a_session_summary_and_reads_it_back(
    client, as_lead_coach, a_session
):
    """§5.13 / artboard 9g סיכום מפגש."""
    created = client.post(
        f"{API}/sessions/{a_session.id}/notes",
        headers=as_lead_coach.headers,
        json={"body": "עבדנו על או-סוטו-גארי"},
    )
    assert created.status_code == 201
    assert created.json()["author_person_id"] == str(as_lead_coach.person_id)

    listed = client.get(
        f"{API}/sessions/{a_session.id}/notes", headers=as_lead_coach.headers
    ).json()
    assert [n["body"] for n in listed["items"]] == ["עבדנו על או-סוטו-גארי"]


def test_a_session_in_another_studio_is_invisible(client, as_manager):
    import uuid

    assert client.get(
        f"{API}/sessions/{uuid.uuid4()}", headers=as_manager.headers
    ).status_code == 404
```

- [ ] **Step 3: Run the test and confirm it fails**

```bash
.venv/bin/pytest tests/schedule/test_sessions_router.py -q
```
Expected: 404 on every `/sessions` path.

- [ ] **Step 4: Implement the service methods**

Append to `app/services/schedule/service.py`:

```python
    # -- projection -----------------------------------------------------------
    def project_sessions(self, rows: Sequence[Session]) -> list[SessionOut]:
        """ORM rows -> `SessionOut`, with the names a client needs to draw them.

        Three batch queries, never one per row: the staff app's Today screen and the
        dashboard's week view both render dozens at once, and an N+1 here is felt on a
        phone on a bus.

        `attendance_taken` is `False` for every row in W2 (D-M2-7). The `attendance` table
        is W3's and lives in `app/models/_pending/`, which this lane never imports. M5
        fills the field; the shape does not change when it does.
        """
        if not rows:
            return []
        group_names = dict(
            self.session.execute(
                select(Group.id, Group.name).where(
                    Group.id.in_({r.group_id for r in rows})
                )
            ).all()
        )
        location_ids = {r.location_id for r in rows if r.location_id is not None}
        location_names = (
            dict(
                self.session.execute(
                    select(Location.id, Location.name).where(Location.id.in_(location_ids))
                ).all()
            )
            if location_ids
            else {}
        )
        staff_rows = self.session.execute(
            select(SessionStaff, Person.first_name, Person.last_name)
            .join(Person, Person.id == SessionStaff.person_id)
            .where(SessionStaff.session_id.in_({r.id for r in rows}))
        ).all()
        staff_by_session: dict[uuid.UUID, list[SessionStaffOut]] = {}
        for assignment, first_name, last_name in staff_rows:
            staff_by_session.setdefault(assignment.session_id, []).append(
                SessionStaffOut(
                    person_id=assignment.person_id,
                    display_name=f"{first_name} {last_name}",
                    role=assignment.role,
                    is_substitute=assignment.is_substitute,
                )
            )

        return [
            SessionOut(
                id=row.id,
                group_id=row.group_id,
                group_name=group_names.get(row.group_id, ""),
                training_year_id=row.training_year_id,
                starts_at=row.starts_at,
                ends_at=row.ends_at,
                location_id=row.location_id,
                location_name=location_names.get(row.location_id) if row.location_id else None,
                status=row.status,
                is_manually_edited=row.is_manually_edited,
                is_ad_hoc=row.is_ad_hoc,
                cancel_reason=row.cancel_reason,
                staff=staff_by_session.get(row.id, []),
                attendance_taken=False,
            )
            for row in rows
        ]

    # -- reading --------------------------------------------------------------
    def groups_visible_to_guardian(self, person_id: uuid.UUID) -> set[uuid.UUID]:
        """Artboard 12b's authorization, in one query.

        §3.3 makes 'my children' exactly `SELECT student_id FROM guardian WHERE
        person_id = :me`, and a child's groups are their active enrollments. Both tables
        belong to other lanes and are **read, never written**, from here — a parent's
        calendar that cannot load is a screen that was not delivered.
        """
        rows = self.session.execute(
            select(Enrollment.group_id)
            .join(Guardian, Guardian.student_id == Enrollment.student_id)
            .where(Guardian.person_id == person_id, Enrollment.ended_on.is_(None))
        ).scalars().all()
        return set(rows)

    def list_sessions(
        self,
        *,
        from_date: date,
        to_date: date,
        group_id: uuid.UUID | None = None,
        coach_person_id: uuid.UUID | None = None,
        visible_group_ids: set[uuid.UUID] | None = None,
        cursor: uuid.UUID | None = None,
        limit: int = 50,
    ) -> tuple[list[Session], uuid.UUID | None]:
        """`GET /sessions?from&to&group_id`.

        `visible_group_ids` is `None` for staff — they see the whole studio — and a set for
        a guardian. An **empty** set is not the same as `None`: it means "this caller has no
        children enrolled anywhere", and it must return nothing rather than everything.
        Making that distinction a type rather than a falsy check is the difference between a
        quiet bug and a compile error.
        """
        lower = datetime.combine(from_date - timedelta(days=1), datetime.min.time(), tzinfo=UTC)
        upper = datetime.combine(to_date + timedelta(days=2), datetime.min.time(), tzinfo=UTC)
        stmt = (
            select(Session)
            .where(Session.starts_at >= lower, Session.starts_at < upper)
            .order_by(Session.starts_at, Session.id)
        )
        if group_id is not None:
            stmt = stmt.where(Session.group_id == group_id)
        if visible_group_ids is not None:
            stmt = stmt.where(Session.group_id.in_(visible_group_ids or {uuid.UUID(int=0)}))
        if coach_person_id is not None:
            stmt = stmt.where(
                Session.id.in_(
                    select(SessionStaff.session_id).where(
                        SessionStaff.person_id == coach_person_id
                    )
                )
            )
        rows = [
            row
            for row in self.session.execute(stmt).scalars().all()
            if from_date <= jerusalem_date(row.starts_at) <= to_date
        ]
        if cursor is not None:
            seen = [i for i, row in enumerate(rows) if row.id == cursor]
            rows = rows[seen[0] + 1 :] if seen else rows
        if len(rows) > limit:
            return rows[:limit], rows[limit - 1].id
        return rows, None

    def get_session(self, session_id: uuid.UUID) -> Session:
        row = self.session.get(Session, session_id)
        if row is None:
            raise NotFoundError(str(session_id))
        return row

    # -- writing one session --------------------------------------------------
    def _set_staff(self, session_id: uuid.UUID, staff: Sequence[SessionStaffIn]) -> None:
        for existing_row in self.session.execute(
            select(SessionStaff).where(SessionStaff.session_id == session_id)
        ).scalars().all():
            self.session.delete(existing_row)
        self.session.flush()
        for member in staff:
            self.session.add(
                SessionStaff(
                    session_id=session_id,
                    person_id=member.person_id,
                    role=member.role,
                    is_substitute=member.is_substitute,
                )
            )

    def create_ad_hoc_session(self, body: SessionCreate, *, at: datetime) -> Session:
        """§5.6 — 'add an ad-hoc session that belongs to no rule'.

        `is_manually_edited` is set as well as `is_ad_hoc`. Both are true and both matter:
        the first says a human decided this, the second says no rule owns it. A regenerate
        checks either and stops.
        """
        self._require_group(body.group_id)
        self.get_training_year(body.training_year_id)
        row = Session(
            group_id=body.group_id,
            training_year_id=body.training_year_id,
            starts_at=body.starts_at,
            ends_at=body.ends_at,
            location_id=body.location_id,
            status="scheduled",
            is_manually_edited=True,
            generated_from_rule_id=None,
            is_ad_hoc=True,
            created_at=at,
        )
        self.session.add(row)
        self.session.flush()
        self._set_staff(row.id, body.staff)
        self.session.flush()
        return row

    def patch_session(
        self, session_id: uuid.UUID, body: SessionPatch, *, at: datetime
    ) -> Session:
        """§5.6's per-session override. **Any change here sets `is_manually_edited`.**

        That flag is the whole of the second protection: a later rule change reads it to
        decide what it may not touch. A PATCH that forgot to set it would leave a coach's
        deliberate change looking machine-made, and the next schedule edit would quietly
        undo it — which is the exact failure §5.6 spends a paragraph on.
        """
        row = self.get_session(session_id)
        given = body.model_fields_set
        if "starts_at" in given and body.starts_at and body.ends_at:
            row.starts_at = body.starts_at
            row.ends_at = body.ends_at
        if "location_id" in given:
            row.location_id = body.location_id
        if "staff" in given and body.staff is not None:
            self._set_staff(row.id, body.staff)
        row.is_manually_edited = True
        row.updated_at = at
        self.session.flush()
        return row

    def cancel_session(self, session_id: uuid.UUID, *, reason: str, at: datetime) -> Session:
        row = self.get_session(session_id)
        row.status = "cancelled"
        row.cancel_reason = reason
        row.is_manually_edited = True
        row.updated_at = at
        self.session.flush()
        return row

    # -- notes ----------------------------------------------------------------
    def list_notes(
        self, session_id: uuid.UUID, *, cursor: uuid.UUID | None = None, limit: int = 50
    ) -> tuple[list[SessionNote], uuid.UUID | None]:
        self.get_session(session_id)
        stmt = (
            select(SessionNote)
            .where(SessionNote.session_id == session_id, SessionNote.deleted_at.is_(None))
            .order_by(SessionNote.id)
        )
        rows = self.session.execute(_paged(stmt, cursor=cursor, limit=limit)).scalars().all()
        return _page_out(list(rows), limit)

    def add_note(
        self, session_id: uuid.UUID, *, body: str, author_person_id: uuid.UUID, at: datetime
    ) -> SessionNote:
        self.get_session(session_id)
        row = SessionNote(
            session_id=session_id, author_person_id=author_person_id, body=body, created_at=at
        )
        self.session.add(row)
        self.session.flush()
        return row
```

New imports for `service.py`: `UTC` from `datetime`; `SessionNote`, `SessionStaff` from
`app.models.schedule`; `Location` from `app.models.structure`; `Guardian`, `Person` from
`app.models.person`; `SessionCreate`, `SessionOut`, `SessionPatch`, `SessionStaffIn`,
`SessionStaffOut` from `app.schemas.schedule`.

- [ ] **Step 5: Write the router**

Create `app/routers/sessions.py`:

```python
"""SPEC §7's `/sessions` block — the coach-facing half of the schedule.

**Tagged `coach`, and that tag is load-bearing.** SPEC §13's third invariant — no
coach-scoped endpoint returns any financial field — is enforced against it by
`tests/invariants/test_03`, so an untagged coach router is an unguarded one. `SessionOut`
carries no money and must never learn to.

Three permission levels, and each is §3.2 or §5.6 verbatim:

* **reading** admits every staff role **and a guardian**. Artboard 12b is a parent's
  calendar of their own child's lessons; a guardian holds no `role_assignment` at all
  (§3.1), so the staff dependency would refuse them and the screen would not exist. The
  service narrows a guardian's query to the groups their children are enrolled in.
* **changing one session** is owner, manager or lead coach — §5.6, 'A manager or lead coach
  can change any single session'.
* **writing a note** is any staff role: §5.13's סיכום מפגש is the assistant coach's too.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.core.auth_context import AnyStaff, require_roles
from app.core.clock import now
from app.core.tenancy import TenantSessionDep
from app.schemas._pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, IdempotencyKey
from app.schemas.schedule import (
    SessionCancelIn,
    SessionCreate,
    SessionNoteCreate,
    SessionNoteOut,
    SessionNotePage,
    SessionOut,
    SessionPage,
    SessionPatch,
)
from app.services.schedule.service import NotFoundError, ScheduleService

router = APIRouter(tags=["coach", "schedule"])

#: §5.6 — 'A manager or lead coach can change any single session.' An assistant coach reads
#: the roster; they do not move the lesson.
ManagerOrLeadCoach = Annotated[
    None, Depends(require_roles("owner", "manager", "lead_coach"))
]


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": "no such record"},
    )


def _person_id(request: Request) -> uuid.UUID | None:
    person_id = getattr(request.state, "person_id", None)
    return person_id if isinstance(person_id, uuid.UUID) else None


def _visible_groups(request: Request, service: ScheduleService) -> set[uuid.UUID] | None:
    """`None` for staff — the whole studio. A set for a guardian.

    An **empty** set is a real answer, not a missing one: a signed-in parent whose children
    are not enrolled anywhere sees nothing, and returning `None` for them would show them
    the entire club's calendar.
    """
    roles = set(getattr(request.state, "roles", ()) or ())
    if roles & {"owner", "manager", "lead_coach", "assistant_coach"}:
        return None
    person_id = _person_id(request)
    if person_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )
    return service.groups_visible_to_guardian(person_id)


def _signed_in(request: Request) -> None:
    """Reading a session needs an identity, not a role. The narrowing is the authorization,
    and it happens in `_visible_groups`."""
    if getattr(request.state, "identity_id", None) is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthenticated", "message": "sign in first"},
        )


SignedIn = Annotated[None, Depends(_signed_in)]


@router.get("/sessions", response_model=SessionPage)
def list_sessions(
    _: SignedIn,
    request: Request,
    session: TenantSessionDep,
    from_: date_query := None,  # replaced below — see note
) -> SessionPage: ...
```

> The `from` query parameter is a Python keyword. FastAPI's `Query(alias="from")` is the
> supported way to spell it, so the real signature is:

```python
@router.get("/sessions", response_model=SessionPage)
def list_sessions(
    _: SignedIn,
    request: Request,
    session: TenantSessionDep,
    from_date: Annotated[date, Query(alias="from")],
    to_date: Annotated[date, Query(alias="to")],
    group_id: uuid.UUID | None = None,
    coach_person_id: uuid.UUID | None = None,
    cursor: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> SessionPage:
    service = ScheduleService(session)
    rows, next_cursor = service.list_sessions(
        from_date=from_date,
        to_date=to_date,
        group_id=group_id,
        coach_person_id=coach_person_id,
        visible_group_ids=_visible_groups(request, service),
        cursor=cursor,
        limit=limit,
    )
    return SessionPage(
        items=service.project_sessions(rows),
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


@router.get("/sessions/{session_id}", response_model=SessionOut)
def get_session(
    _: SignedIn, session_id: uuid.UUID, request: Request, session: TenantSessionDep
) -> SessionOut:
    service = ScheduleService(session)
    try:
        row = service.get_session(session_id)
    except NotFoundError as exc:
        raise _not_found() from exc
    visible = _visible_groups(request, service)
    if visible is not None and row.group_id not in visible:
        # Invisible, not forbidden: a 403 would confirm another family's lesson exists.
        raise _not_found()
    return service.project_sessions([row])[0]


@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_ad_hoc_session(
    _: ManagerOrLeadCoach,
    body: SessionCreate,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> SessionOut:
    service = ScheduleService(session)
    try:
        row = service.create_ad_hoc_session(body, at=now())
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return service.project_sessions([row])[0]


@router.patch("/sessions/{session_id}", response_model=SessionOut)
def patch_session(
    _: ManagerOrLeadCoach,
    session_id: uuid.UUID,
    body: SessionPatch,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> SessionOut:
    service = ScheduleService(session)
    try:
        row = service.patch_session(session_id, body, at=now())
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return service.project_sessions([row])[0]


@router.post("/sessions/{session_id}/cancel", response_model=SessionOut)
def cancel_session(
    _: ManagerOrLeadCoach,
    session_id: uuid.UUID,
    body: SessionCancelIn,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> SessionOut:
    service = ScheduleService(session)
    try:
        row = service.cancel_session(session_id, reason=body.reason, at=now())
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return service.project_sessions([row])[0]


@router.get("/sessions/{session_id}/notes", response_model=SessionNotePage)
def list_notes(
    _: AnyStaff,
    session_id: uuid.UUID,
    session: TenantSessionDep,
    cursor: uuid.UUID | None = None,
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
) -> SessionNotePage:
    try:
        rows, next_cursor = ScheduleService(session).list_notes(
            session_id, cursor=cursor, limit=limit
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    return SessionNotePage(
        items=[SessionNoteOut.model_validate(r, from_attributes=True) for r in rows],
        next_cursor=next_cursor,
        has_more=next_cursor is not None,
    )


@router.post(
    "/sessions/{session_id}/notes",
    response_model=SessionNoteOut,
    status_code=status.HTTP_201_CREATED,
)
def add_note(
    _: AnyStaff,
    session_id: uuid.UUID,
    body: SessionNoteCreate,
    request: Request,
    session: TenantSessionDep,
    idempotency_key: IdempotencyKey = None,
) -> SessionNoteOut:
    author = _person_id(request)
    if author is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "forbidden", "message": "a note needs an author"},
        )
    try:
        row = ScheduleService(session).add_note(
            session_id, body=body.body, author_person_id=author, at=now()
        )
    except NotFoundError as exc:
        raise _not_found() from exc
    session.commit()
    return SessionNoteOut.model_validate(row, from_attributes=True)
```

Delete the illustrative `from_ : date_query := None` stub above; only the real signature
ships. Add `from datetime import date` to the router's imports.

- [ ] **Step 6: Run the tests and confirm they pass**

```bash
.venv/bin/pytest tests/schedule -q
```
Expected: PASS, the whole directory.

- [ ] **Step 7: Typecheck and lint the two files the lane check cannot reach**

Sanctioned exception 3: `scripts/lane-check.sh`'s `*)` branch does not resolve
`app/routers/sessions.py`. Run it by hand and show the output.

```bash
.venv/bin/mypy app/services/schedule app/routers/schedule.py app/routers/sessions.py
.venv/bin/ruff check app/services/schedule app/routers/schedule.py app/routers/sessions.py
.venv/bin/ruff format app/services/schedule app/routers/schedule.py app/routers/sessions.py tests/schedule
```

- [ ] **Step 8: Confirm invariant 3 still passes with a new coach-tagged router**

```bash
.venv/bin/pytest tests/invariants tests/restrictions -q
```
Expected: PASS. This is the first `coach`-tagged router in the product, so it is the first
time invariant 3 has anything to check.

- [ ] **Step 9: Commit**

```bash
git add app/routers/sessions.py app/services/schedule app/schemas/schedule.py tests/schedule
git commit -m "feat(schedule): /sessions — overrides set is_manually_edited, ad-hoc, notes"
```

---

### Task 8: The session-completion worker

`session.status` allows `completed` and nothing sets it. E2E-5 filters rows by `הסתיים`,
§5.14's "sessions held vs planned" report counts them, and the impact dialog's "18 שיעורים
שהתקיימו" is the same fact from the other side.

**Files:**
- Create: `app/workers/schedule.py`
- Test: `tests/schedule/test_worker.py`

**Interfaces:**
- Consumes: Task 4.
- Produces: `complete_ended_sessions(session, *, at) -> int`, `main() -> int`.

- [ ] **Step 1: Write the failing test**

`tests/schedule/test_worker.py`:

```python
"""The only writer of `session.status = 'completed'`.

Nothing else can set it: a session ends by the passage of time, not by anybody doing
something. Leaving it to the attendance screen would mean a class nobody marked stayed
`scheduled` forever, and §5.14's 'sessions held vs planned' would report the club as having
held nothing.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from app.core.db import get_engine
from app.core.tenancy import TenantSession, use_studio
from app.models.schedule import Session
from app.workers.schedule import complete_ended_sessions
from tests.schedule.conftest import T0


@pytest.fixture
def tenant_session(migrated, studio):
    with use_studio(studio.id), TenantSession(bind=get_engine(), expire_on_commit=False) as s:
        yield s


def make(tenant_session, studio, an_active_year, a_group, *, start, end, status="scheduled", **kw):
    row = Session(
        studio_id=studio.id,
        group_id=a_group,
        training_year_id=an_active_year,
        starts_at=start,
        ends_at=end,
        status=status,
        **kw,
    )
    tenant_session.add(row)
    tenant_session.flush()
    return row


def test_a_session_that_has_ended_becomes_completed(
    tenant_session, studio, an_active_year, a_group
):
    ended = make(
        tenant_session, studio, an_active_year, a_group,
        start=datetime(2026, 10, 6, 15, 0, tzinfo=UTC),
        end=datetime(2026, 10, 6, 17, 0, tzinfo=UTC),
    )
    assert complete_ended_sessions(tenant_session, at=T0) == 1
    assert tenant_session.get(Session, ended.id).status == "completed"


def test_a_session_still_to_come_is_left_alone(
    tenant_session, studio, an_active_year, a_group
):
    upcoming = make(
        tenant_session, studio, an_active_year, a_group,
        start=datetime(2026, 12, 1, 15, 0, tzinfo=UTC),
        end=datetime(2026, 12, 1, 17, 0, tzinfo=UTC),
    )
    assert complete_ended_sessions(tenant_session, at=T0) == 0
    assert tenant_session.get(Session, upcoming.id).status == "scheduled"


def test_a_session_still_running_is_left_alone(
    tenant_session, studio, an_active_year, a_group
):
    """The boundary is `ends_at <= now`. A class in progress has people on the mat and a
    coach who is about to mark attendance on it."""
    running = make(
        tenant_session, studio, an_active_year, a_group,
        start=datetime(2026, 11, 3, 11, 0, tzinfo=UTC),
        end=datetime(2026, 11, 3, 13, 0, tzinfo=UTC),
    )
    assert complete_ended_sessions(tenant_session, at=T0) == 0
    assert tenant_session.get(Session, running.id).status == "scheduled"


def test_a_cancelled_session_is_never_quietly_completed(
    tenant_session, studio, an_active_year, a_group
):
    """A cancelled lesson did not happen. Completing it would put it into §5.14's
    'sessions held' count and tell the club it ran a class it cancelled."""
    cancelled = make(
        tenant_session, studio, an_active_year, a_group,
        start=datetime(2026, 10, 6, 15, 0, tzinfo=UTC),
        end=datetime(2026, 10, 6, 17, 0, tzinfo=UTC),
        status="cancelled",
        cancel_reason="system:closure",
    )
    assert complete_ended_sessions(tenant_session, at=T0) == 0
    assert tenant_session.get(Session, cancelled.id).status == "cancelled"


def test_running_it_twice_completes_nothing_the_second_time(
    tenant_session, studio, an_active_year, a_group
):
    make(
        tenant_session, studio, an_active_year, a_group,
        start=datetime(2026, 10, 6, 15, 0, tzinfo=UTC),
        end=datetime(2026, 10, 6, 17, 0, tzinfo=UTC),
    )
    assert complete_ended_sessions(tenant_session, at=T0) == 1
    assert complete_ended_sessions(tenant_session, at=T0) == 0
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
.venv/bin/pytest tests/schedule/test_worker.py -q
```
Expected: `ModuleNotFoundError: No module named 'app.workers.schedule'`.

- [ ] **Step 3: Write the worker**

Create `app/workers/schedule.py`:

```python
"""The only writer of `session.status = 'completed'`.

A session ends by the passage of time, not by anybody doing anything, so nothing in a
request path can be responsible for it. Leaving it to the attendance screen would mean a
class nobody marked stayed `scheduled` forever, and §5.14's 'sessions held vs planned'
would report a club that held nothing.

Run as `python -m app.workers.schedule`, and under time travel as
`python -m app.workers.schedule --at=2027-03-01` — §19.5's `use_dev_now` is the same
mechanism the `X-Dev-Now` header uses, not a second one.

**Cross-studio on purpose.** This is maintenance, not a report: every studio's ended
sessions become `completed`, the demo studio included. `app.core.demo.exclude_demo_studios`
guards cross-studio *numbers*, and a status that lagged only in the demo studio would make
the demo the one place the product looked broken.
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from app.core.clock import now, parse_dev_now, use_dev_now
from app.core.db import get_engine
from app.core.logging import configure_logging
from app.core.tenancy import with_all_tenants
from app.models.schedule import Session

logger = logging.getLogger(__name__)


def complete_ended_sessions(session: OrmSession, *, at: datetime) -> int:
    """Mark every session that has ended `completed`. Returns how many changed.

    `ends_at <= at`, not `starts_at`: a class in progress has people on the mat and a coach
    who is about to mark attendance on it.

    A cancelled session is never touched. It did not happen, and completing it would put it
    into §5.14's 'sessions held' count and tell the club it ran a class it cancelled.
    """
    rows = session.execute(
        select(Session).where(Session.ends_at <= at, Session.status == "scheduled")
    ).scalars().all()
    for row in rows:
        row.status = "completed"
    session.flush()
    return len(rows)


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    parser = argparse.ArgumentParser(prog="app.workers.schedule")
    parser.add_argument("--at", help="ISO 8601. §19.5's time travel, for the job path.")
    args = parser.parse_args(argv)

    shifted = parse_dev_now(args.at) if args.at else None
    with use_dev_now(shifted):
        at = now()
        # A plain Session, not a TenantSession: this walks every studio deliberately, which
        # is exactly the case §4.2's escape hatch exists for. The reason is required so
        # which of the two legal uses this is stays visible at the call site.
        with with_all_tenants(reason="maintenance job: complete ended sessions in every studio"):
            with OrmSession(get_engine(), expire_on_commit=False) as session:
                completed = complete_ended_sessions(session, at=at)
                session.commit()

    logger.info("sessions completed", extra={"completed": completed, "at": at.isoformat()})
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
.venv/bin/pytest tests/schedule/test_worker.py -q
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck and lint by hand (the lane check does not reach `app/workers/`)**

```bash
.venv/bin/mypy app/workers/schedule.py
.venv/bin/ruff check app/workers/schedule.py
.venv/bin/ruff format app/workers/schedule.py tests/schedule
.venv/bin/pytest tests/dev/test_clock.py -q
```
The last one is the discipline gate: it AST-scans `app/` for a wall-clock call, and a
worker is the easiest place to write one by accident.

- [ ] **Step 6: Commit**

```bash
git add app/workers/schedule.py tests/schedule/test_worker.py
git commit -m "feat(schedule): the worker that marks ended sessions completed"
```

---

### Task 9: The Hebrew strings the seven artboards need

`web/packages/i18n/{he,en,ru}/schedule.ts` already holds 98 keys from W2's contract commit.
This task adds only what the screens below actually render. **`en` is `strict` in
`i18n-parity.mjs`** — a Hebrew key with no English one fails the lane check.

**Files:**
- Modify: `web/packages/i18n/he/schedule.ts`, `web/packages/i18n/en/schedule.ts`,
  `web/packages/i18n/ru/schedule.ts`

**Interfaces:**
- Produces: the keys below, consumed by Tasks 10–15.

- [ ] **Step 1: Confirm parity is green before touching anything**

```bash
node web/scripts/i18n-parity.mjs schedule
```
Expected: `✅ i18n parity · schedule`. All three locales are at 98 keys today.

- [ ] **Step 2: Add the keys to `he/schedule.ts`**

Append inside the `schedule` object, keeping the existing section comments:

```ts
  // -- the impact preview, continued: C12 ---------------------------------------
  // C12 — a change that empties a student's pattern takes them off the roster and stops
  // counting them absent, which looks exactly like the feature working. The ⚠ is NOT in
  // the string: it is the Alert primitive's icon, which carries an accessible name. A
  // glyph inside a translated sentence is invisible to a screen reader.
  'impact.studentsUnscheduled': '{{count}} תלמידים לא רשומים לאף יום אחרי השינוי',
  'impact.studentsUnscheduledOne': 'תלמיד אחד לא רשום לאף יום אחרי השינוי',
  'impact.studentsUnscheduledHint':
    'תלמיד שאינו רשום לאף יום יורד מרשימת הנוכחות ואינו נספר כנעדר',
  'impact.studentsUnscheduledIcon': 'אזהרה',
  'impact.protectedManualList': 'השיעורים שנערכו ידנית',
  'impact.close': 'סגירה',

  // -- what the server cancelled, and why (D-M2-3) --------------------------------
  'session.cancelReason.scheduleChange': 'שינוי בלו״ז השבועי',
  'session.cancelReason.closure': 'המועדון סגור',
  'session.editTime': 'שינוי שעה',
  'session.save': 'שמירה',
  'session.saved': 'השיעור עודכן',
  'session.adHocStart': 'שעת התחלה',
  'session.adHocEnd': 'שעת סיום',
  'session.adHocDate': 'תאריך',

  // -- holiday presets, by key (D-M2-4) -------------------------------------------
  'closure.preset.rosh_hashanah': 'ראש השנה',
  'closure.preset.yom_kippur': 'יום כיפור',
  'closure.preset.sukkot': 'סוכות',
  'closure.preset.pesach': 'פסח',
  'closure.preset.yom_haatzmaut': 'יום העצמאות',
  'closure.preset.shavuot': 'שבועות',
  'closure.preset.summer_break': 'חופש גדול',
  'closure.cancelled': 'בוטלו {{count}} שיעורים',

  // -- the parent's month (12b) ----------------------------------------------------
  'calendar.title': 'לוח הילד',
  'calendar.previousMonth': 'חודש קודם',
  'calendar.nextMonth': 'חודש הבא',
  'calendar.upcoming': 'שיעורים קרובים',
  'calendar.past': 'שיעורים שהיו',
  'calendar.empty': 'אין שיעורים בחודש הזה',
  'calendar.emptyHint': 'לוח השיעורים נקבע על ידי המועדון',

  // -- groups and cycles (4b) ------------------------------------------------------
  'groups.title': 'קבוצות ומחזורים',
  'groups.weeklySchedule': 'לו״ז שבועי',
  'groups.nextSession': 'השיעור הבא',
  'groups.noNextSession': 'אין שיעור מתוכנן',
  'groups.unscheduledStudents': 'תלמידים ללא יום',
  'groups.beltRangeComesLater': 'טווח החגורות יוצג עם מערכת החגורות',
  'groups.capacityComesLater': 'תפוסה תוצג עם רשימת החניכים',
  'groups.empty': 'לא הוגדרו קבוצות',

  // -- the group page (6a) ---------------------------------------------------------
  'group.scheduleTitle': 'לו״ז הקבוצה',
  'group.sessions': 'שיעורים',
  'group.changeFrom': 'השינוי בתוקף מתאריך',
  'group.reviewChange': 'בדיקת השינוי',
  'group.noActiveYear': 'לא הוגדרה שנת פעילות פעילה',
  'group.noActiveYearHint': 'שנת פעילות פעילה נדרשת לפני קביעת לו״ז',
```

- [ ] **Step 3: Mirror every key into `en/schedule.ts` and `ru/schedule.ts`**

English (the strict locale — every key above must appear):

```ts
  'impact.studentsUnscheduled': '{{count}} students are left with no training day',
  'impact.studentsUnscheduledOne': 'One student is left with no training day',
  'impact.studentsUnscheduledHint':
    'A student with no training day drops off the register and is never counted absent',
  'impact.studentsUnscheduledIcon': 'Warning',
  'impact.protectedManualList': 'Manually edited sessions',
  'impact.close': 'Close',
  'session.cancelReason.scheduleChange': 'Weekly schedule changed',
  'session.cancelReason.closure': 'The club is closed',
  'session.editTime': 'Change the time',
  'session.save': 'Save',
  'session.saved': 'Session updated',
  'session.adHocStart': 'Start time',
  'session.adHocEnd': 'End time',
  'session.adHocDate': 'Date',
  'closure.preset.rosh_hashanah': 'Rosh Hashanah',
  'closure.preset.yom_kippur': 'Yom Kippur',
  'closure.preset.sukkot': 'Sukkot',
  'closure.preset.pesach': 'Passover',
  'closure.preset.yom_haatzmaut': 'Independence Day',
  'closure.preset.shavuot': 'Shavuot',
  'closure.preset.summer_break': 'Summer break',
  'closure.cancelled': '{{count}} sessions cancelled',
  'calendar.title': "My child's calendar",
  'calendar.previousMonth': 'Previous month',
  'calendar.nextMonth': 'Next month',
  'calendar.upcoming': 'Upcoming sessions',
  'calendar.past': 'Past sessions',
  'calendar.empty': 'No sessions this month',
  'calendar.emptyHint': 'The club sets the lesson schedule',
  'groups.title': 'Groups and cycles',
  'groups.weeklySchedule': 'Weekly schedule',
  'groups.nextSession': 'Next session',
  'groups.noNextSession': 'No session scheduled',
  'groups.unscheduledStudents': 'Students with no day',
  'groups.beltRangeComesLater': 'Belt range appears with the belt system',
  'groups.capacityComesLater': 'Capacity appears with the student roster',
  'groups.empty': 'No groups yet',
  'group.scheduleTitle': "The group's schedule",
  'group.sessions': 'Sessions',
  'group.changeFrom': 'The change takes effect from',
  'group.reviewChange': 'Review the change',
  'group.noActiveYear': 'No active training year',
  'group.noActiveYearHint': 'An active training year is needed before setting a schedule',
```

Russian (`report`, not `strict` — still translated, because a half-done locale is how a
locale stays half-done):

```ts
  'impact.studentsUnscheduled': '{{count}} учеников остаются без дня занятий',
  'impact.studentsUnscheduledOne': 'Один ученик остаётся без дня занятий',
  'impact.studentsUnscheduledHint':
    'Ученик без дня занятий исчезает из журнала и не считается отсутствующим',
  'impact.studentsUnscheduledIcon': 'Предупреждение',
  'impact.protectedManualList': 'Занятия, изменённые вручную',
  'impact.close': 'Закрыть',
  'session.cancelReason.scheduleChange': 'Изменение недельного расписания',
  'session.cancelReason.closure': 'Клуб закрыт',
  'session.editTime': 'Изменить время',
  'session.save': 'Сохранить',
  'session.saved': 'Занятие обновлено',
  'session.adHocStart': 'Начало',
  'session.adHocEnd': 'Окончание',
  'session.adHocDate': 'Дата',
  'closure.preset.rosh_hashanah': 'Рош ха-Шана',
  'closure.preset.yom_kippur': 'Йом-Кипур',
  'closure.preset.sukkot': 'Суккот',
  'closure.preset.pesach': 'Песах',
  'closure.preset.yom_haatzmaut': 'День независимости',
  'closure.preset.shavuot': 'Шавуот',
  'closure.preset.summer_break': 'Летние каникулы',
  'closure.cancelled': 'Отменено занятий: {{count}}',
  'calendar.title': 'Расписание ребёнка',
  'calendar.previousMonth': 'Предыдущий месяц',
  'calendar.nextMonth': 'Следующий месяц',
  'calendar.upcoming': 'Ближайшие занятия',
  'calendar.past': 'Прошедшие занятия',
  'calendar.empty': 'В этом месяце занятий нет',
  'calendar.emptyHint': 'Расписание занятий устанавливает клуб',
  'groups.title': 'Группы и циклы',
  'groups.weeklySchedule': 'Недельное расписание',
  'groups.nextSession': 'Следующее занятие',
  'groups.noNextSession': 'Занятий не запланировано',
  'groups.unscheduledStudents': 'Ученики без дня',
  'groups.beltRangeComesLater': 'Диапазон поясов появится вместе с системой поясов',
  'groups.capacityComesLater': 'Заполненность появится вместе со списком учеников',
  'groups.empty': 'Группы не заданы',
  'group.scheduleTitle': 'Расписание группы',
  'group.sessions': 'Занятия',
  'group.changeFrom': 'Изменение вступает в силу с',
  'group.reviewChange': 'Проверить изменение',
  'group.noActiveYear': 'Нет активного учебного года',
  'group.noActiveYearHint': 'Перед настройкой расписания нужен активный учебный год',
```

- [ ] **Step 4: Run parity and confirm it is green**

```bash
node web/scripts/i18n-parity.mjs schedule
```
Expected: `✅ i18n parity · schedule`. A missing `en` key is a hard error here, so a red
result names exactly which one.

- [ ] **Step 5: Commit**

```bash
git add web/packages/i18n/he/schedule.ts web/packages/i18n/en/schedule.ts web/packages/i18n/ru/schedule.ts
git commit -m "i18n(schedule): the strings the seven W2 artboards render, including C12's warning"
```

---

### Task 10: Dashboard `6a` — the group page and §5.6's impact dialog

**The lane's centrepiece.** The dialog is where the invariant becomes visible to a human,
and where C12 lands.

**Files:**
- Create: `web/apps/dashboard/src/features/schedule/client.ts`
- Create: `web/apps/dashboard/src/features/schedule/ImpactDialog.tsx`
- Create: `web/apps/dashboard/src/features/schedule/ImpactDialog.test.tsx`
- Create: `web/apps/dashboard/src/features/schedule/GroupSchedulePage.tsx`
- Create: `web/apps/dashboard/src/features/schedule/GroupSchedulePage.test.tsx`

**Interfaces:**
- Consumes: Task 6's `PUT /groups/{id}/schedule`, Task 7's `GET /sessions`, Task 9's keys.
- Produces:
  - `client.ts`: `ScheduleClient` interface, `makeScheduleClient(fetcher)`, and the response
    types `SessionRow`, `ScheduleRule`, `ImpactPreview`, `TrainingYear`, `Closure`,
    `HolidayPreset`, plus `fill(template, values)` and `cancelReasonLabel(locale, reason)`.
  - `ImpactDialog` and `GroupSchedulePage` React components.
- **Test ids are fixed by `e2e/05-schedule-change.spec.ts`** and must match exactly:
  `weekly-rules`, `rule-row`, `start-time`, `save-rules`, `impact-preview`,
  `impact-subtitle`, `protected-past`, `protected-manual`, `protected-adhoc`,
  `first-affected-date`, `confirm`, `session-row`, `session-time`.

- [ ] **Step 1: Write the client seam**

`web/apps/dashboard/src/features/schedule/client.ts`:

```ts
// The schedule vertical's own view of the API.
//
// **Why these types are declared here and not imported from `@studio/api-client`.** That
// package is generated from `openapi.json`, and `openapi.json` is regenerated on `main`
// after both W2 lanes merge — regenerating it inside one lane guarantees a conflict with
// the other in a file neither of them owns. `packages/ui/src/setup-wizard/client.ts`
// already takes the same route for the same reason. When the client is regenerated, these
// interfaces become a compile-time cross-check of it rather than dead weight.
//
// The fetcher is injected rather than imported so a test can drive the screen without a
// network, which is also what `SetupClient` does.
import type { Locale } from '@studio/i18n'
import { t } from '@studio/i18n'

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

export interface SessionStaff {
  person_id: string
  display_name: string
  role: 'lead_coach' | 'assistant_coach'
  is_substitute: boolean
}

export interface SessionRow {
  id: string
  group_id: string
  group_name: string
  training_year_id: string
  starts_at: string
  ends_at: string
  location_id: string | null
  location_name: string | null
  status: 'scheduled' | 'cancelled' | 'completed'
  is_manually_edited: boolean
  is_ad_hoc: boolean
  cancel_reason: string | null
  staff: SessionStaff[]
  attendance_taken: boolean
}

export interface ScheduleRule {
  id?: string
  group_id?: string
  weekday: number
  start_time: string
  end_time: string
  location_id: string | null
  effective_from: string
  effective_to?: string | null
}

export interface ProtectedSession {
  id: string
  starts_at: string
  ends_at: string
}

export interface ImpactPreview {
  sessions_to_create: number
  sessions_to_update: number
  sessions_to_cancel: number
  sessions_protected_past: number
  sessions_protected_manually_edited: number
  sessions_protected_ad_hoc: number
  first_affected_date: string | null
  protected_manually_edited_sessions: ProtectedSession[]
  students_left_unscheduled: number
}

export interface HolidayPreset {
  key: string
  name: string
  date_from: string
  date_to: string
}

export interface TrainingYear {
  id: string
  name: string
  starts_on: string
  ends_on: string
  status: 'draft' | 'active' | 'closed'
}

export interface Closure {
  id: string
  training_year_id: string
  date_from: string
  date_to: string
  reason: string
  source: 'holiday_preset' | 'manual'
}

export interface ScheduleClient {
  listSessions(query: { from: string; to: string; groupId?: string; coachPersonId?: string }): Promise<SessionRow[]>
  getSchedule(groupId: string): Promise<ScheduleRule[]>
  putSchedule(
    groupId: string,
    body: { rules: ScheduleRule[]; effective_from: string; apply: boolean },
  ): Promise<ImpactPreview>
  listTrainingYears(): Promise<TrainingYear[]>
  listClosures(trainingYearId: string): Promise<Closure[]>
  createClosure(body: Omit<Closure, 'id'>): Promise<{ sessions_cancelled: number }>
  listHolidayPresets(year: number): Promise<HolidayPreset[]>
}

const API = '/api/v1'

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(String(response.status))
  return (await response.json()) as T
}

export function makeScheduleClient(fetcher: Fetcher): ScheduleClient {
  return {
    async listSessions({ from, to, groupId, coachPersonId }) {
      const params = new URLSearchParams({ from, to })
      if (groupId) params.set('group_id', groupId)
      if (coachPersonId) params.set('coach_person_id', coachPersonId)
      const body = await json<{ items: SessionRow[] }>(
        await fetcher(`${API}/sessions?${params.toString()}`),
      )
      return body.items
    },
    async getSchedule(groupId) {
      const body = await json<{ rules: ScheduleRule[] }>(
        await fetcher(`${API}/groups/${groupId}/schedule`),
      )
      return body.rules
    },
    async putSchedule(groupId, body) {
      return json<ImpactPreview>(
        await fetcher(`${API}/groups/${groupId}/schedule`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      )
    },
    async listTrainingYears() {
      const body = await json<{ items: TrainingYear[] }>(await fetcher(`${API}/training-years`))
      return body.items
    },
    async listClosures(trainingYearId) {
      const body = await json<{ items: Closure[] }>(
        await fetcher(`${API}/closures?training_year_id=${trainingYearId}`),
      )
      return body.items
    },
    async createClosure(body) {
      return json<{ sessions_cancelled: number }>(
        await fetcher(`${API}/closures`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      )
    },
    async listHolidayPresets(year) {
      return json<HolidayPreset[]>(await fetcher(`${API}/holiday-presets?year=${year}`))
    },
  }
}

/** `t()` returns the raw string; the `{{count}}` convention is filled here. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, key) =>
    key in values ? String(values[key]) : whole,
  )
}

/**
 * D-M2-3 — a cancellation the server generated writes `system:schedule_change` or
 * `system:closure`; a manager's reason is the text they typed. Mapping the tokens here is
 * what keeps `app/` free of a second Hebrew string table §9 cannot reach.
 */
export function cancelReasonLabel(locale: Locale, reason: string | null): string {
  if (!reason) return ''
  if (reason === 'system:schedule_change') return t(locale, 'schedule.session.cancelReason.scheduleChange')
  if (reason === 'system:closure') return t(locale, 'schedule.session.cancelReason.closure')
  return reason
}
```

- [ ] **Step 2: Write the failing dialog test**

`web/apps/dashboard/src/features/schedule/ImpactDialog.test.tsx`:

```tsx
// §5.6's dialog: "showing exactly what will change before it changes."
//
// The test ids here are not free choices — `e2e/05-schedule-change.spec.ts` names them, and
// a rename here silently un-gates E2E-5.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ImpactDialog } from './ImpactDialog'
import type { ImpactPreview } from './client'

const EMPTY: ImpactPreview = {
  sessions_to_create: 0,
  sessions_to_update: 0,
  sessions_to_cancel: 0,
  sessions_protected_past: 0,
  sessions_protected_manually_edited: 0,
  sessions_protected_ad_hoc: 0,
  first_affected_date: null,
  protected_manually_edited_sessions: [],
  students_left_unscheduled: 0,
}

const FULL: ImpactPreview = {
  ...EMPTY,
  sessions_to_create: 4,
  sessions_to_update: 32,
  sessions_to_cancel: 1,
  sessions_protected_past: 18,
  sessions_protected_manually_edited: 2,
  sessions_protected_ad_hoc: 1,
  first_affected_date: '2026-11-17',
  protected_manually_edited_sessions: [
    { id: 'a', starts_at: '2026-11-15T16:00:00Z', ends_at: '2026-11-15T17:30:00Z' },
    { id: 'b', starts_at: '2026-11-22T16:00:00Z', ends_at: '2026-11-22T18:00:00Z' },
  ],
  students_left_unscheduled: 3,
}

function renderDialog(preview: ImpactPreview, props = {}) {
  return render(
    <ImpactDialog
      locale="he"
      preview={preview}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
      {...props}
    />,
  )
}

describe('ImpactDialog', () => {
  it('says the change applies only to future sessions, in the exact words E2E-5 asserts', () => {
    renderDialog(FULL)
    expect(screen.getByTestId('impact-subtitle')).toHaveTextContent(
      'השינוי יחול על שיעורים עתידיים בלבד',
    )
  })

  it('names the three protections separately rather than summing them', () => {
    // "12 sessions will change" tells a manager nothing about whether last month survived.
    renderDialog(FULL)
    expect(screen.getByTestId('protected-past')).toHaveTextContent('18')
    expect(screen.getByTestId('protected-manual')).toHaveTextContent('2')
    expect(screen.getByTestId('protected-adhoc')).toHaveTextContent('1')
  })

  it('lists the manually edited sessions by date, not merely by count', () => {
    renderDialog(FULL)
    const listed = screen.getAllByTestId('protected-manual-session')
    expect(listed).toHaveLength(2)
    expect(listed[0]).toHaveTextContent('16:00')
  })

  it('shows the first affected date', () => {
    renderDialog(FULL)
    expect(screen.getByTestId('first-affected-date')).toBeVisible()
  })

  it('warns about C12 with the count of students left with no day', () => {
    // C12 — the failure the dialog exists to prevent, arriving from the other direction.
    renderDialog(FULL)
    const warning = screen.getByTestId('students-unscheduled')
    expect(warning).toHaveTextContent('3')
    expect(warning).toHaveTextContent(t('he', 'schedule.impact.studentsUnscheduledHint'))
  })

  it('uses the singular sentence for exactly one stranded student', () => {
    renderDialog({ ...FULL, students_left_unscheduled: 1 })
    expect(screen.getByTestId('students-unscheduled')).toHaveTextContent(
      t('he', 'schedule.impact.studentsUnscheduledOne'),
    )
  })

  it('shows no C12 warning when nobody is stranded', () => {
    renderDialog({ ...FULL, students_left_unscheduled: 0 })
    expect(screen.queryByTestId('students-unscheduled')).toBeNull()
  })

  it('gives the warning icon an accessible name rather than a bare glyph', () => {
    // A ⚠ inside a translated sentence is invisible to a screen reader, which is why the
    // string carries no glyph and the Alert primitive supplies the icon.
    renderDialog(FULL)
    expect(screen.getByLabelText(t('he', 'schedule.impact.studentsUnscheduledIcon'))).toBeInTheDocument()
  })

  it('says plainly when nothing changes, instead of showing four zeroes', () => {
    renderDialog(EMPTY)
    expect(screen.getByText(t('he', 'schedule.impact.nothingChanges'))).toBeInTheDocument()
  })

  it('confirms and cancels through the callbacks', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    renderDialog(FULL, { onConfirm, onCancel })
    await userEvent.click(screen.getByTestId('confirm'))
    expect(onConfirm).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByTestId('impact-cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('is a dialog with an accessible name and a heading', () => {
    renderDialog(FULL)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAccessibleName(t('he', 'schedule.impact.title'))
  })

  it('disables confirm while the change is being applied', () => {
    renderDialog(FULL, { busy: true })
    expect(screen.getByTestId('confirm')).toBeDisabled()
  })

  it('uses no physical CSS properties', () => {
    const { container } = renderDialog(FULL)
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
cd web && npx vitest run apps/dashboard/src/features/schedule/ImpactDialog.test.tsx --reporter=dot
```
Expected: `Failed to resolve import "./ImpactDialog"`.

- [ ] **Step 4: Write the dialog**

`web/apps/dashboard/src/features/schedule/ImpactDialog.tsx`:

```tsx
// Dashboard artboard 6a's confirmation step — §5.6's impact dialog, and E2E-5's gate.
//
// **The dialog is the invariant, made visible.** §5.6 spends a paragraph on the two
// categories a rule change never overwrites, and this is where a manager sees that promise
// before they rely on it. The three protections are rendered as three named rows rather
// than one total, because "32 sessions will change" does not answer "is last month safe".
//
// C12 is the fourth thing on the screen and the newest. A change can be perfectly correct
// about sessions and still empty the pattern of every student who only came on the day it
// moved — they drop off the roster and stop being counted absent, which looks exactly like
// the feature working.
import type { CSSProperties } from 'react'
import { Alert, Button, Card } from '@studio/ui'
import { formatDateInStudioZone, formatTimeInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { fill } from './client'
import type { ImpactPreview } from './client'

const dialogStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '34rem',
  inlineSize: '100%',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  paddingBlock: 'var(--space-2)',
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
}

const protectedRowStyle: CSSProperties = { ...rowStyle, color: 'var(--text-secondary)' }

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-3)',
  justifyContent: 'flex-end',
}

function Row({
  testId,
  label,
  value,
  muted = false,
}: {
  testId: string
  label: string
  value: number
  muted?: boolean
}) {
  return (
    <div data-testid={testId} style={muted ? protectedRowStyle : rowStyle}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

export function ImpactDialog({
  locale,
  preview,
  onConfirm,
  onCancel,
  busy = false,
}: {
  locale: Locale
  preview: ImpactPreview
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}) {
  const changes =
    preview.sessions_to_create + preview.sessions_to_update + preview.sessions_to_cancel
  const stranded = preview.students_left_unscheduled

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="impact-title"
      data-testid="impact-preview"
      style={dialogStyle}
    >
      <h2 id="impact-title">{t(locale, 'schedule.impact.title')}</h2>
      <p data-testid="impact-subtitle">{t(locale, 'schedule.impact.subtitle')}</p>

      {changes === 0 ? (
        <p>{t(locale, 'schedule.impact.nothingChanges')}</p>
      ) : (
        <Card>
          <Row
            testId="impact-create"
            label={t(locale, 'schedule.impact.toCreate')}
            value={preview.sessions_to_create}
          />
          <Row
            testId="impact-update"
            label={t(locale, 'schedule.impact.toUpdate')}
            value={preview.sessions_to_update}
          />
          <Row
            testId="impact-cancel-count"
            label={t(locale, 'schedule.impact.toCancel')}
            value={preview.sessions_to_cancel}
          />
        </Card>
      )}

      <Card>
        {/* §5.6's three protections, named. This is the half of the dialog a manager
            actually reads before pressing the button. */}
        <Row
          testId="protected-past"
          label={t(locale, 'schedule.impact.protectedPast')}
          value={preview.sessions_protected_past}
          muted
        />
        <Row
          testId="protected-manual"
          label={t(locale, 'schedule.impact.protectedManual')}
          value={preview.sessions_protected_manually_edited}
          muted
        />
        <Row
          testId="protected-adhoc"
          label={t(locale, 'schedule.impact.protectedAdHoc')}
          value={preview.sessions_protected_ad_hoc}
          muted
        />
      </Card>

      {preview.protected_manually_edited_sessions.length > 0 ? (
        <section aria-labelledby="protected-manual-title">
          <h3 id="protected-manual-title">{t(locale, 'schedule.impact.protectedManualList')}</h3>
          <ul>
            {preview.protected_manually_edited_sessions.map((session) => (
              <li key={session.id} data-testid="protected-manual-session">
                {formatDateInStudioZone(session.starts_at, locale)}
                {' · '}
                {formatTimeInStudioZone(session.starts_at, locale)}
                {'–'}
                {formatTimeInStudioZone(session.ends_at, locale)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {preview.first_affected_date ? (
        <p data-testid="first-affected-date">
          {t(locale, 'schedule.impact.firstAffected')}{' '}
          {formatDateInStudioZone(`${preview.first_affected_date}T12:00:00Z`, locale)}
        </p>
      ) : null}

      {stranded > 0 ? (
        // C12. `live` is on: this banner appears in response to something the manager just
        // did, which is exactly the case the Alert primitive reserves role="alert" for.
        <div data-testid="students-unscheduled">
          <Alert
            tone="danger"
            live
            iconLabel={t(locale, 'schedule.impact.studentsUnscheduledIcon')}
          >
            <strong>
              {stranded === 1
                ? t(locale, 'schedule.impact.studentsUnscheduledOne')
                : fill(t(locale, 'schedule.impact.studentsUnscheduled'), { count: stranded })}
            </strong>
            <p>{t(locale, 'schedule.impact.studentsUnscheduledHint')}</p>
          </Alert>
        </div>
      ) : null}

      <div style={actionsStyle}>
        <Button variant="secondary" onClick={onCancel} data-testid="impact-cancel">
          {t(locale, 'schedule.impact.cancel')}
        </Button>
        <Button onClick={onConfirm} disabled={busy} data-testid="confirm">
          {t(locale, 'schedule.impact.confirm')}
        </Button>
      </div>
    </div>
  )
}
```

`@studio/ui`'s `Button` was checked before this was written: it spreads `...rest` onto the
native element, so `data-testid` and `disabled` forward, `variant` accepts `'secondary'`,
and `type` already defaults to `"button"`. `Checkbox` (Task 12) spreads too and takes a
required `label`. Neither primitive needs a change — and `packages/ui` is not this lane's,
so if one ever does, the screen works around it here.

- [ ] **Step 5: Run the dialog test green**

```bash
cd web && npx vitest run apps/dashboard/src/features/schedule/ImpactDialog.test.tsx --reporter=dot
```
Expected: PASS, 13 tests.

- [ ] **Step 6: Write the failing group-page test**

`web/apps/dashboard/src/features/schedule/GroupSchedulePage.test.tsx`:

```tsx
// Dashboard artboard 6a — עמוד קבוצה בודדת: רשימה + עריכת לו״ז שבועי.
//
// The page's whole job is that a manager cannot change a schedule without reading what the
// change does first. `save-rules` opens the dialog; only `confirm` writes.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { GroupSchedulePage } from './GroupSchedulePage'
import type { ImpactPreview, ScheduleClient, ScheduleRule, SessionRow } from './client'

const RULES: ScheduleRule[] = [
  {
    id: 'r1',
    group_id: 'g1',
    weekday: 2,
    start_time: '17:00:00',
    end_time: '19:00:00',
    location_id: null,
    effective_from: '2026-09-01',
  },
]

const SESSIONS: SessionRow[] = [
  {
    id: 's-past', group_id: 'g1', group_name: 'מתחילים', training_year_id: 'y1',
    starts_at: '2026-10-06T15:00:00Z', ends_at: '2026-10-06T17:00:00Z',
    location_id: null, location_name: null, status: 'completed',
    is_manually_edited: false, is_ad_hoc: false, cancel_reason: null,
    staff: [], attendance_taken: false,
  },
  {
    id: 's-edited', group_id: 'g1', group_name: 'מתחילים', training_year_id: 'y1',
    starts_at: '2026-11-17T16:30:00Z', ends_at: '2026-11-17T18:30:00Z',
    location_id: null, location_name: null, status: 'scheduled',
    is_manually_edited: true, is_ad_hoc: false, cancel_reason: null,
    staff: [], attendance_taken: false,
  },
  {
    id: 's-adhoc', group_id: 'g1', group_name: 'מתחילים', training_year_id: 'y1',
    starts_at: '2026-12-11T08:00:00Z', ends_at: '2026-12-11T10:00:00Z',
    location_id: null, location_name: null, status: 'scheduled',
    is_manually_edited: true, is_ad_hoc: true, cancel_reason: null,
    staff: [], attendance_taken: false,
  },
  {
    id: 's-cancelled', group_id: 'g1', group_name: 'מתחילים', training_year_id: 'y1',
    starts_at: '2026-12-15T15:00:00Z', ends_at: '2026-12-15T17:00:00Z',
    location_id: null, location_name: null, status: 'cancelled',
    is_manually_edited: false, is_ad_hoc: false, cancel_reason: 'system:closure',
    staff: [], attendance_taken: false,
  },
]

const PREVIEW: ImpactPreview = {
  sessions_to_create: 0,
  sessions_to_update: 32,
  sessions_to_cancel: 0,
  sessions_protected_past: 18,
  sessions_protected_manually_edited: 1,
  sessions_protected_ad_hoc: 1,
  first_affected_date: '2026-11-17',
  protected_manually_edited_sessions: [
    { id: 's-edited', starts_at: '2026-11-17T16:30:00Z', ends_at: '2026-11-17T18:30:00Z' },
  ],
  students_left_unscheduled: 0,
}

function stubClient(overrides: Partial<ScheduleClient> = {}): ScheduleClient {
  return {
    listSessions: vi.fn(async () => SESSIONS),
    getSchedule: vi.fn(async () => RULES),
    putSchedule: vi.fn(async () => PREVIEW),
    listTrainingYears: vi.fn(async () => [
      { id: 'y1', name: 'תשפ״ז', starts_on: '2026-09-01', ends_on: '2027-06-30', status: 'active' as const },
    ]),
    listClosures: vi.fn(async () => []),
    createClosure: vi.fn(async () => ({ sessions_cancelled: 0 })),
    listHolidayPresets: vi.fn(async () => []),
    ...overrides,
  }
}

function renderPage(client = stubClient()) {
  render(<GroupSchedulePage locale="he" groupId="g1" groupName="מתחילים" client={client} />)
  return client
}

describe('GroupSchedulePage (6a)', () => {
  it('renders the weekly rules the group already has', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('weekly-rules')).toBeInTheDocument())
    const rows = screen.getAllByTestId('rule-row')
    expect(rows).toHaveLength(1)
    expect(screen.getByTestId('start-time')).toHaveValue('17:00')
  })

  it('renders a session row per session, in the studio timezone', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByTestId('session-row')).toHaveLength(4))
    // 16:30Z on 17 November is 18:30 in Jerusalem — winter, UTC+2.
    expect(screen.getAllByTestId('session-time')[1]).toHaveTextContent('18:30')
  })

  it('marks the sessions a rule change will not touch', async () => {
    // E2E-5 filters rows on exactly these labels.
    renderPage()
    await waitFor(() => expect(screen.getAllByTestId('session-row')).toHaveLength(4))
    expect(screen.getByText(t('he', 'schedule.session.manuallyEdited'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'schedule.session.adHoc'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'schedule.session.status.completed'))).toBeInTheDocument()
  })

  it('translates a system cancellation reason rather than printing the token', async () => {
    // D-M2-3 — the server writes `system:closure`; a human never sees that string.
    renderPage()
    await waitFor(() => expect(screen.getAllByTestId('session-row')).toHaveLength(4))
    expect(
      screen.getByText(t('he', 'schedule.session.cancelReason.closure')),
    ).toBeInTheDocument()
    expect(screen.queryByText('system:closure')).toBeNull()
  })

  it('previews before it applies — saving opens the dialog and writes nothing', async () => {
    const client = renderPage()
    await waitFor(() => expect(screen.getByTestId('weekly-rules')).toBeInTheDocument())

    await userEvent.clear(screen.getByTestId('start-time'))
    await userEvent.type(screen.getByTestId('start-time'), '18:00')
    await userEvent.click(screen.getByTestId('save-rules'))

    await waitFor(() => expect(screen.getByTestId('impact-preview')).toBeInTheDocument())
    expect(client.putSchedule).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ apply: false }),
    )
  })

  it('applies only after the manager confirms', async () => {
    const client = renderPage()
    await waitFor(() => expect(screen.getByTestId('weekly-rules')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('save-rules'))
    await waitFor(() => expect(screen.getByTestId('impact-preview')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('confirm'))
    await waitFor(() =>
      expect(client.putSchedule).toHaveBeenLastCalledWith(
        'g1',
        expect.objectContaining({ apply: true }),
      ),
    )
  })

  it('cancelling the dialog changes nothing', async () => {
    const client = renderPage()
    await waitFor(() => expect(screen.getByTestId('weekly-rules')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('save-rules'))
    await waitFor(() => expect(screen.getByTestId('impact-preview')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('impact-cancel'))
    await waitFor(() => expect(screen.queryByTestId('impact-preview')).toBeNull())
    expect(client.putSchedule).toHaveBeenCalledTimes(1)
    expect(client.putSchedule).not.toHaveBeenCalledWith('g1', expect.objectContaining({ apply: true }))
  })

  it('adds and removes a rule row', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('weekly-rules')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('add-rule'))
    expect(screen.getAllByTestId('rule-row')).toHaveLength(2)
    await userEvent.click(screen.getAllByTestId('remove-rule')[1])
    expect(screen.getAllByTestId('rule-row')).toHaveLength(1)
  })

  it('refuses a rule whose end is not after its start, before asking the server', async () => {
    const client = renderPage()
    await waitFor(() => expect(screen.getByTestId('weekly-rules')).toBeInTheDocument())
    await userEvent.clear(screen.getByTestId('end-time'))
    await userEvent.type(screen.getByTestId('end-time'), '16:00')
    await userEvent.click(screen.getByTestId('save-rules'))

    expect(await screen.findByText(t('he', 'schedule.rules.endBeforeStart'))).toBeInTheDocument()
    expect(client.putSchedule).not.toHaveBeenCalled()
  })

  it('says so when the studio has no active training year', async () => {
    renderPage(stubClient({ listTrainingYears: vi.fn(async () => []) }))
    expect(await screen.findByText(t('he', 'schedule.group.noActiveYear'))).toBeInTheDocument()
  })

  it('says the group has no schedule rather than showing an empty table', async () => {
    renderPage(stubClient({ getSchedule: vi.fn(async () => []), listSessions: vi.fn(async () => []) }))
    expect(await screen.findByText(t('he', 'schedule.rules.empty'))).toBeInTheDocument()
  })

  it('every field has a label and every control an accessible name', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('weekly-rules')).toBeInTheDocument())
    for (const control of screen.getAllByRole('combobox').concat(screen.getAllByRole('button'))) {
      expect(control).toHaveAccessibleName()
    }
    expect(screen.getByTestId('start-time')).toHaveAccessibleName()
  })

  it.each(['he', 'en'] as const)('renders in %s with no physical CSS', async (locale) => {
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr'
    const { container } = render(
      <GroupSchedulePage locale={locale} groupId="g1" groupName="מתחילים" client={stubClient()} />,
    )
    await waitFor(() => expect(screen.getByTestId('weekly-rules')).toBeInTheDocument())
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})
```

- [ ] **Step 7: Run it and confirm it fails, then write `GroupSchedulePage.tsx`**

```bash
cd web && npx vitest run apps/dashboard/src/features/schedule/GroupSchedulePage.test.tsx --reporter=dot
```
Expected: `Failed to resolve import "./GroupSchedulePage"`.

The component, in `web/apps/dashboard/src/features/schedule/GroupSchedulePage.tsx`:

```tsx
// Dashboard artboard 6a — עמוד קבוצה בודדת: רשימה + עריכת לו״ז שבועי.
//
// **A manager cannot change a schedule here without first reading what the change does.**
// `save-rules` sends `apply: false` and opens the dialog; only `confirm` sends
// `apply: true`. The server defaults `apply` to false for the same reason (§5.6), so the
// guarantee holds even if this component is bypassed — belt and braces, deliberately, on
// the one operation that can rewrite a year.
//
// Times are `<input type="time">` bound to the rule's naive local time, because that is
// what `group_schedule_rule` stores: a 17:00 class is 17:00 in November and 17:00 in June.
// Session times, by contrast, are UTC instants rendered through `@studio/core`'s
// Jerusalem-pinned formatter.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, EmptyState, StatusChip } from '@studio/ui'
import { formatDateInStudioZone, formatTimeInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { ImpactDialog } from './ImpactDialog'
import { cancelReasonLabel } from './client'
import type { ImpactPreview, ScheduleClient, ScheduleRule, SessionRow } from './client'

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
  inlineSize: '100%',
}

const ruleRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'end',
  gap: 'var(--space-3)',
  paddingBlock: 'var(--space-3)',
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
}

const sessionRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  paddingBlock: 'var(--space-2)',
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
}

/** `17:00:00` from the API, `17:00` in an `<input type="time">`. */
const toInput = (value: string): string => value.slice(0, 5)
const toApi = (value: string): string => (value.length === 5 ? `${value}:00` : value)

function blankRule(groupId: string, effectiveFrom: string): ScheduleRule {
  return {
    group_id: groupId,
    weekday: 0,
    start_time: '17:00:00',
    end_time: '18:00:00',
    location_id: null,
    effective_from: effectiveFrom,
  }
}

export function GroupSchedulePage({
  locale,
  groupId,
  groupName,
  client,
}: {
  locale: Locale
  groupId: string
  groupName: string
  client: ScheduleClient
}) {
  const [rules, setRules] = useState<ScheduleRule[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [year, setYear] = useState<{ id: string; starts_on: string; ends_on: string } | null>(null)
  const [noActiveYear, setNoActiveYear] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImpactPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [effectiveFrom, setEffectiveFrom] = useState('')

  useEffect(() => {
    let live = true
    void (async () => {
      const years = await client.listTrainingYears()
      const active = years.find((candidate) => candidate.status === 'active') ?? null
      if (!live) return
      if (!active) {
        setNoActiveYear(true)
        setLoaded(true)
        return
      }
      setYear(active)
      setEffectiveFrom(active.starts_on)
      const [loadedRules, loadedSessions] = await Promise.all([
        client.getSchedule(groupId),
        client.listSessions({ from: active.starts_on, to: active.ends_on, groupId }),
      ])
      if (!live) return
      setRules(loadedRules)
      setSessions(loadedSessions)
      setLoaded(true)
    })()
    return () => {
      live = false
    }
  }, [client, groupId])

  const updateRule = useCallback((index: number, patch: Partial<ScheduleRule>) => {
    setRules((current) =>
      current.map((rule, position) => (position === index ? { ...rule, ...patch } : rule)),
    )
  }, [])

  const requestPreview = useCallback(async () => {
    // Checked here as well as by the schema, because a 422 arrives as a red box with no
    // idea which of five rows was wrong.
    if (rules.some((rule) => toApi(rule.end_time) <= toApi(rule.start_time))) {
      setError(t(locale, 'schedule.rules.endBeforeStart'))
      return
    }
    setError(null)
    setBusy(true)
    try {
      setPreview(
        await client.putSchedule(groupId, {
          rules: rules.map((rule) => ({
            ...rule,
            start_time: toApi(rule.start_time),
            end_time: toApi(rule.end_time),
          })),
          effective_from: effectiveFrom,
          apply: false,
        }),
      )
    } finally {
      setBusy(false)
    }
  }, [client, effectiveFrom, groupId, locale, rules])

  const applyChange = useCallback(async () => {
    setBusy(true)
    try {
      await client.putSchedule(groupId, {
        rules: rules.map((rule) => ({
          ...rule,
          start_time: toApi(rule.start_time),
          end_time: toApi(rule.end_time),
        })),
        effective_from: effectiveFrom,
        apply: true,
      })
      if (year) {
        setSessions(
          await client.listSessions({ from: year.starts_on, to: year.ends_on, groupId }),
        )
        setRules(await client.getSchedule(groupId))
      }
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }, [client, effectiveFrom, groupId, rules, year])

  if (noActiveYear) {
    return (
      <EmptyState
        title={t(locale, 'schedule.group.noActiveYear')}
        description={t(locale, 'schedule.group.noActiveYearHint')}
      />
    )
  }

  return (
    <section aria-labelledby="group-schedule-title" style={pageStyle}>
      <h2 id="group-schedule-title">{groupName}</h2>

      <section aria-labelledby="rules-title">
        <h3 id="rules-title">{t(locale, 'schedule.rules.title')}</h3>
        {loaded && rules.length === 0 ? <p>{t(locale, 'schedule.rules.empty')}</p> : null}

        <div data-testid="weekly-rules">
          {rules.map((rule, index) => (
            <div key={rule.id ?? `new-${index}`} data-testid="rule-row" style={ruleRowStyle}>
              <label>
                {t(locale, 'schedule.rules.weekday')}
                <select
                  value={rule.weekday}
                  data-testid="weekday"
                  onChange={(event) => updateRule(index, { weekday: Number(event.target.value) })}
                >
                  {WEEKDAYS.map((day) => (
                    <option key={day} value={day}>
                      {t(locale, `schedule.weekday.${day}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t(locale, 'schedule.rules.startTime')}
                <input
                  type="time"
                  data-testid="start-time"
                  value={toInput(rule.start_time)}
                  onChange={(event) => updateRule(index, { start_time: event.target.value })}
                />
              </label>
              <label>
                {t(locale, 'schedule.rules.endTime')}
                <input
                  type="time"
                  data-testid="end-time"
                  value={toInput(rule.end_time)}
                  onChange={(event) => updateRule(index, { end_time: event.target.value })}
                />
              </label>
              <Button
                variant="secondary"
                data-testid="remove-rule"
                onClick={() => setRules((current) => current.filter((_, at) => at !== index))}
              >
                {t(locale, 'schedule.rules.remove')}
              </Button>
            </div>
          ))}
        </div>

        <Button
          variant="secondary"
          data-testid="add-rule"
          onClick={() =>
            setRules((current) => [...current, blankRule(groupId, effectiveFrom)])
          }
        >
          {t(locale, 'schedule.rules.add')}
        </Button>

        <label>
          {t(locale, 'schedule.group.changeFrom')}
          <input
            type="date"
            data-testid="effective-from"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
          />
        </label>

        {error ? <p role="alert">{error}</p> : null}

        <Button data-testid="save-rules" disabled={busy} onClick={() => void requestPreview()}>
          {t(locale, 'schedule.group.reviewChange')}
        </Button>
      </section>

      <section aria-labelledby="sessions-title">
        <h3 id="sessions-title">{t(locale, 'schedule.group.sessions')}</h3>
        {sessions.map((session) => (
          <div key={session.id} data-testid="session-row" style={sessionRowStyle}>
            <span>{formatDateInStudioZone(session.starts_at, locale)}</span>
            <span data-testid="session-time">
              {formatTimeInStudioZone(session.starts_at, locale)}
              {'–'}
              {formatTimeInStudioZone(session.ends_at, locale)}
            </span>
            <StatusChip
              status={session.status === 'cancelled' ? 'cancelled' : 'planned'}
              label={t(locale, `schedule.session.status.${session.status}`)}
            />
            {session.is_manually_edited && !session.is_ad_hoc ? (
              <span>{t(locale, 'schedule.session.manuallyEdited')}</span>
            ) : null}
            {session.is_ad_hoc ? <span>{t(locale, 'schedule.session.adHoc')}</span> : null}
            {session.cancel_reason ? (
              <span>{cancelReasonLabel(locale, session.cancel_reason)}</span>
            ) : null}
          </div>
        ))}
      </section>

      {preview ? (
        <ImpactDialog
          locale={locale}
          preview={preview}
          busy={busy}
          onConfirm={() => void applyChange()}
          onCancel={() => setPreview(null)}
        />
      ) : null}
    </section>
  )
}
```

- [ ] **Step 8: Run both frontend tests green**

```bash
cd web && npx vitest run apps/dashboard/src/features/schedule --reporter=dot
```
Expected: PASS.

- [ ] **Step 9: Lint, typecheck, commit**

```bash
cd web && npx eslint apps/dashboard/src/features/schedule && npx tsc --noEmit
git add web/apps/dashboard/src/features/schedule
git commit -m "feat(schedule): dashboard 6a — the group schedule editor and §5.6's impact dialog"
```

---

### Task 11: Dashboard `3a` — the weekly board

`3a` לוח שבועי עם תפריט הצד. D5: "Dashboard is a superset of the staff app, and contains a
calendar." The session block "surfaces coverage and completion — is a coach assigned, is it
cancelled, has attendance been taken — *not* registration counts."

**Files:**
- Create: `web/apps/dashboard/src/features/schedule/WeekBoard.tsx`
- Test: `web/apps/dashboard/src/features/schedule/WeekBoard.test.tsx`

**Interfaces:**
- Consumes: Task 10's `client.ts` (`ScheduleClient`, `SessionRow`, `cancelReasonLabel`).
- Produces: `WeekBoard`, and `weekStart(iso: string): string` / `weekDays(startIso: string): string[]`
  exported for the test and reused by Task 14.

- [ ] **Step 1: Write the failing test**

`WeekBoard.test.tsx`. The assertions, each with the reason it exists:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { WeekBoard, weekDays, weekStart } from './WeekBoard'
import type { ScheduleClient, SessionRow } from './client'

const TUESDAY_EVENING: SessionRow = {
  id: 's1', group_id: 'g1', group_name: 'מתחילים', training_year_id: 'y1',
  starts_at: '2026-11-03T15:00:00Z', ends_at: '2026-11-03T17:00:00Z',
  location_id: null, location_name: 'אולם א׳', status: 'scheduled',
  is_manually_edited: false, is_ad_hoc: false, cancel_reason: null,
  staff: [{ person_id: 'p1', display_name: 'רון מאמן', role: 'lead_coach', is_substitute: false }],
  attendance_taken: false,
}

const LATE_EVENING: SessionRow = {
  ...TUESDAY_EVENING,
  id: 's2',
  // 22:30Z on 3 November is already 4 November in Jerusalem (winter, UTC+2 -> 00:30).
  starts_at: '2026-11-03T22:30:00Z',
  ends_at: '2026-11-03T23:30:00Z',
  staff: [],
}

function stub(sessions: SessionRow[] = [TUESDAY_EVENING]): ScheduleClient {
  return {
    listSessions: vi.fn(async () => sessions),
    getSchedule: vi.fn(async () => []),
    putSchedule: vi.fn(),
    listTrainingYears: vi.fn(async () => []),
    listClosures: vi.fn(async () => []),
    createClosure: vi.fn(),
    listHolidayPresets: vi.fn(async () => []),
  } as unknown as ScheduleClient
}

describe('weekStart', () => {
  it('starts the week on Sunday, matching group_schedule_rule.weekday', () => {
    // A Monday-based week would put every Sunday class in the previous column, which in
    // Israel is the first training day of the week.
    expect(weekStart('2026-11-03T12:00:00Z')).toBe('2026-11-01')
    expect(weekStart('2026-11-01T12:00:00Z')).toBe('2026-11-01')
  })

  it('gives seven consecutive days', () => {
    expect(weekDays('2026-11-01')).toEqual([
      '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04',
      '2026-11-05', '2026-11-06', '2026-11-07',
    ])
  })
})

describe('WeekBoard (3a)', () => {
  it('draws seven day columns', async () => {
    render(<WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />)
    await waitFor(() => expect(screen.getAllByTestId('week-day')).toHaveLength(7))
  })

  it('files a session under its Jerusalem day, not its UTC day', async () => {
    // 22:30Z is 00:30 the NEXT day here, and almost every class is in the evening.
    render(<WeekBoard locale="he" client={stub([LATE_EVENING])} today="2026-11-03T12:00:00Z" />)
    await waitFor(() =>
      expect(screen.getByTestId('week-day-2026-11-04')).toContainElement(
        screen.getByTestId('session-block'),
      ),
    )
  })

  it('shows the group, the time and the location on the block', async () => {
    render(<WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />)
    const block = await screen.findByTestId('session-block')
    expect(block).toHaveTextContent('מתחילים')
    // 15:00Z on 3 November is 17:00 in Jerusalem — winter, UTC+2.
    expect(block).toHaveTextContent('17:00')
    expect(block).toHaveTextContent('אולם א׳')
  })

  it('names the coach, and says so when none is assigned', async () => {
    // D5 — the block surfaces COVERAGE. §5.14's 'sessions without a coach' is this gap.
    const { unmount } = render(
      <WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />,
    )
    expect(await screen.findByText('רון מאמן')).toBeInTheDocument()
    unmount()

    render(
      <WeekBoard
        locale="he"
        client={stub([{ ...TUESDAY_EVENING, staff: [] }])}
        today="2026-11-03T12:00:00Z"
      />,
    )
    expect(await screen.findByText(t('he', 'schedule.session.noCoach'))).toBeInTheDocument()
  })

  it('marks a substitute distinctly from the regular coach', async () => {
    // `is_substitute` is a flag and not a third role, because a substitute lead coach is
    // still leading the session — so the roster has to say it separately.
    render(
      <WeekBoard
        locale="he"
        client={stub([
          {
            ...TUESDAY_EVENING,
            staff: [
              { person_id: 'p2', display_name: 'נועה', role: 'lead_coach', is_substitute: true },
            ],
          },
        ])}
        today="2026-11-03T12:00:00Z"
      />,
    )
    expect(await screen.findByText(t('he', 'schedule.session.substitute'))).toBeInTheDocument()
  })

  it('shows a cancelled session with its translated reason, never the system token', async () => {
    render(
      <WeekBoard
        locale="he"
        client={stub([
          { ...TUESDAY_EVENING, status: 'cancelled', cancel_reason: 'system:closure' },
        ])}
        today="2026-11-03T12:00:00Z"
      />,
    )
    expect(
      await screen.findByText(t('he', 'schedule.session.cancelReason.closure')),
    ).toBeInTheDocument()
    expect(screen.queryByText('system:closure')).toBeNull()
    expect(screen.getByTestId('session-block')).toHaveAttribute('data-status', 'cancelled')
  })

  it('moves a week back and forward, and jumps to today', async () => {
    const client = stub()
    render(<WeekBoard locale="he" client={client} today="2026-11-03T12:00:00Z" />)
    await userEvent.click(screen.getByTestId('week-previous'))
    await waitFor(() =>
      expect(client.listSessions).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: '2026-10-25', to: '2026-10-31' }),
      ),
    )
    await userEvent.click(screen.getByTestId('week-next'))
    await userEvent.click(screen.getByTestId('week-today'))
    await waitFor(() =>
      expect(client.listSessions).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: '2026-11-01', to: '2026-11-07' }),
      ),
    )
  })

  it('says the week is empty rather than drawing seven blank boxes', async () => {
    render(<WeekBoard locale="he" client={stub([])} today="2026-11-03T12:00:00Z" />)
    expect(await screen.findByText(t('he', 'schedule.today.empty'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'schedule.today.emptyHint'))).toBeInTheDocument()
  })

  it('never shows a registration count', async () => {
    // D5, verbatim: 'not registration counts'. Children are enrolled, not booking (§5.4),
    // so capacity is near-irrelevant here and a number would invite the wrong question.
    const { container } = render(
      <WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />,
    )
    await screen.findByTestId('session-block')
    expect(container.textContent).not.toMatch(/\d+\s*\/\s*\d+/)
  })

  it('gives every navigation control an accessible name', async () => {
    render(<WeekBoard locale="he" client={stub()} today="2026-11-03T12:00:00Z" />)
    await screen.findByTestId('session-block')
    for (const control of screen.getAllByRole('button')) {
      expect(control).toHaveAccessibleName()
    }
  })

  it.each(['he', 'en'] as const)('renders in %s with no physical CSS', async (locale) => {
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr'
    const { container } = render(
      <WeekBoard locale={locale} client={stub()} today="2026-11-03T12:00:00Z" />,
    )
    await screen.findByTestId('session-block')
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})
```

- [ ] **Step 2: Run it, confirm it fails, write `WeekBoard.tsx`, run it green**

```bash
cd web && npx vitest run apps/dashboard/src/features/schedule/WeekBoard.test.tsx --reporter=dot
```

The component: a `<div role="grid">` of seven `data-testid="week-day"` columns keyed
`week-day-<YYYY-MM-DD>` from `@studio/core`'s `studioDayKey`, a `data-testid="session-block"`
per session inside its day, a three-button toolbar (`week-previous`, `week-today`,
`week-next`), and `EmptyState` when the week holds nothing. Grid layout with
`gridTemplateColumns: 'repeat(7, minmax(0, 1fr))'` — a CSS grid flips with `dir` on its own,
which is exactly why G12 bans the physical properties that would not.

`today` is a prop, not `new Date()`: a component that read the clock could not be tested at
a fixed date, and every assertion above depends on the week being 1–7 November 2026.

- [ ] **Step 3: Lint, typecheck, commit**

```bash
cd web && npx eslint apps/dashboard/src/features/schedule && npx tsc --noEmit
git add web/apps/dashboard/src/features/schedule
git commit -m "feat(schedule): dashboard 3a — the weekly board, coverage not capacity"
```

---

---

## The shared frontend test harness (Tasks 12–15)

Tasks 10 and 11 write their test files out in full. Tasks 12–15 list **one bullet per
`it()`**, each carrying the reason that assertion exists — and every one of them is written
out as real code, using the harness below. It is stated once rather than repeated four
times because the boilerplate is identical and copying it would bury the assertions that
differ, which are the only interesting part of any of those files.

```tsx
// The three imports every schedule test file opens with.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { THEME_STORAGE_KEY, ThemeProvider } from '@studio/ui'
import { DIRECTION } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { ResolvedTheme } from '@studio/ui'
import type { SessionRow } from './client'

/** One realistic session. Every fixture in these files is a spread of this. */
export const A_SESSION: SessionRow = {
  id: 's1', group_id: 'g1', group_name: 'מתחילים', training_year_id: 'y1',
  starts_at: '2026-11-03T15:00:00Z', ends_at: '2026-11-03T17:00:00Z',
  location_id: null, location_name: 'אולם א׳', status: 'scheduled',
  is_manually_edited: false, is_ad_hoc: false, cancel_reason: null,
  staff: [], attendance_taken: false,
}

/** Every client method is a `vi.fn`, so any test can assert what the screen asked for. */
function stubClient<T extends object>(overrides: Partial<T> = {}, sessions = [A_SESSION]): T {
  return {
    listSessions: vi.fn(async () => sessions),
    getSchedule: vi.fn(async () => []),
    putSchedule: vi.fn(),
    listTrainingYears: vi.fn(async () => [
      { id: 'y1', name: 'תשפ״ז', starts_on: '2026-09-01', ends_on: '2027-06-30', status: 'active' },
    ]),
    listClosures: vi.fn(async () => []),
    createClosure: vi.fn(async () => ({ sessions_cancelled: 0 })),
    listHolidayPresets: vi.fn(async () => []),
    ...overrides,
  } as unknown as T
}

/** Locale and theme are set on the document, the way `ParentHome.test.tsx` does it. */
function renderIn(
  ui: React.ReactElement,
  { locale = 'he', theme = 'light' }: { locale?: Locale; theme?: ResolvedTheme } = {},
) {
  globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme)
  document.documentElement.lang = locale
  document.documentElement.dir = DIRECTION[locale]
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}

/** The G12 sweep every file ends with. */
function expectNoPhysicalCss(container: HTMLElement) {
  for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
    expect(node.getAttribute('style') ?? '').not.toMatch(
      /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
    )
  }
}
```

**`@studio/ui`'s own `testing.tsx` is deliberately not exported from the package** — it
pulls in `@testing-library/react`, which must never reach an app bundle — so the harness is
restated per app through the package's real exports, exactly as `ParentHome.test.tsx`
explains.

**Fixed dates, never `new Date()`.** Every screen takes `today` (or `month`) as a prop. A
component that read the clock could not be tested at a fixed date, and every DST and
day-boundary assertion in these files depends on the date being 3 November 2026.

### Task 12: Dashboard `4b` — groups and cycles, and the closure calendar

`4b` קבוצות ומחזורים — תפוסה, טווח חגורות ולו״ז. Two of those three columns belong to
milestones that have not run: belts are M7 and the roster is M3. **They ship as honest empty
states, not as invented numbers** — the discipline `web/apps/parent/src/features/home/ParentHome.tsx`
already set for artboard `1a`.

The closures panel lives here because `4b` and `6a` both reach it and E2E-5 drives it at
`/dashboard/closures`.

**Files:**
- Create: `web/apps/dashboard/src/features/schedule/GroupsAndCycles.tsx` + `.test.tsx`
- Create: `web/apps/dashboard/src/features/schedule/ClosuresPanel.tsx` + `.test.tsx`

**Interfaces:**
- Consumes: Task 10's `client.ts`.
- Produces: `GroupsAndCycles`, `ClosuresPanel`.
- Test ids fixed by E2E-5: `holiday-presets`, `preset-day`, `apply-presets`.

- [ ] **Step 1: Write the failing `ClosuresPanel` test**

The assertions, each with its reason:

- `renders a preset per §5.6 holiday, unticked` — E2E-5 asserts
  `expect(page.getByTestId('preset-day').first()).not.toBeChecked()`. **A preset that
  arrived ticked would be a closure applied on the manager's behalf**, which is the exact
  thing §5.6 forbids.
- `labels each preset from its key, not from the server's Hebrew` — D-M2-4. Assert the
  rendered label equals `t('en', 'schedule.closure.preset.yom_kippur')` when the locale is
  `en`, while the payload's `name` is Hebrew.
- `ticking presets and applying creates one closure per ticked day` — assert
  `createClosure` called once per checked preset with `source: 'holiday_preset'`.
- `applying nothing is refused with a message, not a silent no-op`
  (`schedule.closure.preset.none`).
- `reports how many sessions the closure cancelled` — `fill(t(locale,
  'schedule.closure.cancelled'), { count })`; §5.6 makes that consequence the manager's to
  see immediately.
- `adds a manual range with a reason` — `source: 'manual'`.
- `refuses a range that ends before it starts, before asking the server`.
- `lists existing closures with their source`.
- `every checkbox has a label and the fieldset a legend` — ui-rtl-a11y.md.
- `no physical CSS`, both locales.

- [ ] **Step 2: Write `ClosuresPanel.tsx`**

A `<fieldset>` per §5.6's proposal list with a `<legend>` of
`schedule.closure.preset.subtitle`, one `@studio/ui` `Checkbox` per preset carrying
`data-testid="preset-day"`, an `apply-presets` button, and a manual-range form beneath it.
The presets button that reveals the list is `data-testid="holiday-presets"`.

The panel takes `year: number` and calls `client.listHolidayPresets(year)`. **The copy is an
offer throughout** — `closure.preset.subtitle` is `סמנו את הימים שבהם המועדון סגור`, never a
statement that the club is closed.

- [ ] **Step 3: Write the failing `GroupsAndCycles` test**

- `lists one row per group with its class`
- `renders each group's weekly schedule as weekday + time` — the column that is genuinely
  this lane's.
- `shows the next upcoming session, in the studio timezone`
- `says there is no next session rather than showing a dash`
- `shows the count of students with no training day` — the same C12 number, surfaced where a
  manager browses groups rather than only inside a change dialog. It arrives from
  `putSchedule(..., apply: false)` with the group's **current** rules, which is a preview
  that changes nothing and reports the present state.
- `states that the belt range arrives with M7 rather than rendering an empty cell` —
  `schedule.groups.beltRangeComesLater`.
- `states that capacity arrives with the roster rather than inventing a number` —
  `schedule.groups.capacityComesLater`.
- `says there are no groups rather than showing an empty table`
- `is a table with a caption and column headers`
- `no physical CSS`, both locales.

- [ ] **Step 4: Run both green, lint, typecheck, commit**

```bash
cd web && npx vitest run apps/dashboard/src/features/schedule --reporter=dot
cd web && npx eslint apps/dashboard/src/features/schedule && npx tsc --noEmit
git add web/apps/dashboard/src/features/schedule
git commit -m "feat(schedule): dashboard 4b and the closure calendar — presets are ticked, never applied"
```

---

### Task 13: Staff `9a` / `1d` — היום

INVENTORY: `9a` היום — מסנן מאמן במקום פיצול מסכים · רצועת ימים · בהיר + כהה; `1d`
אפליקציית צוות — היום. **They are one screen at two fidelities**, the way `1a` and `2a` are,
and building two would give the same screen two owners. One component, and a test that says
so.

**Files:**
- Create: `web/apps/staff/src/features/schedule/client.ts` (the SessionRow half only —
  the staff app never puts a schedule)
- Create: `web/apps/staff/src/features/schedule/TodayScreen.tsx` + `.test.tsx`

**Interfaces:**
- Consumes: `GET /sessions?from&to&coach_person_id`.
- Produces: `TodayScreen`, `StaffScheduleClient`, `makeStaffScheduleClient(fetcher)`.

- [ ] **Step 1: Write `client.ts`**

The same `SessionRow` interface and `cancelReasonLabel` helper as Task 10, plus
`listSessions` only. Copied rather than shared because `web/packages/core` is not this
lane's to extend and a cross-app import from `apps/dashboard` would be worse than a
duplicate: it would couple two deployables. A header comment says exactly that, and names
`@studio/api-client` as where this consolidates once `main` regenerates it.

- [ ] **Step 2: Write the failing test**

- `renders today's sessions in the studio timezone` — a 15:00Z session shows `17:00`.
- `files a 22:30Z session under tomorrow` — the evening-class bug, again, on the surface
  where a coach would actually be bitten by it.
- `renders a day strip of seven days centred on today, and today is marked` —
  `aria-current="date"` on the selected day. §6.2's strip reads forward and back.
- `choosing a day in the strip refetches that day`
- `filters by coach instead of splitting the screen` — 9a's headline. Choosing a coach calls
  `listSessions` with `coachPersonId`; choosing כל המאמנים clears it.
- `defaults to the signed-in coach's own sessions when they are a coach` — a coach opening
  the app wants their day, not the club's.
- `a manager sees every session by default` — the same screen, both roles, which is what
  "מסנן מאמן במקום פיצול מסכים" means.
- `says there are no sessions today, and why` — `today.empty` + `today.emptyHint`.
- `shows the cancelled state and the translated reason`
- `marks a manually edited session, so a coach can see the schedule will not overwrite it` —
  `session.manuallyEditedHint`.
- `every row is at least 44px tall` — §6.2's thumb rule; assert the inline style's
  `minBlockSize`.
- `renders light and dark` — `9a` is drawn בהיר + כהה, so the test walks both via
  `ThemeProvider` and `THEME_STORAGE_KEY`, exactly as `ParentHome.test.tsx` does.
- `no physical CSS`, both locales.

- [ ] **Step 3: Write `TodayScreen.tsx`, run green, lint, typecheck, commit**

```bash
cd web && npx vitest run apps/staff/src/features/schedule --reporter=dot
cd web && npx eslint apps/staff/src/features/schedule && npx tsc --noEmit
git add web/apps/staff/src/features/schedule
git commit -m "feat(schedule): staff 9a/1d היום — one screen, coach filter, day strip"
```

---

### Task 14: Staff `9b` — בחירת תאריך

`9b` בחירת תאריך — יומן מלא, טווח, קפיצה. `@studio/ui` already ships `DateRangePicker`;
this screen composes it, and does not reimplement it.

**Files:**
- Create: `web/apps/staff/src/features/schedule/DatePickerScreen.tsx` + `.test.tsx`

**Interfaces:**
- Consumes: Task 13's client; `DateRangePicker` from `@studio/ui`.
- Produces: `DatePickerScreen`, called by `TodayScreen`'s `datePicker.title` control.

- [ ] **Step 1: Read the primitive's props before writing a line**

```bash
sed -n '1,80p' web/packages/ui/src/primitives/DateRangePicker.tsx
```
`packages/ui` is not this lane's. If the primitive cannot express something `9b` needs, the
screen works around it here — it does not grow a prop there.

- [ ] **Step 2: Write the failing test**

- `renders a full month grid with Sunday first` — the same Sunday-first rule as everything
  else in the lane; a Monday-first calendar in an Israeli club is a daily papercut.
- `marks days that have sessions` — a date picker that cannot show where the lessons are is
  a date picker for a diary, not for a dojo.
- `jumps to today` — `datePicker.jumpToToday`.
- `selects a single day and reports it`
- `selects a range and reports both ends` — `datePicker.range` / `from` / `to`.
- `refuses a range whose end precedes its start` before reporting anything.
- `clear resets the selection`
- `every day button has an accessible name carrying the full date` — a screen reader hearing
  "14" cannot tell which month.
- `the selected day carries aria-current="date"`
- `no physical CSS`, both locales.

- [ ] **Step 3: Write the screen, run green, lint, typecheck, commit**

```bash
cd web && npx vitest run apps/staff/src/features/schedule --reporter=dot
cd web && npx eslint apps/staff/src/features/schedule && npx tsc --noEmit
git add web/apps/staff/src/features/schedule
git commit -m "feat(schedule): staff 9b — full-month date picker, Sunday first"
```

---

### Task 15: Parent `12b` — לוח הילד

`12b` לוח הילד — חודש שלם, כולל נוכחות שהייתה. **The attendance half is M5's** and ships as
a stated gap rather than as an empty column: a parent who opens this before attendance
exists should read that it arrives later, not see a blank space that looks broken.

§5.6's change is only real when the family sees it. A schedule change that updates the
dashboard and not the parent app is how a child arrives an hour early.

**Files:**
- Create: `web/apps/parent/src/features/schedule/client.ts`
- Create: `web/apps/parent/src/features/schedule/ChildCalendar.tsx` + `.test.tsx`

**Interfaces:**
- Consumes: `GET /sessions?from&to` — the guardian branch from Task 7, which narrows to the
  groups this parent's children are enrolled in. **The screen sends no `group_id` and no
  student id**: authorization is the server's, and a client that named its own scope would
  be a client that could name someone else's.
- Produces: `ChildCalendar`, `ParentScheduleClient`.

- [ ] **Step 1: Write the failing test**

- `renders a whole month, Sunday first` — `12b` is חודש שלם.
- `splits upcoming from past` — `calendar.upcoming` / `calendar.past`, because a parent
  checking the night before and a parent checking what happened want different halves.
- `renders every time in Asia/Jerusalem regardless of locale` — assert the same `17:00` for
  `he`, `en` and `ru`. A guardian abroad reading in English must not see a different hour.
- `files a 22:30Z session under the next day`
- `shows a schedule change — the new time on a future lesson and the old one on a past
  lesson` — E2E-5's second scenario, at component level: given a past session at 15:00Z and
  a future one at 16:00Z, the past row still reads 17:00 and the future reads 18:00.
- `shows a cancelled lesson with its translated reason, not the system token`
- `moves month by month` — `calendar.previousMonth` / `calendar.nextMonth`, and the fetch
  range follows.
- `says the month is empty and why` — `calendar.empty` + `calendar.emptyHint`.
- `states that past attendance arrives with M5 rather than rendering an empty column`
- `never shows another family's group` — the client is called with no `group_id`, asserted
  directly, because the temptation to "help" the server filter is exactly how a parent app
  leaks a roster.
- `renders light and dark`, `no physical CSS`, both locales, `every control has an
  accessible name`.

- [ ] **Step 2: Write the screen, run green, lint, typecheck, commit**

```bash
cd web && npx vitest run apps/parent/src/features/schedule --reporter=dot
cd web && npx eslint apps/parent/src/features/schedule && npx tsc --noEmit
git add web/apps/parent/src/features/schedule
git commit -m "feat(schedule): parent 12b — the child's month, in Jerusalem time"
```

---

### Task 16: Wire the routes, tick the milestone, and run the lane check

**Files:**
- Modify: `web/apps/dashboard/src/App.tsx` (sanctioned exception 4)
- Modify: `web/apps/staff/src/App.tsx`
- Modify: `web/apps/parent/src/App.tsx`
- Modify: `docs/plan/state.yaml`

- [ ] **Step 1: Add one NAV entry and one route branch per app**

Purely additive; nothing existing moves. Dashboard, in `App.tsx`:

```tsx
const NAV = [
  { key: 'schedule', labelKey: 'schedule.week.title', href: '#/schedule' },
  { key: 'groups', labelKey: 'schedule.groups.title', href: '#/groups' },
  { key: 'closures', labelKey: 'schedule.closure.title', href: '#/closures' },
  { key: 'staff', labelKey: 'common.dash.nav.staff', href: '#/staff' },
  { key: 'settings', labelKey: 'common.dash.nav.settings', href: '#/settings' },
  { key: 'setup', labelKey: 'common.dash.nav.setup', href: '#/setup' },
]
```

extend `DashboardRoute` and `routeFromHash` with `'schedule' | 'groups' | 'closures'`, and
add three branches beside the existing ones. Staff gets `'today'` and `'date'`; parent gets
`'calendar'`.

> **This is the only file in the lane that lane PEOPLE also edits.** Keep the diff to the
> NAV array, the route union, `routeFromHash`, and the branches — a conflict resolved by
> keeping both sides' entries takes seconds; a reformatted file does not.

- [ ] **Step 2: Run every app's own tests, since `App.tsx` changed**

```bash
cd web && npx vitest run apps --reporter=dot
```
Expected: PASS, including the existing `App.test.tsx` in all three apps. If
`routeFromHash`'s test asserts an exact route union, extend that assertion — it lives in
`apps/*/src/App.test.tsx`, which changed for the same reason.

- [ ] **Step 3: Tick the milestone, in the same commit as the work**

In `docs/plan/state.yaml`, under `W2`'s `pieces`, after `W2.0`:

```yaml
      - id: M2.1
        title: Israeli holiday presets, rule expansion and the §5.6 impact diff
        status: shipped
        on: 2026-08-25
      - id: M2.2
        title: Training years, closures, and session materialization for the whole year
        status: shipped
        on: 2026-08-25
      - id: M2.3
        title: PUT /groups/{id}/schedule — the impact preview, and C12's stranded students
        status: shipped
        on: 2026-08-25
      - id: M2.4
        title: /sessions — per-session overrides, ad-hoc sessions, notes, completion worker
        status: shipped
        on: 2026-08-25
      - id: M2.5
        title: Artboards — dashboard 3a/6a/4b, staff 9a/1d/9b, parent 12b
        status: shipped
        on: 2026-08-25
```

**Nothing measurable goes in this file** — no test results, no branch, no environment
health. Those are computed, and a declaration that contradicts a measurement is how a
status board stops being trusted.

- [ ] **Step 4: Run the lane check and show the output**

```bash
./scripts/dev-db.sh up
./scripts/lane-check.sh schedule
```
Expected: `✅ lane schedule green (6 scoped gates)` — six rather than five, because the
frontend test gate now has targets.

- [ ] **Step 5: Run what the lane check cannot reach, and show that too**

```bash
.venv/bin/mypy app/routers/sessions.py app/workers/schedule.py
.venv/bin/ruff check app/routers/sessions.py app/workers/schedule.py
.venv/bin/ruff format --check app/routers/sessions.py app/workers/schedule.py
.venv/bin/pytest tests/contracts tests/dev/test_clock.py -q
cd web && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add web/apps docs/plan/state.yaml
git commit -m "feat(schedule): wire the seven artboards into the three apps, tick W2 M2"
```

---

## Self-Review

Run against SPEC §5.6, §5.15, §7 and the milestone plan's Lane SCHEDULE.

**Spec coverage**

| Requirement | Where |
|---|---|
| §5.6 materialization for the entire training year | Task 5 |
| §5.6 rewrite only `starts_at > now()` | Task 3 (`plan_change`), Task 6 (end to end) |
| §5.6 past sessions never overwritten | Task 3, Task 6 |
| §5.6 `is_manually_edited` never overwritten | Task 3, Task 6, Task 7 (the flag's writer) |
| §5.6 the change dialog shows what will happen first | Task 6 (`apply` default), Task 10 |
| §5.6 per-session overrides: time, duration, location, staff, cancel-with-reason | Task 7 |
| §5.6 ad-hoc sessions belonging to no rule | Task 7 |
| §5.6 Israeli holiday presets as proposals the manager ticks | Tasks 1, 4, 12 |
| §5.6 manual closure ranges cancel affected sessions | Task 4 (`create_closure`), Task 12 |
| §5.15 training year with draft/active/closed | Tasks 4, 5 |
| §5.15 step 6 generate + summary | Task 5 (`generate-sessions`) |
| §7 `/training-years`, `/closures`, `/holiday-presets` | Task 4 |
| §7 `/sessions` list, get, patch, cancel, ad-hoc, notes | Task 7 |
| §7 `GET/PUT /groups/{id}/schedule` with impact preview | Task 6 |
| W2 seam `materialize_sessions` | Task 5 |
| C12 stranded students in the dialog | Tasks 3, 6, 10, 12 |
| Artboards 12b · 9a · 9b · 1d · 3a · 6a · 4b | Tasks 10–15 |
| E2E-5's test ids | Tasks 10, 12 |

**Deliberately not built, and why**

- `POST /training-years/{id}/generate-sessions` covers §5.15's step 6. **Steps 3, 4, 5 and 7
  of the rollover wizard are M10's** — the milestone plan files the rollover wizard under
  W6, and steps 4 (students) and 5 (prices) belong to M3 and M6 respectively.
- `DELETE /closures/{id}` is not in §7 and is not built. Un-cancelling the sessions a
  closure cancelled is a real operation with a real question behind it (does a lesson a
  family was told is cancelled come back?), and inventing an answer here would be a
  behaviour nobody specified. **Flag it to the user.**
- `SessionOut.attendance_taken` is always `False` (D-M2-7). **Consequence: E2E-5's final
  `attendance-taken` assertion cannot pass before W3.** `e2e/` is not this lane's file.
- `4b`'s belt-range and capacity columns are stated gaps (M7 and M3).
- `12b`'s past-attendance strip is a stated gap (M5).

**Type consistency** — `SessionRow` (frontend) mirrors `SessionOut` (backend) field for
field; `ImpactPreview` mirrors `ScheduleImpactPreview` including the two fields Task 3 adds;
`ScheduleRule` mirrors `ScheduleRuleOut`. `RuleSpec.rule_id` is `None` for unsaved rules in
both the preview path (Task 6) and the expansion (Task 2). `students_left_unscheduled` is the
same name in the pure function, the schema field, and the frontend interface.

**Open risks to report at the end of the lane**

1. `scripts/lane-check.sh` does not reach `app/routers/sessions.py` or
   `app/workers/schedule.py` (exception 3). Both are checked by hand in Tasks 7, 8 and 16.
2. `openapi.json` and `web/packages/api-client/src/schema.d.ts` are stale in-lane by
   decision (exception 2). Root `scripts/ci-local.sh` will be red until `main` regenerates.
3. **`app/workers/schedule.py` is never scheduled.** `tests/config/test_jobs_config.py`
   checks that every *declared* job names a real module; it does not check the converse, so
   the lane goes green with the worker written and never run — and a session that never
   becomes `completed` empties §5.14's "sessions held" report. `infra/railway/jobs.json` is
   not this lane's file. The entry to hand over, ready to paste beside `demo-reset`:

   ```json
   {
     "name": "complete-sessions",
     "environment": "production",
     "schedule": "5 * * * *",
     "command": "python -m app.workers.schedule",
     "spec": "SPEC §4.3, §5.14",
     "why": "A session ends by the passage of time, so nothing in a request path can mark it completed. Hourly rather than nightly: the staff app's Today screen and the impact dialog's 'sessions already held' count both read the status the same evening."
   }
   ```

   Note `test_the_demo_reset_runs_in_staging_and_nowhere_else` is scoped to `demo-reset`, so
   a `production` entry does not trip it. Adding this is the user's call.
4. Three `App.tsx` files are shared with lane PEOPLE (exception 4).

---

## Execution Handoff

Plan complete and saved to
`docs/superpowers/plans/2026-08-25-w2-lane-schedule.md`.
