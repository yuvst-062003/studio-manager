// Dashboard artboards 3b, 3c, 4a and 6c.
//
// Two things are asserted harder than the rest: the payment column on `3b` is EXPLICITLY
// empty rather than invented, and `6c` hardcodes no alert this lane does not own. Both are
// failures that look like features until somebody acts on them.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSlot, registerSlot } from '@studio/ui'
import { fill } from '@studio/core'
import { t } from '@studio/i18n'
import { StudentsScreen, documentLabelKey } from './StudentsScreen'
import { AddStudentScreen } from './AddStudentScreen'
import { StudentDetailScreen } from './StudentDetailScreen'
import { TrialsAwaitingDecisionAlert } from './sections/TrialsAwaitingDecisionAlert'
import { AlertCentre } from './AlertCentre'
import type { AlertSectionProps } from './AlertCentre'
import { registerPeopleAlerts } from './register'
import type {
  AttendanceMarkRow,
  DashboardPeopleClient,
  StudentSummary,
  TrialBookingRow,
} from './peopleClient'

const summary = (over: Partial<StudentSummary> = {}): StudentSummary =>
  ({
    id: 'st1',
    person_id: 'p1',
    first_name: 'דנה',
    last_name: 'כהן',
    birthdate: '2018-05-01',
    status: 'active',
    health_status: 'signed',
    joined_on: '2026-09-01',
    left_on: null,
    group_names: ['מתחילים'],
    guardian_display_names: ['יעל כהן'],
    frozen_until: null,
    ...over,
  }) as StudentSummary

const booking = (over: Partial<TrialBookingRow> = {}): TrialBookingRow =>
  ({
    id: 'b1',
    student_id: 'st1',
    student_display_name: 'נועה לוי',
    group_id: 'g1',
    group_name: 'מתחילים',
    session_id: 's1',
    booked_at: '2026-09-01T09:00:00Z',
    attended: null,
    outcome: 'pending',
    is_override: false,
    ...over,
  }) as TrialBookingRow

const mark = (over: Partial<AttendanceMarkRow> = {}): AttendanceMarkRow =>
  ({
    id: 'a1',
    session_id: 's1',
    student_id: 'st1',
    status: 'present',
    source: 'coach',
    marked_by_person_id: 'p9',
    marked_at: '2026-09-06T15:05:00Z',
    device_marked_at: '2026-09-06T15:00:00Z',
    client_mark_id: 'c1',
    note: null,
    ...over,
  }) as AttendanceMarkRow

function makeClient(over: Partial<DashboardPeopleClient> = {}): DashboardPeopleClient {
  return {
    students: vi.fn(() =>
      Promise.resolve({ items: [summary()], next_cursor: null, has_more: false }),
    ),
    student: vi.fn(() =>
      Promise.resolve({
        ...summary(),
        current_belt_color_hex: '#ffffff',
        current_belt_name: 'לבנה',
        guardians: [
          {
            person_id: 'p9',
            student_id: 'st1',
            display_name: 'יעל כהן',
            relation: 'parent',
            is_primary: true,
            phone: '0521234567',
            email: 'y@example.invalid',
          },
        ],
      }),
    ),
    pricePlan: vi.fn(() =>
      Promise.resolve({ student_id: 'st1', price_plan_id: null, weekly_volume: 2 }),
    ),
    enrollments: vi.fn(() =>
      Promise.resolve([
        {
          id: 'e1',
          student_id: 'st1',
          group_id: 'g1',
          group_name: 'מתחילים',
          status: 'active',
          started_on: '2026-09-01',
          ended_on: null,
          attends_weekdays: [0],
        },
      ]),
    ),
    statusHistory: vi.fn(() =>
      Promise.resolve({
        items: [
          {
            id: 'h1',
            student_id: 'st1',
            from_status: 'trial',
            to_status: 'active',
            reason: null,
            changed_at: '2026-09-01T09:00:00Z',
          },
        ],
      }),
    ),
    // `4a`'s twelve marks, newest first — the order `GET /students/{id}/attendance`
    // returns them in (`ORDER BY device_marked_at DESC`).
    attendance: vi.fn(() =>
      Promise.resolve({
        items: [
          mark({ id: 'a3', status: 'absent_unexcused', device_marked_at: '2026-09-15T15:00:00Z' }),
          mark({ id: 'a2', status: 'absent_excused', device_marked_at: '2026-09-10T15:00:00Z' }),
          mark({ id: 'a1', status: 'present', device_marked_at: '2026-09-06T15:00:00Z' }),
        ],
        next_cursor: null,
        has_more: false,
      }),
    ),
    groups: vi.fn(() =>
      Promise.resolve({
        items: [
          { id: 'g1', name: 'מתחילים' },
          { id: 'g2', name: 'נבחרת' },
        ],
      }),
    ),
    weekdayOptions: vi.fn(() =>
      Promise.resolve({ group_id: 'g1', group_name: 'מתחילים', training_weekdays: [0, 3] }),
    ),
    createStudent: vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ invitation_token: 'tok-123' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ),
    convert: vi.fn(),
    markLost: vi.fn(),
    freeze: vi.fn(),
    trialBookings: vi.fn(() => Promise.resolve({ items: [booking()] })),
    approve: vi.fn(),
    reject: vi.fn(),
    ...over,
  } as unknown as DashboardPeopleClient
}

const noPhysicalCss = (container: HTMLElement) => {
  for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
    expect(node.getAttribute('style') ?? '').not.toMatch(
      /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
    )
  }
}

afterEach(() => clearSlot('alert-centre'))

