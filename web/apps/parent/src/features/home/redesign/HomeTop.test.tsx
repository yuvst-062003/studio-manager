// Owner-reported 2026-09-07: with a single child, בית offered "כל הילדים 1" beside that
// one child's own name — two chips selecting the identical trainee. A filter whose only
// two settings produce the same list is a control that cannot do anything, and it cost a
// row of the screen on the app's first view.
//
// The strip is worth keeping for a family with two or three children, so this is a gate
// rather than a deletion — which is why both halves are asserted here.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { HomeTop } from './HomeTop'
import type { HomePlan } from './HomeTop'
import type { HomeChild } from './types'

const CHILDREN: HomeChild[] = [
  {
    id: 'c1',
    firstName: 'יובל',
    displayName: 'יובל סטולין',
    groupNames: ['קבוצה 1'],
    beltColorHex: '#ffffff',
    beltName: 'לבן',
  },
  {
    id: 'c2',
    firstName: 'איתי',
    displayName: 'איתי סטולין',
    groupNames: ['קבוצה 2'],
    beltColorHex: '#0000ff',
    beltName: 'כחול',
  },
]

function renderTop(childList: readonly HomeChild[], plan: HomePlan | null = null) {
  return render(
    <HomeTop
      clubName="מועדון גלדיאטור"
      locale="he"
      familyName="סטולין"
      childList={childList}
      selectedChildId={null}
      onSelectChild={() => {}}
      onOpenNotifications={() => {}}
      plan={plan}
    />,
  )
}

describe('HomeTop trainee filter', () => {
  it('draws no filter strip for a family with one child', () => {
    renderTop([CHILDREN[0]!])
    expect(screen.queryByTestId('home-chip-all')).toBeNull()
    // The child's own chip goes with it — it was the other half of the same pair.
    expect(screen.queryByTestId('home-chip-c1')).toBeNull()
  })

  it('draws it for a family with two', () => {
    renderTop(CHILDREN)
    expect(screen.getByTestId('home-chip-all')).toBeInTheDocument()
    // By test id, not by text: a chip reads "יובל (לבן)" when the child has a belt.
    expect(screen.getByTestId('home-chip-c1')).toBeInTheDocument()
    expect(screen.getByTestId('home-chip-c2')).toBeInTheDocument()
  })
})


describe('the plan, beside the bell', () => {
  // Owner, 2026-09-08: "the current plan should be an icon next to the bell, not a full
  // button". It was a full-width card of its own under the header. Two properties had to
  // survive the move, and they are what this block holds.
  const PLAN: HomePlan = {
    studentId: 'c1',
    planName: 'פעמיים בשבוע',
    monthlyAgorot: 30_000,
    isFamilyWide: false,
  }

  it('sits inside the header bar, with the bell', () => {
    renderTop([CHILDREN[0]!], PLAN)
    const bar = document.querySelector('[data-purpose="home-header-bar"]')
    expect(bar).not.toBeNull()
    // The point of the report: in the bar beside the bell, not a row beneath it.
    expect(bar!.contains(screen.getByTestId('home-plan-pill'))).toBe(true)
    expect(bar!.contains(screen.getByTestId('home-notifications'))).toBe(true)
  })

  it('still answers "what am I on?" at rest, without being pressed', () => {
    // The rule the old full-width card was written for. A bare glyph would answer only
    // after the parent had already asked, so the price stays on the face of the control.
    renderTop([CHILDREN[0]!], PLAN)
    expect(screen.getByTestId('home-plan-pill-amount')).toHaveTextContent('300')
    // ...and the full sentence is still the accessible name, since a price alone does not
    // say that it is a plan.
    expect(screen.getByTestId('home-plan-pill')).toHaveAccessibleName(/פעמיים בשבוע/)
  })

  it('names no amount for a family with several children and none chosen', () => {
    // Summing two children's prices would be a figure the club never charges, and picking
    // the first silently is a lie about whose plan it is.
    renderTop(CHILDREN, { studentId: null, planName: null, monthlyAgorot: null, isFamilyWide: true })
    expect(screen.getByTestId('home-plan-pill')).toBeInTheDocument()
    expect(screen.queryByTestId('home-plan-pill-amount')).toBeNull()
  })

  it('draws nothing at all when there is no plan to show', () => {
    renderTop([CHILDREN[0]!], null)
    expect(screen.queryByTestId('home-plan-pill')).toBeNull()
  })
})

describe('§20 — שיתוף המועדון, beside the bell', () => {
  // The seam, not the component. A test that only finds the button passes while the link
  // points at the sign-in wall, which is the one way this feature can fail silently: the
  // parent sees a share icon, sends it to a friend, and the friend gets a login box.
  it('shares the club’s public page over WhatsApp, with the message and the link', () => {
    vi.stubEnv('VITE_LANDING_SLUG', 'gladiator')
    vi.stubEnv('VITE_LANDING_HOSTS', 'gladiatorclub.co.il,www.gladiatorclub.co.il')
    renderTop(CHILDREN)

    const share = screen.getByTestId('home-share-club')
    const href = share.getAttribute('href') ?? ''
    // `wa.me/?text=` with no recipient — §5.11's rule, inherited: the sender picks who
    // gets it, and no phone number goes into a URL.
    expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/)
    expect(href).not.toMatch(/wa\.me\/\d/)

    const shared = decodeURIComponent(href)
    // The APEX, not `location.origin` — the app's own root is the sign-in wall (#25).
    expect(shared).toContain('https://gladiatorclub.co.il/')
    expect(shared).not.toContain('/t/gladiator')
    // And the parent's own words, so what arrives reads like a recommendation.
    expect(shared).toContain(t('he', 'schedule.home.shareClubMessage'))

    vi.unstubAllEnvs()
  })

  it('hides itself rather than sharing a link that resolves to nothing', () => {
    // An environment with no slug configured. `/t/` 404s against the API, so the fallback
    // would hand a friend a refusal page on the one screen that exists to impress them.
    vi.stubEnv('VITE_LANDING_SLUG', '')
    vi.stubEnv('VITE_LANDING_HOSTS', '')
    renderTop(CHILDREN)
    expect(screen.queryByTestId('home-share-club')).toBeNull()
    vi.unstubAllEnvs()
  })
})
