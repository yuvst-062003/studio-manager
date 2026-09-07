// Owner-reported 2026-09-07: with a single child, בית offered "כל הילדים 1" beside that
// one child's own name — two chips selecting the identical trainee. A filter whose only
// two settings produce the same list is a control that cannot do anything, and it cost a
// row of the screen on the app's first view.
//
// The strip is worth keeping for a family with two or three children, so this is a gate
// rather than a deletion — which is why both halves are asserted here.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HomeTop } from './HomeTop'
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

function renderTop(childList: readonly HomeChild[]) {
  return render(
    <HomeTop
      clubName="מועדון גלדיאטור"
      locale="he"
      familyName="סטולין"
      childList={childList}
      selectedChildId={null}
      onSelectChild={() => {}}
      onOpenNotifications={() => {}}
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