// -- 3b: the students table -----------------------------------------------------

describe('StudentsScreen — 3b', () => {
  it('links to the add-student screen — a screen with no inbound link does not exist', () => {
    // #/students/new shipped reachable only by typing the URL; the staging full pass
    // (2026-08-28) read that as "a manager cannot create anything".
    render(<StudentsScreen locale="he" client={makeClient()} />)
    const add = screen.getByTestId('students-add')
    expect(add).toHaveAttribute('href', '#/students/new')
    expect(add).toHaveTextContent(t('he', 'people.student.add'))
  })

  it('renders a real table with a caption and column headers', async () => {
    // A grid of divs looks identical and is unreadable to a screen reader, and §6.4 puts
    // this in front of a manager who may be using one.
    render(<StudentsScreen locale="he" client={makeClient()} />)
    const table = await screen.findByTestId('students-table')
    expect(table.querySelector('caption')).not.toBeNull()
    expect(table.querySelectorAll('th[scope="col"]').length).toBeGreaterThan(0)
  })

  it('filters by status', async () => {
    const user = userEvent.setup()
    const client = makeClient()
    render(<StudentsScreen locale="he" client={client} />)
    await screen.findByTestId('students-table')
    await user.selectOptions(screen.getByTestId('students-status-filter'), 'trial')
    await waitFor(() =>
      expect(client.students).toHaveBeenCalledWith(expect.objectContaining({ status: 'trial' })),
    )
  })

  it('renders the מסמכים column from the health status', async () => {
    render(<StudentsScreen locale="he" client={makeClient()} />)
    expect(await screen.findByTestId('students-document')).toHaveTextContent(
      t('he', 'people.document.signed'),
    )
  })

  it('leaves מצב תשלום EXPLICITLY empty rather than inventing it', async () => {
    // `charge` is W4's table. A plausible-looking payment column in a manager's
    // decision-making screen would be a fabrication — so the column exists, is labelled,
    // and says when it fills in.
    render(<StudentsScreen locale="he" client={makeClient()} />)
    // F8: with no charges read yet the cell is an em dash — never a fake ✓ and never
    // an amount. The chip states appear only once the manager-only read lands.
    expect(await screen.findAllByTestId('students-payment-pending')).not.toHaveLength(0)
    expect(document.body.textContent ?? '').not.toContain('₪')
  })

  it('tells "nothing matched" apart from "the club has no students"', async () => {
    const client = makeClient({
      students: vi.fn(() => Promise.resolve({ items: [], next_cursor: null, has_more: false })),
    })
    render(<StudentsScreen locale="he" client={client} />)
    expect(await screen.findByText(t('he', 'people.student.empty'))).toBeInTheDocument()
  })

  it('pages with a cursor rather than an offset', async () => {
    // G16 — rosters are written to while they are being read, and LIMIT/OFFSET silently
    // skips or repeats rows when the set shifts.
    const user = userEvent.setup()
    const client = makeClient({
      students: vi
        .fn()
        .mockResolvedValueOnce({ items: [summary()], next_cursor: 'st1', has_more: true })
        .mockResolvedValueOnce({
          items: [summary({ id: 'st2', first_name: 'יוסי' })],
          next_cursor: null,
          has_more: false,
        }),
    })
    render(<StudentsScreen locale="he" client={client} />)
    await user.click(await screen.findByTestId('students-load-more'))
    // The Table primitive renders each student as the row header (its identity cell).
    await waitFor(() => expect(screen.getAllByRole('rowheader')).toHaveLength(2))
    expect(client.students).toHaveBeenLastCalledWith(expect.objectContaining({ after: 'st1' }))
  })

  it('scrolls the table inside its own container, not the page sideways', async () => {
    // F1b — the scroll container is the Table primitive's own.
    render(<StudentsScreen locale="he" client={makeClient()} />)
    await screen.findByTestId('students-table')
    expect(screen.getByRole('table').parentElement).toHaveClass('studio-table-scroll')
  })

  it('renders no physical CSS', async () => {
    const { container } = render(<StudentsScreen locale="en" client={makeClient()} />)
    await screen.findByTestId('students-table')
    noPhysicalCss(container)
  })

  it('keeps the table caption off-screen while it stays the table\'s accessible name (A5, confirmed on this screen)', async () => {
    render(<StudentsScreen locale="he" client={makeClient()} />)
    const table = await screen.findByRole('table', { name: t('he', 'people.student.plural') })
    const caption = table.querySelector('caption')
    expect(caption).not.toBeNull()
    // Table.tsx defaults `captionVisible` to false and this screen never opts in — so
    // the caption clips out of the visual flow (A5) while remaining the accessible name
    // `getByRole` just matched on.
    expect(caption).toHaveClass('studio-visually-hidden')
  })
})

// -- B2 — the page header, filter bar, selection column and sharing cards ------------

