// The 2c redesign added three facts the card did not carry before, and each one arrives
// over the wire. This file tests the SEAM — fetch → state → component — not the components
// with their props typed in by hand.
//
// The project rule this exists for, verbatim: "A field added to an API is not proven by a
// test that constructs the component's props by hand. Assert the mapping that carries it —
// `fetch → state → component` — or a field silently dropped in between passes every test.
// This is how a hard gate shipped never firing."
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSlot } from '@studio/ui'
import { t } from '@studio/i18n'
import { registerAttendanceSections } from '../attendance/StudentCardAttendanceSection'
import { oweFor, registerBillingSections } from '../billing/StudentCardBillingSection'
import { registerHealthSections } from '../health/StudentCardHealthSection'
import { StudentCard } from './StudentCard'
import type { StudentSummary } from './peopleClient'
import type { ChargeOut } from '../billing/billingClient'

const STUDENT = {
  id: 'st1',
  person_id: 'p1',
  first_name: 'יונתן',
  last_name: 'לוי',
  status: 'active',
  health_status: 'signed',
  birthdate: null,
  frozen_until: null,
} as unknown as StudentSummary

const charge = (over: Partial<ChargeOut>): ChargeOut =>
  ({
    id: 'c',
    student_id: 'st1',
    amount_agorot: 10_000,
    allocated_agorot: 0,
    status: 'open',
    due_date: '2026-09-10',
    is_covered_elsewhere: false,
    ...over,
  }) as unknown as ChargeOut

const ok = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response)

afterEach(() => {
  clearSlot('student-card')
  vi.unstubAllGlobals()
})

// ── The money is this child's ───────────────────────────────────────────────────────────
describe('oweFor', () => {
  it('counts only this child’s charges', () => {
    // The defect being corrected: the card used to render the HOUSEHOLD balance on every
    // child, so a family with three children read the same figure three times with nothing
    // saying whose it was.
    const owed = oweFor(
      [charge({ id: 'a' }), charge({ id: 'b', student_id: 'st2', amount_agorot: 99_000 })],
      'st1',
    )
    expect(owed.agorot).toBe(10_000)
  })

  it('subtracts what a payment already covered', () => {
    expect(oweFor([charge({ amount_agorot: 10_000, allocated_agorot: 4_000 })], 'st1').agorot).toBe(
      6_000,
    )
  })

  it('excludes a charge another payer has taken on', () => {
    // Counting it bills a parent twice on screen for money they do not owe.
    expect(oweFor([charge({ is_covered_elsewhere: true })], 'st1').agorot).toBe(0)
  })

  it('reports the SOONEST due date, not the newest charge’s', () => {
    const owed = oweFor(
      [charge({ id: 'a', due_date: '2026-10-01' }), charge({ id: 'b', due_date: '2026-09-10' })],
      'st1',
    )
    expect(owed.dueOn).toBe('2026-09-10')
  })

  it('has no date to report when no charge carries one', () => {
    // `due_date` is optional on the wire, not nullable — a manual charge can be raised
    // without one.
    expect(oweFor([charge({ due_date: undefined })], 'st1').dueOn).toBeNull()
  })
})

describe('the money row', () => {
  it('carries this child’s figure from the wire to the screen', async () => {
    vi.stubGlobal('fetch', (path: string) =>
      path.includes('/me/charges')
        ? ok({ items: [charge({ id: 'a' }), charge({ id: 'b', student_id: 'st2', amount_agorot: 500_000 })] })
        : ok({ items: [] }),
    )
    registerBillingSections()
    render(<StudentCard student={STUDENT} locale="he" />)

    const row = await screen.findByTestId('student-card-billing')
    // 100₪ for this child — not the 5,100₪ the household owes.
    expect(row).toHaveTextContent('100₪')
    expect(row).not.toHaveTextContent('5,100₪')
    expect(row).toHaveAttribute('href', '#/payments')
  })

  it('renders no row at all when this child owes nothing', async () => {
    // A row announcing a zero is noise on a card about a child, and D2 keeps the debt
    // alert for 1a.
    vi.stubGlobal('fetch', (path: string) =>
      path.includes('/me/charges') ? ok({ items: [charge({ student_id: 'st2' })] }) : ok({ items: [] }),
    )
    registerBillingSections()
    render(<StudentCard student={STUDENT} locale="he" />)

    await waitFor(() => expect(screen.getByTestId('student-card-rows')).toBeInTheDocument())
    expect(screen.queryByTestId('student-card-billing')).toBeNull()
  })

  it('renders nothing rather than a reassuring zero when the read fails', async () => {
    // P8 — a wrong number about money is worse than an error.
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    registerBillingSections()
    render(<StudentCard student={STUDENT} locale="he" />)

    await waitFor(() => expect(screen.getByTestId('student-card-rows')).toBeInTheDocument())
    expect(screen.queryByTestId('student-card-billing')).toBeNull()
    expect(document.body.textContent ?? '').not.toContain('₪')
  })
})

