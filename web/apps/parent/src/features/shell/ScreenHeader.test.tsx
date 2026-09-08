// The way back, and the rule that it exists on every screen that needs one.
//
// The second suite here is the one that matters. Testing that `ScreenHeader` renders a
// button is testing a component; asserting that every screen behind the tabs USES it is
// testing the rule — and A1 was not one screen's bug, it was seven screens each missing
// the same thing, which is exactly the shape of defect a per-component test never catches.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScreenHeader } from './ScreenHeader'

describe('ScreenHeader', () => {
  it('names the control for a screen reader, and not with the chevron', () => {
    // The icon is decorative and `aria-hidden`; without the label the control announces
    // as "button" — SC 4.1.2.
    render(<ScreenHeader locale="he" title="כרטיס חניך" />)
    expect(screen.getByRole('button', { name: 'חזרה' })).toBeInTheDocument()
  })

  it('goes back when the app has somewhere to go back to', () => {
    const back = vi.spyOn(globalThis.history, 'back').mockImplementation(() => {})
    vi.spyOn(globalThis.history, 'length', 'get').mockReturnValue(4)

    render(<ScreenHeader locale="he" title="כרטיס חניך" />)
    fireEvent.click(screen.getByTestId('screen-header-back'))

    expect(back).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('goes HOME when there is no history to go back to', () => {
    // A card opened from a pasted link, a push notification or a cold start has no history
    // entry of its own. `history.back()` there does nothing or leaves the app — and a back
    // button that does nothing is worse than no back button, because the parent presses it
    // twice and then force-quits.
    const back = vi.spyOn(globalThis.history, 'back').mockImplementation(() => {})
    vi.spyOn(globalThis.history, 'length', 'get').mockReturnValue(1)
    globalThis.location.hash = '#/student/abc'

    render(<ScreenHeader locale="he" title="כרטיס חניך" />)
    fireEvent.click(screen.getByTestId('screen-header-back'))

    expect(back).not.toHaveBeenCalled()
    expect(globalThis.location.hash).toBe('#/')
    vi.restoreAllMocks()
  })

  it('renders a subtitle when a per-child screen names its child', () => {
    render(<ScreenHeader locale="he" title="המסלול" subtitle="יובל סטולין" />)
    expect(screen.getByText('יובל סטולין')).toBeInTheDocument()
  })
})

/* ── The rule, not the component ──────────────────────────────────────────────────────
 *
 * Spec §4.1's table, as an assertion. A ninth screen added behind the tabs without a way
 * back is a FAILURE here rather than a discovery six weeks later — which is how the first
 * seven happened.
 *
 * The club shop is deliberately absent: it is a tab, and a tab needs no back control.
 */
const SCREENS_THAT_NEED_A_WAY_BACK = [
  'features/people/redesign/TraineeCard.tsx',
  'features/billing/redesign/PlanScreen.tsx',
  'features/belts/BeltProgressScreen.tsx',
  'features/people/DirectionsScreen.tsx',
  'features/schedule/ChildCalendar.tsx',
  'features/privacy/PrivacyScreen.tsx',
  'features/techniques/TechniqueDetail.tsx',
  'features/billing/redesign/PayScreen.tsx',
]

describe('every screen behind the tabs has a way back', () => {
  it.each(SCREENS_THAT_NEED_A_WAY_BACK)('%s renders a ScreenHeader', (file) => {
    const source = readFileSync(resolve(process.cwd(), 'apps/parent/src', file), 'utf-8')
    expect(source).toContain('ScreenHeader')
  })
})
