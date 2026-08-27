// S1's integration test — the one the register.ts comment deferred "until the container
// lands". The container landed, and then shipped for two waves without this fill because
// nothing called `registerHealthSections`. This proves fill and container actually meet:
// a roster row for a child with derived_flags renders §5.5's warning.
import { render, screen } from '@testing-library/react'
import { clearSlot } from '@studio/ui'
import { afterEach, describe, expect, it } from 'vitest'
import type { RosterRow as RosterRowData } from '@studio/core'
import { RosterRow } from '../attendance/RosterRow'
import { registerHealthSections } from './register'

const row = (over: Partial<RosterRowData>): RosterRowData => ({
  student_id: 's1',
  display_name: 'דנה לוי',
  belt_color_hex: null,
  belt_name: null,
  health_status: 'signed',
  derived_flags: {},
  status: 'unmarked',
  source: null,
  has_absence_report: false,
  absence_reason: null,
  ...over,
})

afterEach(() => clearSlot('roster-row'))

describe('the health badge on a roster row', () => {
  it('renders the flag chip for a child with derived_flags, through the slot', () => {
    registerHealthSections()
    render(
      <RosterRow
        locale="he"
        onCycle={() => {}}
        row={row({ derived_flags: { asthma: true } })}
      />,
    )
    expect(screen.getByTestId('health-badge-s1')).toBeInTheDocument()
    expect(screen.getByText('אסתמה')).toBeInTheDocument()
  })

  it('warns without blocking when the declaration is missing — C10', () => {
    registerHealthSections()
    render(
      <RosterRow locale="he" onCycle={() => {}} row={row({ health_status: 'missing' })} />,
    )
    expect(screen.getByTestId('health-badge-s1')).toBeInTheDocument()
    // The row is still a working mark control — the warning never blocks the record.
    expect(screen.getByTestId('roster-row-s1')).toBeEnabled()
  })
})
