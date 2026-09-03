import { describe, expect, it } from 'vitest'
import { fill } from './text'

/**
 * `t(locale, key)` returns the raw string and does no interpolation — the repo's
 * `{{name}}` / `{{count}}` convention is filled in here. This was two identical private
 * copies (`features/schedule/client.ts`, `features/rollover/client.ts`) before four more
 * dashboard screens needed the same helper, so it lives in core instead of a third copy.
 */
describe('fill', () => {
  it('substitutes a single placeholder', () => {
    expect(fill('Hello {{name}}', { name: 'Dana' })).toBe('Hello Dana')
  })

  it('substitutes a placeholder that repeats', () => {
    expect(fill('{{name}} and {{name}} again', { name: 'Dana' })).toBe('Dana and Dana again')
  })

  it('substitutes several distinct placeholders', () => {
    expect(fill('{{count}} of {{total}} for {{name}}', { count: 3, total: 10, name: 'Dana' })).toBe(
      '3 of 10 for Dana',
    )
  })

  it('stringifies a numeric value', () => {
    expect(fill('{{count}} sessions', { count: 5 })).toBe('5 sessions')
  })

  it('leaves an unknown placeholder untouched rather than rendering undefined', () => {
    // A missing value must degrade to a visible `{{name}}`, not to the string "undefined" —
    // a blank-looking string is a bug nobody notices; a literal `{{name}}` on screen is one
    // a manager reports.
    expect(fill('Hello {{name}}', {})).toBe('Hello {{name}}')
    expect(fill('{{known}} and {{unknown}}', { known: 'x' })).toBe('x and {{unknown}}')
  })

  it('returns a template with no placeholders unchanged', () => {
    expect(fill('no placeholders here', {})).toBe('no placeholders here')
  })
})