describe('B2.1 — the add-student control lives in PageHeader\'s actions slot', () => {
  it('renders inside the page header, not floating between it and the filter row', async () => {
    render(<StudentsScreen locale="he" client={makeClient()} />)
    const header = document.querySelector('.studio-page-header')
    expect(header).not.toBeNull()
    const add = screen.getByTestId('students-add')
    // Inside the header's own actions slot, not merely a sibling somewhere on the page.
    expect(add.closest('.studio-page-header__actions')).not.toBeNull()
    expect(header?.contains(add)).toBe(true)
    // The dead `alignSelf: 'start'` inline style is gone — the parent was never a flex
    // container, so it never did anything, and now there is no style at all to carry it.
    expect(add).not.toHaveAttribute('style')
  })

  it('carries the loaded count in the subtitle, printed nowhere before this change', async () => {
    render(<StudentsScreen locale="he" client={makeClient()} />)
    await screen.findByTestId('students-table')
    const subtitle = document.querySelector('.studio-page-header__subtitle')
    expect(subtitle).toHaveTextContent(
      fill(t('he', 'people.student.countSubtitle'), { count: 1 }),
    )
  })

  it('omits the subtitle rather than claiming a total it cannot know, when the baseline load could not see the whole roster', async () => {
    // The same failure the filter row's result count was fixed for, one widget up:
    // `page.items.length` is whatever page happens to be loaded, not the club's size.
    // `has_more: true` means this IS only a fragment — a club of 400 must never read
    // "20 חניכים" in its own page header.
    const client = makeClient({
      students: vi.fn(() =>
        Promise.resolve({
          items: [summary(), summary({ id: 'st2', first_name: 'יוסי' })],
          next_cursor: 'st2',
          has_more: true,
        }),
      ),
    })
    render(<StudentsScreen locale="he" client={client} />)
    await screen.findByTestId('students-table')
    expect(document.querySelector('.studio-page-header__subtitle')).toBeNull()
  })

  it('declares a non-inline display for .studio-btn in primitives.css (A2), so the moved anchor still cannot overflow', () => {
    // Not asserted via getComputedStyle: this suite's jsdom never loads primitives.css
    // (no bundler runs here), so `getComputedStyle(anchor).display` would report the
    // browser's inline-by-default value NO MATTER what the stylesheet says —
    // SegmentedControl.test.tsx documents the same limitation, and Button.test.tsx (A2)
    // is the precedent this mirrors: assert the element wears the class the rule
    // targets, then read the rule itself from the source file that ships it.
    render(<StudentsScreen locale="he" client={makeClient()} />)
    const add = screen.getByTestId('students-add')
    expect(add).toHaveClass('studio-btn')
    const raw = readFileSync(
      resolve(process.cwd(), 'packages/ui/src/primitives/primitives.css'),
      'utf-8',
    )
    // Strip comments first (tokens.test.ts's precedent, Button.test.tsx's for this exact
    // rule) — the rule's own comment names the bug it fixes ("defaults to `display:
    // inline`") and would otherwise be indistinguishable from a real declaration.
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')
    const block = css.match(/\.studio-btn\s*\{([^}]*)\}/)?.[1] ?? ''
    const display = block.match(/display:\s*([a-z-]+)/)?.[1]
    expect(display).toBeDefined()
    expect(display).not.toBe('inline')
  })
})

describe('B2.2 — the filter bar', () => {
  it('uses the shared .studio-filter-bar row instead of the hand-written filterRowStyle', async () => {
    render(<StudentsScreen locale="he" client={makeClient()} />)
    const bar = screen.getByTestId('students-search').closest('.studio-filter-bar')
    expect(bar).not.toBeNull()
    expect(bar?.contains(screen.getByTestId('students-status-filter'))).toBe(true)
  })

  it('shows a result count on the filter row\'s inline-end edge', async () => {
    const client = makeClient({
      students: vi.fn(() =>
        Promise.resolve({
          items: [summary(), summary({ id: 'st2', first_name: 'יוסי' })],
          next_cursor: null,
          has_more: false,
        }),
      ),
    })
    render(<StudentsScreen locale="he" client={client} />)
    await screen.findByTestId('students-table')
    const bar = screen.getByTestId('students-search').closest('.studio-filter-bar')
    const count = screen.getByTestId('students-result-count')
    expect(bar?.contains(count)).toBe(true)
    expect(count).toHaveTextContent(
      fill(t('he', 'people.filter.resultCount'), { count: 2, total: 2 }),
    )
  })

  it('keeps the unfiltered baseline as "total" once a status filter narrows the shown count — so a filtered view says how much it is hiding', async () => {
    const client = makeClient({
      students: vi
        .fn()
        .mockResolvedValueOnce({
          items: [summary(), summary({ id: 'st2' })],
          next_cursor: null,
          has_more: false,
        })
        .mockResolvedValueOnce({ items: [summary()], next_cursor: null, has_more: false }),
    })
    render(<StudentsScreen locale="he" client={client} />)
    await screen.findByTestId('students-table')
    expect(screen.getByTestId('students-result-count')).toHaveTextContent(
      fill(t('he', 'people.filter.resultCount'), { count: 2, total: 2 }),
    )
    await userEvent.selectOptions(screen.getByTestId('students-status-filter'), 'trial')
    await waitFor(() =>
      expect(screen.getByTestId('students-result-count')).toHaveTextContent(
        fill(t('he', 'people.filter.resultCount'), { count: 1, total: 2 }),
      ),
    )
  })

  it('renders the count alone — never a denominator — when the baseline load could not see the whole roster', async () => {
    // `has_more: true` on the unfiltered baseline means the club has more students than
    // this one page, so `items.length` is a fragment, not a total. A denominator built
    // from it would UNDERSTATE what a filter hides (a club of 400 reading "5 מתוך 20"),
    // and a wrong number on screen is worse than no number — so no denominator renders.
    const client = makeClient({
      students: vi.fn(() =>
        Promise.resolve({
          items: [summary(), summary({ id: 'st2', first_name: 'יוסי' })],
          next_cursor: 'st2',
          has_more: true,
        }),
      ),
    })
    render(<StudentsScreen locale="he" client={client} />)
    await screen.findByTestId('students-table')
    const count = screen.getByTestId('students-result-count')
    expect(count).toHaveTextContent(fill(t('he', 'people.student.countSubtitle'), { count: 2 }))
    // The literal claim this guards against: "מתוך" ("out of") is the denominator word
    // `people.filter.resultCount` alone carries — asserting its absence is what proves
    // no (wrong) total rendered, not merely that some plausible-looking text did.
    expect(count.textContent ?? '').not.toContain('מתוך')
  })

  it('re-latches the baseline after a bulk mutation changes the roster, instead of keeping the count from before it', async () => {
    // Write-once cuts both ways (the reviewer's phrase): `baselineCount` must not merely
    // resist a WRONG total forever, it must also stop defending a total that was once
    // right and a bulk leave has since made wrong. `reload()` clears the latch, and the
    // unfiltered refetch it triggers (bulk actions never touch query/status) re-latches
    // from the fresh response — asserted here on both widgets the latch feeds.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })),
    )
    const client = makeClient({
      students: vi
        .fn()
        // The initial, complete, unfiltered baseline: two students.
        .mockResolvedValueOnce({
          items: [summary(), summary({ id: 'st2', first_name: 'יוסי' })],
          next_cursor: null,
          has_more: false,
        })
        // After the bulk leave reloads: the roster has actually shrunk to one.
        .mockResolvedValueOnce({ items: [summary()], next_cursor: null, has_more: false }),
    })
    render(<StudentsScreen locale="he" client={client} />)
    await screen.findByTestId('students-table')
    expect(document.querySelector('.studio-page-header__subtitle')).toHaveTextContent(
      fill(t('he', 'people.student.countSubtitle'), { count: 2 }),
    )
    expect(screen.getByTestId('students-result-count')).toHaveTextContent(
      fill(t('he', 'people.filter.resultCount'), { count: 2, total: 2 }),
    )
    await userEvent.click(await screen.findByTestId('select-st1'))
    await userEvent.click(screen.getByTestId('bulk-leave'))
    await userEvent.click(await screen.findByTestId('confirm-bulk-confirm'))
    await waitFor(() =>
      expect(document.querySelector('.studio-page-header__subtitle')).toHaveTextContent(
        fill(t('he', 'people.student.countSubtitle'), { count: 1 }),
      ),
    )
    expect(screen.getByTestId('students-result-count')).toHaveTextContent(
      fill(t('he', 'people.filter.resultCount'), { count: 1, total: 1 }),
    )
    vi.unstubAllGlobals()
  })
})

