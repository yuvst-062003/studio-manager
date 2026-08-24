import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkParity } from './i18n-parity.mjs'

let root: string

/** A miniature i18n tree, so a deliberately broken fixture proves the checker fires. */
function fixture(bundles: Record<string, Record<string, Record<string, string>>>) {
  writeFileSync(
    join(root, 'types.ts'),
    `export const LOCALES = ['he', 'en', 'ru'] as const\n` +
      `export const NAMESPACES = ['common'] as const\n` +
      `export const REFERENCE_LOCALE = 'he'\n`,
  )
  for (const [locale, namespaces] of Object.entries(bundles)) {
    mkdirSync(join(root, locale), { recursive: true })
    for (const [ns, entries] of Object.entries(namespaces)) {
      writeFileSync(
        join(root, locale, `${ns}.ts`),
        `import type { Bundle } from '../types'\n` +
          `export const ${ns}: Bundle = ${JSON.stringify(entries)}\n`,
      )
    }
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'i18n-parity-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('i18n parity (seam 3, SPEC §9)', () => {
  it('passes when every locale matches the reference', async () => {
    fixture({
      he: { common: { hello: 'שלום' } },
      en: { common: { hello: 'Hello' } },
      ru: { common: { hello: 'Привет' } },
    })
    const { errors } = await checkParity({ root })
    expect(errors).toEqual([])
  })

  it('errors on a key that exists in en but not in he', async () => {
    fixture({
      he: { common: { hello: 'שלום' } },
      en: { common: { hello: 'Hello', orphan: 'nope' } },
      ru: { common: { hello: 'Привет' } },
    })
    const { errors } = await checkParity({ root })
    expect(errors.join('\n')).toMatch(/orphan/)
  })

  it('errors on a missing en translation, because en is strict', async () => {
    fixture({
      he: { common: { hello: 'שלום', bye: 'להתראות' } },
      en: { common: { hello: 'Hello' } },
      ru: { common: { hello: 'Привет' } },
    })
    const { errors } = await checkParity({ root })
    expect(errors.join('\n')).toMatch(/en\/common\.ts: 1 untranslated/)
  })

  it('reports rather than errors on a missing ru translation', async () => {
    // SPEC §15 item 9 — the ru translation source is still outstanding, and §9 says
    // missing keys fall back to Hebrew and are *reported* per locale.
    fixture({
      he: { common: { hello: 'שלום', bye: 'להתראות' } },
      en: { common: { hello: 'Hello', bye: 'Bye' } },
      ru: { common: { hello: 'Привет' } },
    })
    const { errors, report } = await checkParity({ root })
    expect(errors).toEqual([])
    expect(report.join('\n')).toMatch(/ru\/common\.ts: 1 untranslated/)
  })

  it('errors on an empty string, which renders as a blank label', async () => {
    fixture({
      he: { common: { hello: 'שלום' } },
      en: { common: { hello: '' } },
      ru: { common: { hello: 'Привет' } },
    })
    const { errors } = await checkParity({ root })
    expect(errors.join('\n')).toMatch(/is empty/)
  })

  it('errors on a missing namespace file', async () => {
    fixture({ he: { common: { hello: 'שלום' } }, en: { common: { hello: 'Hello' } } })
    const { errors } = await checkParity({ root })
    expect(errors.join('\n')).toMatch(/ru\/common\.ts is missing/)
  })

  it('errors on an unknown namespace rather than silently checking nothing', async () => {
    fixture({
      he: { common: { hello: 'שלום' } },
      en: { common: { hello: 'Hello' } },
      ru: { common: { hello: 'Привет' } },
    })
    const { errors } = await checkParity({ root, namespace: 'no-such-namespace' })
    expect(errors.join('\n')).toMatch(/unknown namespace/)
  })

  it('checks the real tree it ships against', async () => {
    const { errors } = await checkParity({})
    expect(errors).toEqual([])
  })
})
