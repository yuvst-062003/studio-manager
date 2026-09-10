// Which pictogram a class and its groups are drawn with.
//
// The prototype picks one per discipline and that is half of why its grid reads at a
// glance. `discipline` is free text a manager types, so this matches on the word rather
// than on an enum — and the default is a real mark, not a hole.
import { describe, expect, it } from 'vitest'
import { disciplineIcon } from './disciplineIcon'

describe('disciplineIcon', () => {
  it.each([
    ['judo', 'martialArts'],
    ["ג'ודו", 'martialArts'],
    ['ג׳ודו אולימפי', 'martialArts'],
    ['karate', 'martialArts'],
    ['קרב מגע', 'martialArts'],
    ['BJJ', 'martialArts'],
    ['crossfit', 'fitness'],
    ['כושר', 'fitness'],
    ['swimming', 'pool'],
    ['שחייה', 'pool'],
    ['כדורסל', 'ball'],
  ])('draws %s as %s', (discipline, icon) => {
    expect(disciplineIcon(discipline)).toBe(icon)
  })

  it('defaults to a martial art rather than to nothing', () => {
    // A club that names no discipline still gets a mark. This is a judo club, and an empty
    // badge on every card would be worse than one honest default — the class's name is
    // always beside it, so a wrong guess costs a reader nothing.
    expect(disciplineIcon(null)).toBe('martialArts')
    expect(disciplineIcon(undefined)).toBe('martialArts')
    expect(disciplineIcon('')).toBe('martialArts')
    expect(disciplineIcon('משהו אחר לגמרי')).toBe('martialArts')
  })
})