describe('B2.3 — the selection column', () => {
  it('carries no visible header text, only an accessible name — the old header named one bulk action, not the column', async () => {
    render(<StudentsScreen locale="he" client={makeClient()} />)
    await screen.findByTestId('students-table')
    const headerCell = screen.getAllByRole('columnheader')[0]
    expect(headerCell).toBeDefined()
    expect(headerCell).toHaveTextContent(t('he', 'people.student.selectColumn'))
    expect(headerCell?.querySelector('.studio-visually-hidden')).not.toBeNull()
    expect(headerCell).not.toHaveTextContent(t('he', 'people.bulk.move'))
  })

  it('makes the bulk bar sticky to the block-end edge of the viewport once something is selected', async () => {
    render(<StudentsScreen locale="he" client={makeClient()} />)
    await userEvent.click(await screen.findByTestId('select-st1'))
    expect(screen.getByTestId('students-bulk-bar')).toHaveClass('people-bulk-bar')
    // Same limitation as the A2 test above: jsdom never loads people.css, so the rule
    // itself is read from the source rather than faked through getComputedStyle. The
    // true "does it visually float above the table" claim is a Playwright concern.
    const raw = readFileSync(
      resolve(process.cwd(), 'apps/dashboard/src/features/people/people.css'),
      'utf-8',
    )
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')
    const block = css.match(/\.people-bulk-bar\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(block).toMatch(/position:\s*sticky/)
    expect(block).toMatch(/inset-block-end:\s*0/)
  })
})

describe('documentLabelKey', () => {
  it('maps all three health statuses, from people.ts and not health.ts', () => {
    // `health` is M4's namespace (plan §1.3, seam 3); a lane borrowing another's would
    // serialize both waves.
    expect(documentLabelKey('signed')).toBe('people.document.signed')
    expect(documentLabelKey('trial_signed')).toBe('people.document.trialSigned')
    expect(documentLabelKey('missing')).toBe('people.document.missing')
  })
})

// -- 3c: adding a student -------------------------------------------------------

describe('AddStudentScreen — 3c', () => {
  // Decision 20 (2026-09-03 onboarding doors spec) — student-first, three fields.
  // Everything below replaces the parent-first, multi-child, group-and-weekday form.

  it('has exactly three fields — full name, 18+, guardian email — and none of the old ones', () => {
    render(<AddStudentScreen locale="he" client={makeClient()} />)
    expect(screen.getByLabelText(t('he', 'people.student.fullName'))).toBeInTheDocument()
    expect(screen.getByLabelText(t('he', 'people.student.isAdult'))).toBeInTheDocument()
    expect(screen.getByLabelText(t('he', 'people.student.guardianEmail'))).toBeInTheDocument()
    // The parent's own name/phone, the group picker and the weekday picker all left with
    // the parent-first form — the manager types almost nothing (§3, Door C).
    expect(screen.queryByLabelText(t('he', 'people.student.firstName'))).toBeNull()
    expect(screen.queryByLabelText(t('he', 'people.student.lastName'))).toBeNull()
    expect(screen.queryByLabelText(t('he', 'people.student.phone'))).toBeNull()
    expect(screen.queryByTestId('add-student-group-0')).toBeNull()
    expect(screen.queryByTestId('add-student-add-child')).toBeNull()
  })

  it('splits a typed full name on the first whitespace, and sends the guardian email with NO guardian names', async () => {
    // Proving test 1 — assert on the body the client actually sends, not on props.
    const user = userEvent.setup()
    const client = makeClient()
    render(<AddStudentScreen locale="he" client={client} />)
    await user.type(screen.getByLabelText(t('he', 'people.student.fullName')), 'דנה כהן לוי')
    await user.type(
      screen.getByLabelText(t('he', 'people.student.guardianEmail')),
      'yael@example.invalid',
    )
    await user.click(screen.getByTestId('add-student-submit'))

    await waitFor(() => expect(client.createStudent).toHaveBeenCalled())
    const body = vi.mocked(client.createStudent).mock.calls[0]![0]
    expect(body.first_name).toBe('דנה')
    // Split on the FIRST whitespace only — a second surname stays in the last name.
    expect(body.last_name).toBe('כהן לוי')
    expect(body.guardian.email).toBe('yael@example.invalid')
    expect(body.guardian).not.toHaveProperty('first_name')
    expect(body.guardian).not.toHaveProperty('last_name')
  })

  it('accepts a single-word full name — not refused, and no invented last name', async () => {
    // Proving test 2.
    const user = userEvent.setup()
    const client = makeClient()
    render(<AddStudentScreen locale="he" client={client} />)
    await user.type(screen.getByLabelText(t('he', 'people.student.fullName')), 'מדונה')
    await user.click(screen.getByTestId('add-student-submit'))

    await waitFor(() => expect(client.createStudent).toHaveBeenCalled())
    const body = vi.mocked(client.createStudent).mock.calls[0]![0]
    expect(body.first_name).toBe('מדונה')
    // Non-empty (the API's last_name has min_length=1) but carries no invented name.
    expect(body.last_name.length).toBeGreaterThan(0)
    expect(body.last_name.trim()).toBe('')
  })

  it('18 ומעלה makes the student their own guardian, with their own email', async () => {
    // Proving test 3.
    const user = userEvent.setup()
    const client = makeClient()
    render(<AddStudentScreen locale="he" client={client} />)
    await user.type(screen.getByLabelText(t('he', 'people.student.fullName')), 'רון לוי')
    await user.click(screen.getByLabelText(t('he', 'people.student.isAdult')))
    await user.type(
      screen.getByLabelText(t('he', 'people.student.guardianEmail')),
      'ron@example.invalid',
    )
    await user.click(screen.getByTestId('add-student-submit'))

    await waitFor(() => expect(client.createStudent).toHaveBeenCalled())
    const body = vi.mocked(client.createStudent).mock.calls[0]![0]
    expect(body.guardian.first_name).toBe('רון')
    expect(body.guardian.last_name).toBe('לוי')
    expect(body.guardian.email).toBe('ron@example.invalid')
    expect(body.guardian.relation).toBe('self')
  })

  it('says the email could not be sent when the deployment cannot send it, and still shows the copyable link', async () => {
    // Proving test 4.
    const client = makeClient({
      createStudent: vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              invitation_token: 'tok-123',
              invitation_url: 'https://parent.example/?invite=tok-123',
              invitation_email_configured: false,
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      ),
    })
    const user = userEvent.setup()
    render(<AddStudentScreen locale="he" client={client} />)
    await user.type(screen.getByLabelText(t('he', 'people.student.fullName')), 'דנה כהן')
    await user.click(screen.getByTestId('add-student-submit'))

    expect(await screen.findByTestId('add-student-invite-email-unavailable')).toHaveTextContent(
      t('he', 'people.invite.emailNotConfigured'),
    )
    // The copyable link is still there — a silent absence is what decision 21 forbids.
    expect(screen.getByTestId('add-student-invite-url')).toHaveTextContent('tok-123')
  })

  it('says the email was sent, when it was', async () => {
    // Proving test 5.
    const client = makeClient({
      createStudent: vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              invitation_token: 'tok-123',
              invitation_url: 'https://parent.example/?invite=tok-123',
              invitation_email_configured: true,
              invitation_email_sent: true,
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      ),
    })
    const user = userEvent.setup()
    render(<AddStudentScreen locale="he" client={client} />)
    await user.type(screen.getByLabelText(t('he', 'people.student.fullName')), 'דנה כהן')
    await user.click(screen.getByTestId('add-student-submit'))

    expect(await screen.findByTestId('add-student-invite-email-sent')).toHaveTextContent(
      t('he', 'people.invite.emailSent'),
    )
  })

  it('renders no email notice at all when the response carries neither field yet', async () => {
    // The two booleans are OPTIONAL — a parallel lane fills them in. A response from a
    // backend that has not shipped that piece must not be read as a definite failure.
    const user = userEvent.setup()
    render(<AddStudentScreen locale="he" client={makeClient()} />)
    await user.type(screen.getByLabelText(t('he', 'people.student.fullName')), 'דנה כהן')
    await user.click(screen.getByTestId('add-student-submit'))

    await screen.findByTestId('add-student-invitation')
    expect(screen.queryByTestId('add-student-invite-email-sent')).toBeNull()
    expect(screen.queryByTestId('add-student-invite-email-unavailable')).toBeNull()
    expect(screen.queryByTestId('add-student-invite-email-not-sent')).toBeNull()
  })

  it('renders no price on the add form', () => {
    // L2 — the price is on the STUDENT and `price_plan` is W4's table; this screen never
    // touches it.
    render(<AddStudentScreen locale="he" client={makeClient()} />)
    expect(document.body.textContent ?? '').not.toMatch(/₪/)
    expect(document.body.textContent ?? '').not.toContain(t('he', 'people.convert.pricePlan'))
  })

  it('shows the invitation once, for a parent at the desk', async () => {
    const user = userEvent.setup()
    render(<AddStudentScreen locale="he" client={makeClient()} />)
    await user.type(screen.getByLabelText(t('he', 'people.student.fullName')), 'דנה כהן')
    await user.click(screen.getByTestId('add-student-submit'))

    expect(await screen.findByTestId('add-student-invitation')).toHaveTextContent('tok-123')
  })

  it('labels every input', () => {
    render(<AddStudentScreen locale="he" client={makeClient()} />)
    for (const input of screen.getAllByRole('textbox')) {
      expect(input).toHaveAccessibleName()
    }
    expect(screen.getByLabelText(t('he', 'people.student.isAdult'))).toBeInTheDocument()
  })
})

