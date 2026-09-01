import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { clearSlot, registerSlot, useSlot } from './slots'

const Strip = ({ label }: { label: string }) => <span>{label}</span>

describe('slot registry (seam 4)', () => {
  beforeEach(() => {
    clearSlot('student-card')
    clearSlot('roster-row')
  })

  it('returns an empty list for a slot nothing registered into', () => {
    expect(useSlot('student-card')).toEqual([])
  })

  it('orders entries by order, not by registration order', () => {
    registerSlot('student-card', { key: 'payment', order: 40, render: Strip })
    registerSlot('student-card', { key: 'belt', order: 10, render: Strip })
    registerSlot('student-card', { key: 'attendance', order: 20, render: Strip })

    expect(useSlot('student-card').map((e) => e.key)).toEqual(['belt', 'attendance', 'payment'])
  })

  it('keeps slots independent — one lane registering cannot leak into another', () => {
    registerSlot('student-card', { key: 'documents', order: 30, render: Strip })
    expect(useSlot('roster-row')).toEqual([])
  })

  it('replaces an entry registered twice under the same key', () => {
    registerSlot('roster-row', { key: 'health', order: 10, render: Strip })
    registerSlot('roster-row', { key: 'health', order: 99, render: Strip })

    const entries = useSlot('roster-row')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.order).toBe(99)
  })

  it('renders what a lane registered, which is the whole point', () => {
    registerSlot('roster-row', { key: 'health', order: 10, render: Strip })
    const entry = useSlot<{ label: string }>('roster-row')[0]!
    const Registered = entry.render
    render(<Registered label="health-badge" />)
    expect(screen.getByText('health-badge')).toBeInTheDocument()
  })

  it('a container reads its own props contract back out, typed', () => {
    // The reason SlotEntry is generic: a lane registers a component with real props and
    // the container gets them back, rather than everything degrading to `any`.
    registerSlot('student-card', { key: 'belt', order: 10, render: Strip })
    const entries = useSlot<{ label: string }>('student-card')
    for (const { render: Section, key } of entries) {
      render(<Section label={key} />)
    }
    expect(screen.getByText('belt')).toBeInTheDocument()
  })
})

// ── Regions (2c, Option C) ──────────────────────────────────────────────────────────────
//
// A container composed of sections owned by different lanes has more than one FRAME: 2c's
// card has a header and a ledger of rows, and the status chip belongs in one while the
// belt row belongs in the other. Without a region the container could only place a section
// by knowing its name, which is the one thing seam 4 exists to prevent.
describe('slot regions', () => {
  beforeEach(() => clearSlot('student-card'))

  it('defaults an entry with no region to the body, so every existing lane still lands', () => {
    registerSlot('student-card', { key: 'legacy', order: 10, render: Strip })
    expect(useSlot('student-card', 'body').map((e) => e.key)).toEqual(['legacy'])
  })

  it('gives a container only the entries for the frame it is rendering', () => {
    registerSlot('student-card', { key: 'chip', order: 10, region: 'status', render: Strip })
    registerSlot('student-card', { key: 'swatch', order: 10, region: 'mark', render: Strip })
    registerSlot('student-card', { key: 'belt-row', order: 20, render: Strip })

    expect(useSlot('student-card', 'status').map((e) => e.key)).toEqual(['chip'])
    expect(useSlot('student-card', 'mark').map((e) => e.key)).toEqual(['swatch'])
    expect(useSlot('student-card', 'body').map((e) => e.key)).toEqual(['belt-row'])
  })

  it('still returns every entry when no region is asked for', () => {
    registerSlot('student-card', { key: 'chip', order: 10, region: 'status', render: Strip })
    registerSlot('student-card', { key: 'row', order: 20, render: Strip })
    expect(useSlot('student-card')).toHaveLength(2)
  })

  it('orders within a region, so one lane cannot reorder another frame', () => {
    registerSlot('student-card', { key: 'b', order: 90, region: 'body', render: Strip })
    registerSlot('student-card', { key: 'a', order: 10, region: 'body', render: Strip })
    registerSlot('student-card', { key: 'chip', order: 50, region: 'status', render: Strip })

    expect(useSlot('student-card', 'body').map((e) => e.key)).toEqual(['a', 'b'])
  })
})
