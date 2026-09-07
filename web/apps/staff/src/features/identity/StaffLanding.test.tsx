// The tour this replaced was removed on 2026-09-07 (see `StaffLanding.tsx` for why). What
// these tests guard is the part of it that was load-bearing and easy to drop on the way
// out: a signed-in coach has to END UP on the today screen. The tour did that from its own
// "already seen" path, so deleting it without keeping the routing would have left a coach
// staring at an empty shell — a regression that no tour test would have caught, because
// they all asserted on the tour.
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { StaffLanding } from './StaffLanding'

beforeEach(() => {
  globalThis.localStorage.clear()
  globalThis.location.hash = ''
})

describe('StaffLanding', () => {
  it('puts the coach on the today screen', () => {
    render(<StaffLanding />)
    expect(globalThis.location.hash).toBe('#/schedule')
  })

  it('routes every launch, not just the first — there is no "seen" state any more', () => {
    // The tour deliberately fired once and never again. Its replacement is not a greeting,
    // it is the route itself, so a second launch must land in exactly the same place. A
    // leftover `tour-seen` key from a build a coach already ran must not change that.
    globalThis.localStorage.setItem('studio.staff.tour-seen', '2026-08-27')
    render(<StaffLanding />)
    expect(globalThis.location.hash).toBe('#/schedule')
  })

  it('shows a coach nothing to read or dismiss on the way through', () => {
    // The whole point of the removal: no copy, no buttons, nothing to press. If anyone
    // reintroduces a greeting here, this is the test that should stop them.
    const { container } = render(<StaffLanding />)
    expect(screen.getByTestId('staff-landing')).toBeEmptyDOMElement()
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })
})