// -- 4a: the manager's card -----------------------------------------------------

describe('StudentDetailScreen — 4a', () => {
  it('renders the card, the groups and the status timeline', async () => {
    render(<StudentDetailScreen studentId="st1" locale="he" client={makeClient()} />)
    expect(await screen.findByTestId('student-detail')).toBeInTheDocument()
    expect(screen.getByTestId('detail-enrollment')).toBeInTheDocument()
    expect(screen.getByTestId('detail-history')).toBeInTheDocument()
  })

  it('shows the C11 volume beside the plan field', async () => {
    // §5.10 shows it 'so a mismatch between what a child attends and what they are billed
    // for is visible at the moment the price is set'.
    render(<StudentDetailScreen studentId="st1" locale="he" client={makeClient()} />)
    expect(await screen.findByTestId('detail-weekly-volume')).toHaveTextContent('2')
  })

  it('renders the price plan as an ID and a hint, never an amount', async () => {
    // L2 — `price_plan` is W4's table and this lane never resolves it. A helpful "₪320"
    // here would be the fabrication invariant 3 exists to prevent.
    render(<StudentDetailScreen studentId="st1" locale="he" client={makeClient()} />)
    expect(await screen.findByTestId('detail-price-hint')).toHaveTextContent(
      t('he', 'people.convert.pricePlanHint'),
    )
    expect(document.body.textContent ?? '').not.toContain('₪')
  })

  it('renders the C12 pattern per enrollment', async () => {
    render(<StudentDetailScreen studentId="st1" locale="he" client={makeClient()} />)
    expect(await screen.findByTestId('detail-weekdays')).toHaveTextContent(
      t('he', 'people.weekdays.0'),
    )
  })

  it('offers freeze, convert and mark-lost', async () => {
    render(<StudentDetailScreen studentId="st1" locale="he" client={makeClient()} />)
    expect(await screen.findByTestId('detail-freeze')).toBeInTheDocument()
    expect(screen.getByTestId('detail-convert')).toBeInTheDocument()
    expect(screen.getByTestId('detail-mark-lost')).toBeInTheDocument()
  })

  it('renders narrow as well as wide', async () => {
    // §6.4 — 'a manager checking cover from a phone is a normal case rather than an error.'
    render(<StudentDetailScreen studentId="st1" locale="he" client={makeClient()} />)
    expect(await screen.findByTestId('student-detail')).toHaveStyle({ display: 'grid' })
  })

  // -- 4a's attendance section --------------------------------------------------
  //
  // `GET /students/{id}/attendance` has been manager-scoped and built since M5 and was
  // called by NOTHING. The card had four sections — groups, price plan, guardians, status
  // history — and the one question a manager asks about a child before phoning their
  // parent ("has she been coming?") had no answer on the screen.

  it('shows the student’s attendance history, through the shared strip', async () => {
    const client = makeClient()
    render(<StudentDetailScreen studentId="st1" locale="he" client={client} />)

    expect(await screen.findByTestId('detail-attendance')).toBeInTheDocument()
    // The SAME primitive parent `2c` and staff `9c` render, so the three surfaces cannot
    // drift into three different pictures of one child's attendance.
    expect(screen.getByTestId('attendance-strip')).toBeInTheDocument()
    expect(client.attendance).toHaveBeenCalledWith('st1')
  })

  it('renders the marks oldest-first, because time flows one way', async () => {
    // The endpoint answers newest-first (`ORDER BY device_marked_at DESC` — a queue that
    // flushed two days late must not put last Tuesday at the top). A strip read left to
    // right is the opposite order, so the screen reverses it rather than drawing a
    // history that runs backwards.
    render(<StudentDetailScreen studentId="st1" locale="he" client={makeClient()} />)
    const section = await screen.findByTestId('detail-attendance')

    // `role="img"` with an accessible name is what `AttendanceMark` renders; the legend's
    // copies of it are `aria-hidden`, so they are not in this list. Scoped to the section
    // because the belt bar in the header is a labelled `img` too.
    const labels = within(section)
      .getAllByRole('img')
      .map((node) => node.getAttribute('aria-label') ?? '')
    expect(labels).toHaveLength(3)
    expect(labels[0]).toContain(t('he', 'attendance.roster.present'))
    expect(labels[2]).toContain(t('he', 'attendance.roster.absent'))
  })

  it('says so when nothing has been marked, rather than drawing an empty strip', async () => {
    // §5.14 makes `unmarked` a real state precisely so a coach who forgot the register does
    // not look like a child who stopped coming. A blank strip beside a heading would say
    // the second thing.
    const client = makeClient({
      attendance: vi.fn(() => Promise.resolve({ items: [], next_cursor: null, has_more: false })),
    } as unknown as Partial<DashboardPeopleClient>)
    render(<StudentDetailScreen studentId="st1" locale="he" client={client} />)

    expect(await screen.findByTestId('detail-attendance-empty')).toHaveTextContent(
      t('he', 'people.student.attendanceEmpty'),
    )
    expect(screen.queryByTestId('attendance-strip')).toBeNull()
  })

  it('renders no coach note beside the marks', async () => {
    // §5.13 — a coach's written opinion about a child. `AttendanceOut` carries one and the
    // strip has nowhere to put it; putting it here would surface a note written for the
    // register on the screen a manager reads before telephoning the family.
    const client = makeClient({
      attendance: vi.fn(() =>
        Promise.resolve({
          items: [mark({ note: 'הגיעה עצובה, לברר בבית' })],
          next_cursor: null,
          has_more: false,
        }),
      ),
    } as unknown as Partial<DashboardPeopleClient>)
    render(<StudentDetailScreen studentId="st1" locale="he" client={client} />)
    await screen.findByTestId('detail-attendance')

    expect(document.body.textContent ?? '').not.toContain('הגיעה עצובה')
  })

  it('survives an attendance read that fails, without losing the rest of the card', async () => {
    // One section of a composite screen. A 500 here must not take the guardians and the
    // status history down with it.
    const client = makeClient({
      attendance: vi.fn(() => Promise.reject(new Error('500'))),
    } as unknown as Partial<DashboardPeopleClient>)
    render(<StudentDetailScreen studentId="st1" locale="he" client={client} />)

    expect(await screen.findByTestId('detail-history')).toBeInTheDocument()
    expect(screen.getByTestId('detail-attendance-empty')).toBeInTheDocument()
  })
})

