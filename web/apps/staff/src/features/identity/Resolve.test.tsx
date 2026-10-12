// §6.1 step 3's non-refusal arms, after the setup wizard left the staff app
// (owner, 2026-10-13).
//
// What this file used to pin was the WIZARD arm: an owner whose studio had never been set
// up was routed into it, a returning owner was not, a coach never asked the question, and a
// `dismissed_at` we had not read yet rendered nothing rather than flashing the wizard. All
// of that reasoning is now the dashboard's, where the wizard lives on.
//
// What is left to hold is the arm that remains, and the fact that nothing in this app opens
// a wizard any more — `routes.reachable.test.ts` covers the dead `#/setup` hash alongside it.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Resolve } from './Resolve'

describe('Resolve', () => {
  it('lands on Today, with no question asked first', () => {
    render(<Resolve />)
    expect(screen.getByTestId('staff-landing')).toBeInTheDocument()
  })

  it('renders no wizard, for anybody', () => {
    const { container } = render(<Resolve />)
    expect(screen.queryByTestId('staff-wizard')).not.toBeInTheDocument()
    // And no "still deciding" placeholder either: there is nothing left to decide, so the
    // three-valued load state that existed to prevent a flash went with the branch.
    expect(screen.queryByTestId('staff-resolving')).not.toBeInTheDocument()
    expect(container.innerHTML).not.toContain('setup')
  })
})
