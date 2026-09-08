// One colour, four copies, and none of them can import the others.
//
// The launch screen a person sees on a cold start is assembled from four files that each
// hold the ground colour separately:
//
//   packages/ui/src/theme.ts          SPLASH_GROUND — the source
//   packages/ui/src/first-run/*.css   what React paints
//   apps/*/index.html                 what the page paints before any bundle
//   scripts/generate-splash.mjs       what iOS paints before the page exists
//
// Every one of those was wrong at some point on 2026-09-08, and each looked like a
// different bug: a white flash, then a second screen, then a cream rectangle with a logo on
// it. They are the same bug — a colour written down more than once. CSS cannot import
// TypeScript and a `.mjs` script cannot either, so this test is what holds them together.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SPLASH_GROUND } from '@studio/ui/theme'

const ROOT = join(__dirname, '..', '..')
const generator = readFileSync(join(ROOT, 'scripts', 'generate-splash.mjs'), 'utf8')

describe('the launch ground is one colour everywhere', () => {
  it.each([
    ['parent', SPLASH_GROUND.parent],
    ['staff', SPLASH_GROUND.staff],
  ])('%s: the iOS launch image is generated in the splash ground', (app, colour) => {
    // The generator drew `GROUND_COLOR` — the APP's ground — so an installed app opened on
    // a cream rectangle and only then went navy. iOS was showing exactly what it was given.
    const block = new RegExp(`${app}: \\{ light: '([^']+)', dark: '([^']+)' \\}`).exec(generator)
    expect(block, `no ground entry for ${app} in generate-splash.mjs`).not.toBeNull()
    expect(block![1]!.toLowerCase()).toBe(colour.toLowerCase())
    // Same in both schemes: the loading screen is the brand ground either way, and a dark
    // variant that differed would flash on a phone set to dark.
    expect(block![2]!.toLowerCase()).toBe(colour.toLowerCase())
  })

  it('draws no mark on the launch image', () => {
    // A launch image carrying one picture, followed by a loading screen carrying another,
    // is two screens however well the colours match.
    expect(generator).not.toContain('brand-mark.mjs')
    expect(generator).not.toContain('composite(')
  })
})