// -- 6c: the alert centre container ---------------------------------------------

describe('AlertCentre — the 6c container', () => {
  it('renders an alert a later milestone registers, without knowing what it is', () => {
    registerSlot<AlertSectionProps>('alert-centre', {
      key: 'debt',
      order: 10,
      render: () => <p data-testid="future-alert" />,
    })
    render(<AlertCentre locale="he" client={makeClient()} />)
    expect(screen.getByTestId('future-alert')).toBeInTheDocument()
  })

  it('orders alerts by their declared order', () => {
    registerSlot<AlertSectionProps>('alert-centre', {
      key: 'z',
      order: 90,
      render: () => <p data-testid="ordered">z</p>,
    })
    registerSlot<AlertSectionProps>('alert-centre', {
      key: 'a',
      order: 10,
      render: () => <p data-testid="ordered">a</p>,
    })
    render(<AlertCentre locale="he" client={makeClient()} />)
    expect(screen.getAllByTestId('ordered').map((n) => n.textContent)).toEqual(['a', 'z'])
  })

  it('hardcodes NO alert this lane does not own', () => {
    // M4's missing declarations, M5's at-risk students and M6's debt and reconciliation
    // alerts all land through the registry. If one appears here without a registerSlot
    // call, this catches it.
    render(<AlertCentre locale="he" client={makeClient()} />)
    expect(screen.queryByTestId('alert-debt')).toBeNull()
    expect(screen.queryByTestId('alert-reconciliation')).toBeNull()
    expect(screen.queryByTestId('alert-at-risk')).toBeNull()
    expect(screen.queryByTestId('alert-missing-health')).toBeNull()
  })

  it('says nothing needs attention rather than showing a blank panel', () => {
    render(<AlertCentre locale="he" client={makeClient()} />)
    expect(screen.getByTestId('alerts-empty')).toHaveTextContent(t('he', 'people.alerts.empty'))
  })

  it('renders this lane’s own alerts through the registry too', async () => {
    registerPeopleAlerts()
    render(<AlertCentre locale="he" client={makeClient()} />)
    expect(await screen.findByTestId('alert-upcoming-trials')).toBeInTheDocument()
    expect(screen.getByTestId('alert-trials-awaiting')).toBeInTheDocument()
    // The registration approval queue is GONE (2026-08-30) — it is not merely hidden. Its
    // only producer of pending rows was removed when a parent adding a child started
    // enrolling them, so it stood as two decision buttons over a list that could never
    // fill. Asserted rather than dropped, because a deleted panel that quietly comes back
    // is exactly how dead UI returns.
    expect(screen.queryByTestId('alert-pending-requests')).toBeNull()
  })
})