// ── The declaration's expiry ────────────────────────────────────────────────────────────
describe('the health row', () => {
  it('carries valid_until from the wire to the screen', async () => {
    // The fact the old chip-only section could not tell a parent at all: a signed
    // declaration that lapses in three weeks read exactly like one good for a year.
    vi.stubGlobal('fetch', (path: string) =>
      path.includes('health-declaration')
        ? ok({ id: 'd1', student_id: 'st1', valid_until: '2027-08-12', has_signature: true })
        : ok({ items: [] }),
    )
    registerHealthSections()
    render(<StudentCard student={STUDENT} locale="he" />)

    const expiry = await screen.findByTestId('health-valid-until')
    expect(expiry).toHaveTextContent(t('he', 'health.declaration.validUntil'))
    expect(expiry).toHaveTextContent(/2027/)
  })

  it('still says whether the declaration is signed when the expiry read fails', async () => {
    // `health_status` rides on the summary the container already holds, so a failed read
    // costs the expiry line and nothing else.
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    registerHealthSections()
    render(<StudentCard student={STUDENT} locale="he" />)

    const row = await screen.findByTestId('student-card-health')
    expect(row).toHaveTextContent(t('he', 'health.badge.signed'))
    expect(screen.queryByTestId('health-valid-until')).toBeNull()
  })
})

// ── The attendance counts ───────────────────────────────────────────────────────────────
describe('the attendance row', () => {
  const past = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

  it('counts the whole window, and never sums a told-us-first absence with a no-show', async () => {
    // Two different facts to a family: one is "they did not turn up", the other is "we
    // told you". The brief asks for both, separately.
    vi.stubGlobal('fetch', (path: string) =>
      path.includes('/me/attendance')
        ? ok({
            items: [
              { session_id: 's1', student_id: 'st1', status: 'present', starts_at: past(3) },
              { session_id: 's2', student_id: 'st1', status: 'present', starts_at: past(5) },
              { session_id: 's3', student_id: 'st1', status: 'absent_excused', starts_at: past(7) },
              { session_id: 's4', student_id: 'st1', status: 'absent_unexcused', starts_at: past(9) },
              { session_id: 's5', student_id: 'st1', status: 'unmarked', starts_at: past(11) },
              // Another child's row, and a session that has not happened yet.
              { session_id: 's6', student_id: 'st2', status: 'present', starts_at: past(4) },
              { session_id: 's7', student_id: 'st1', status: 'unmarked', starts_at: past(-5) },
            ],
          })
        : ok({ items: [] }),
    )
    registerAttendanceSections()
    render(<StudentCard student={STUDENT} locale="he" />)

    const row = await screen.findByTestId('student-card-attendance')
    const counts = screen.getAllByTestId('attendance-count').map((n) => n.textContent ?? '')
    // Two present — the other child's session is not this child's.
    expect(counts[0]).toMatch(/^2/)
    expect(row).toHaveTextContent(t('he', 'attendance.roster.present'))
    expect(row).toHaveTextContent(t('he', 'attendance.source.preReported'))
    // One unmarked, not two: a lesson five days from now is not a session anyone missed.
    const unmarked = counts.find((text) => text.includes(t('he', 'attendance.roster.unmarked')))
    expect(unmarked).toMatch(/^1/)
  })

  it('omits a count nobody scored, rather than printing a zero', async () => {
    vi.stubGlobal('fetch', (path: string) =>
      path.includes('/me/attendance')
        ? ok({
            items: [{ session_id: 's1', student_id: 'st1', status: 'present', starts_at: past(3) }],
          })
        : ok({ items: [] }),
    )
    registerAttendanceSections()
    render(<StudentCard student={STUDENT} locale="he" />)

    await screen.findByTestId('student-card-attendance')
    expect(screen.getAllByTestId('attendance-count')).toHaveLength(1)
  })
})
