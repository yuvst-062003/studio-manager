// The grouping both class-aware lists share, and the bucket that must stay loud.
import { describe, expect, it } from 'vitest'
import { groupByClass } from './byClass'

const CLASSES = [
  { id: 'c-judo', name: "ג'ודו" },
  { id: 'c-karate', name: 'קראטה' },
]

describe('groupByClass', () => {
  it('splits rows into their classes', () => {
    const { groups, unfiled } = groupByClass(
      [
        { id: 'a', class_id: 'c-judo' },
        { id: 'b', class_id: 'c-karate' },
        { id: 'c', class_id: 'c-judo' },
      ],
      CLASSES,
    )
    expect(unfiled).toEqual([])
    expect(groups.map((g) => [g.className, g.rows.map((r) => r.id)])).toEqual([
      ["ג'ודו", ['a', 'c']],
      ['קראטה', ['b']],
    ])
  })

  it('keeps rows with no class OUT of the groups', () => {
    // The one that matters. An unfiled row is broken, not categorised: no parent sees an
    // unfiled item and no child can be given an unfiled plan.
    const { groups, unfiled } = groupByClass(
      [
        { id: 'a', class_id: 'c-judo' },
        { id: 'b', class_id: null },
        { id: 'c' },
      ],
      CLASSES,
    )
    expect(unfiled.map((r) => r.id)).toEqual(['b', 'c'])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.rows.map((r) => r.id)).toEqual(['a'])
  })

  it('treats a row naming an unknown class as unfiled rather than dropping it', () => {
    // A deleted class, or a class list that failed to load. Dropping the row would make it
    // vanish from the only screen that can repair it.
    const { groups, unfiled } = groupByClass([{ id: 'a', class_id: 'c-gone' }], CLASSES)
    expect(groups).toEqual([])
    expect(unfiled.map((r) => r.id)).toEqual(['a'])
  })

  it("uses the club's class order, not the rows' order", () => {
    const { groups } = groupByClass(
      [
        { id: 'a', class_id: 'c-karate' },
        { id: 'b', class_id: 'c-judo' },
      ],
      CLASSES,
    )
    expect(groups.map((g) => g.classId)).toEqual(['c-judo', 'c-karate'])
  })

  it('returns no groups at all when the club has no classes', () => {
    // The setup wizard runs before any class exists; every row is unfiled and the screen
    // renders one plain list rather than a warning nobody can act on yet.
    const { groups, unfiled } = groupByClass(
      [{ id: 'a', class_id: null }, { id: 'b', class_id: null }],
      [],
    )
    expect(groups).toEqual([])
    expect(unfiled).toHaveLength(2)
  })
})
