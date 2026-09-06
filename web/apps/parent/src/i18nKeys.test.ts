// EVERY KEY THIS APP ASKS FOR EXISTS.
//
// `t()` falls back to the key itself when it does not, which is silent: a mistyped key
// renders `schedule.home.loadFaild` on screen, passes typecheck, passes lint, and passes
// any test that does not assert the exact string. The move of the redesign's strings out
// of seven `content*.ts` modules and into @studio/i18n (2026-09-06) was ~230 chances to
// make that mistake in one afternoon.
//
// Template keys are checked too, and they are the ones worth the trouble: the absence
// sheet builds `attendance.reason.${key}.label` and the reminder
// `schedule.reminder.lead.${option}` from a union, so a rename on either side of the
// template is invisible until somebody opens the sheet.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { bundles } from '@studio/i18n'
import { LEAD_MINUTES } from './features/home/redesign/ReminderSheet'
import { ABSENCE_REASONS } from './features/home/redesign/absenceReasons'
import { SUBCATEGORIES } from './features/techniques/types'

const SRC = dirname(fileURLToPath(import.meta.url))

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path)
  }
  return out
}

function exists(key: string): boolean {
  const dot = key.indexOf('.')
  const ns = key.slice(0, dot) as keyof (typeof bundles)['he']
  return bundles.he[ns] !== undefined && key.slice(dot + 1) in bundles.he[ns]
}

describe('every key this app asks for', () => {
  it('resolves against the Hebrew bundle', () => {
    const asked = new Set<string>()
    for (const path of sourceFiles(SRC)) {
      const text = readFileSync(path, 'utf8')
      for (const match of text.matchAll(
        /\bt\(\s*(?:locale|'he'|'en'|'ru')\s*,\s*'([a-z][\w]*\.[\w.]+)'\s*\)/gi,
      )) {
        asked.add(match[1]!)
      }
    }
    // A sanity floor: if the regex ever stops matching, this test would pass by finding
    // nothing, which is the failure mode a "no missing keys" assertion cannot see.
    expect(asked.size).toBeGreaterThan(200)
    expect([...asked].filter((key) => !exists(key))).toEqual([])
  })

  it('resolves the keys built from a union at runtime', () => {
    const built = [
      ...Object.keys(LEAD_MINUTES).map((lead) => `schedule.reminder.lead.${lead}`),
      ...ABSENCE_REASONS.flatMap(({ key }) => [
        `attendance.reason.${key}.label`,
        `attendance.reason.${key}.sub`,
      ]),
      ...['too_late', 'already_marked', 'offline', 'unknown'].map(
        (failure) => `attendance.absenceSheet.failure.${failure}`,
      ),
      ...['resultRecorded', 'resultTooLate', 'resultAlready', 'resultFailed'].map(
        (result) => `attendance.dayAbsence.${result}`,
      ),
      ...['parentHome', 'parentShop', 'parentUpdates', 'parentTechniques', 'parentProfile'].map(
        (tab) => `common.tabs.${tab}`,
      ),
      // The technique library builds a heading per sub-family and a chip per category
      // straight off the dataset's own unions, so a family renamed in `types.ts` and not
      // in the bundle shows the raw key as a section heading.
      ...Object.entries(SUBCATEGORIES).flatMap(([category, families]) => [
        `techniques.category.${category}`,
        `techniques.category.${category}.short`,
        ...families.map((family) => `techniques.family.${family}`),
      ]),
    ]
    expect(built.filter((key) => !exists(key))).toEqual([])
  })
})