describe('the alerts this lane owns', () => {
  it('excludes a trial that has not happened from the decision queue', async () => {
    // `attended === null` is 'the lesson has not happened yet'. Listing it as awaiting a
    // decision puts a choice in front of somebody who cannot make it.
    registerPeopleAlerts()
    render(<AlertCentre locale="he" client={makeClient()} />)
    await screen.findByTestId('alert-trials-awaiting')
    expect(screen.queryByTestId('alert-decision-row')).toBeNull()
    // …and it DOES appear in the upcoming queue.
    expect(screen.getByTestId('alert-trial-row')).toBeInTheDocument()
  })

  it('lists an attended trial as awaiting a decision, with both outcomes', async () => {
    // §5.4a ⑤ — `lost` is a real outcome, not an absence of one. A queue with only the
    // happy path never empties.
    registerPeopleAlerts()
    const client = makeClient({
      trialBookings: vi.fn(() => Promise.resolve({ items: [booking({ attended: true })] })),
    })
    render(<AlertCentre locale="he" client={client} />)
    expect(await screen.findByTestId('alert-decision-row')).toBeInTheDocument()
    expect(screen.getByTestId('alert-convert-st1')).toBeInTheDocument()
    expect(screen.getByTestId('alert-lost-st1')).toBeInTheDocument()
  })

  it('shows an override, because §5.4a makes it countable', async () => {
    registerPeopleAlerts()
    const client = makeClient({
      trialBookings: vi.fn(() => Promise.resolve({ items: [booking({ is_override: true })] })),
    })
    render(<AlertCentre locale="he" client={client} />)
    expect(await screen.findByTestId('alert-trial-override')).toBeInTheDocument()
  })

  it('shows no money in any alert', async () => {
    registerPeopleAlerts()
    render(<AlertCentre locale="he" client={makeClient()} />)
    await screen.findByTestId('alert-trials-awaiting')
    expect(document.body.textContent ?? '').not.toContain('₪')
  })
})

