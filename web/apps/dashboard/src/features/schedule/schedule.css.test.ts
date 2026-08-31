// A `<button>` does NOT inherit `color`. The UA stylesheet gives it `color: buttontext`,
// and tokens.css resets only `font-family` for form controls — so a button class that
// never declares a colour renders UA black in BOTH themes. In light mode that is black on
// `--surface` (#fffefb) and looks deliberate; in dark mode it is black on #1e1d1a and the
// text disappears.
//
// That is what happened to the week board's session blocks: `.week-block` is a button, it
// sets `background: var(--surface)` and no colour, so a manager on a dark OS with the
// theme on "system" could not read a single class on the board (reported 2026-09-01).
// `.month-grid__pill` is the same shape and DOES declare `color: var(--fg)`, which is why
// the month view stayed readable and the week and day views did not — the two views
// disagreeing is the tell.
//
// Read from cwd rather than import.meta.url: the jsdom environment rewrites
// import.meta.url to a non-file scheme (same reason tokens.test.ts does).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const raw = readFileSync(
  resolve(process.cwd(), 'apps/dashboard/src/features/schedule/schedule.css'),
  'utf-8',
)
// Comments are prose and legitimately mention colours to explain them. The assertion is
// about declarations.
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')

/** The declarations of the BASE rule for a class — not its `[data-…]` variants, which is
 *  the distinction that matters here: `.week-block[data-coverage="cancelled"]` has always
 *  set a colour, and that one state being readable is what hid the bug. */
function baseRule(selector: string): string {
  const match = new RegExp(`(^|\\})\\s*\\${selector}\\s*\\{([^}]*)\\}`, 'm').exec(css)
  // A missing rule fails here rather than later as an empty string that quietly passes
  // every `not.toContain` a future assertion might use.
  if (match?.[2] === undefined) throw new Error(`no base rule for ${selector} in schedule.css`)
  return match[2]
}

describe('the board reads in both themes', () => {
  // Every class below is worn by a `<button>` that renders text.
  it.each(['.week-block', '.month-grid__pill'])(
    '%s declares its own colour, because a button does not inherit one',
    (selector) => {
      expect(baseRule(selector)).toMatch(/(^|[\s;])color:/)
    },
  )

  it('takes that colour from the token layer, so it flips with the theme', () => {
    // A literal hex here would be the same bug wearing a different hat: readable in the
    // mode it was picked in and wrong in the other.
    expect(baseRule('.week-block')).toContain('color: var(--fg)')
  })
})
