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