describe('F2 — the four buttons that used to do nothing', () => {
  it('freeze expands, then fires POST /students/{id}/freeze with the dates', async () => {
    const client = makeClient()
    ;(client.freeze as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('{}'))
    render(<StudentDetailScreen studentId="st1" locale="he" client={client} />)
    await userEvent.click(await screen.findByTestId('detail-freeze'))
    // The second press is the confirmation step; the fields are the decision.
    const from = screen.getByTestId('detail-freeze-from') as HTMLInputElement
    expect(from.value).not.toBe('')
    await userEvent.click(screen.getByTestId('detail-freeze-submit'))
    expect(client.freeze).toHaveBeenCalledWith('st1', {
      from_date: from.value,
      to_date: null,
    })
  })

  it('mark-lost expands, requires a reason, then fires with it', async () => {
    const client = makeClient()
    ;(client.markLost as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('{}'))
    render(<StudentDetailScreen studentId="st1" locale="he" client={client} />)
    await userEvent.click(await screen.findByTestId('detail-mark-lost'))
    expect(screen.getByTestId('detail-mark-lost-submit')).toBeDisabled()
    await userEvent.type(screen.getByTestId('detail-lost-reason'), 'עברו לעיר אחרת')
    await userEvent.click(screen.getByTestId('detail-mark-lost-submit'))
    expect(client.markLost).toHaveBeenCalledWith('st1', 'עברו לעיר אחרת')
  })

  it('the alert converts with the chosen group — same route as the detail screen', async () => {
    const client = makeClient({
      trialBookings: vi.fn(async () => ({
        items: [
          {
            id: 'b1',
            student_id: 'st9',
            student_display_name: 'דנה ניסיון',
            booked_at: '2026-11-01T10:00:00Z',
            attended: true,
            outcome: 'pending',
          } as never,
        ],
      })),
    })
    ;(client.convert as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('{}'))
    render(<TrialsAwaitingDecisionAlert locale="he" client={client} />)
    await userEvent.click(await screen.findByTestId('alert-convert-st9'))
    await userEvent.selectOptions(screen.getByTestId('alert-convert-group-st9'), 'g1')
    await userEvent.click(screen.getByTestId('alert-convert-submit-st9'))
    expect(client.convert).toHaveBeenCalledWith('st9', {
      group_id: 'g1',
      started_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as unknown as string,
    })
  })

  it('the alert marks lost with the typed reason', async () => {
    const client = makeClient({
      trialBookings: vi.fn(async () => ({
        items: [
          {
            id: 'b1',
            student_id: 'st9',
            student_display_name: 'דנה ניסיון',
            booked_at: '2026-11-01T10:00:00Z',
            attended: true,
            outcome: 'pending',
          } as never,
        ],
      })),
    })
    ;(client.markLost as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('{}'))
    render(<TrialsAwaitingDecisionAlert locale="he" client={client} />)
    await userEvent.click(await screen.findByTestId('alert-lost-st9'))
    await userEvent.type(screen.getByTestId('alert-lost-reason-st9'), 'לא התאים')
    await userEvent.click(screen.getByTestId('alert-lost-submit-st9'))
    expect(client.markLost).toHaveBeenCalledWith('st9', 'לא התאים')
  })
})

describe('F12 — bulk actions on the students screen', () => {
  it('selects rows and fires one bulk move with per-row outcomes', async () => {
    const bodies: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/students/bulk')) {
          bodies.push(JSON.parse(String(init?.body)))
          return new Response(
            JSON.stringify({
              applied: 1,
              refused: [{ id: 'st1', reason: 'multiple_enrollments' }],
            }),
            { status: 200 },
          )
        }
        if (url.includes('/groups')) {
          return new Response(
            JSON.stringify({ items: [{ id: 'g9', name: 'יעד', is_active: true }] }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      }),
    )
    render(<StudentsScreen locale="he" client={makeClient()} />)
    await userEvent.click(await screen.findByTestId('select-st1'))
    await userEvent.selectOptions(await screen.findByTestId('bulk-group'), 'g9')
    await userEvent.click(screen.getByTestId('bulk-move'))
    // Destructive-adjacent: the confirm dialog gates the press.
    await userEvent.click(await screen.findByTestId('confirm-bulk-confirm'))
    expect(bodies[0]).toMatchObject({
      student_moves: [{ student_id: 'st1', group_id: 'g9' }],
    })
    // The half-succeeded batch says WHICH row failed and why, translated.
    expect(await screen.findByTestId('bulk-refused-st1')).toHaveTextContent(
      t('he', 'people.bulk.refused.multiple_enrollments'),
    )
    vi.unstubAllGlobals()
  })
})
