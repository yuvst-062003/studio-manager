import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkParity, duplicateKeys } from './i18n-parity.mjs'

let root: string

/** A miniature i18n tree, so a deliberately broken fixture proves the checker fires. */
function fixture(bundles: Record<string, Record<string, Record<string, string>>>) {
  writeFileSync(
    join(root, 'types.ts'),
    'export const LOCALES = [\'he\', \'en\', \'ru\'] as const\n' +
      'export const NAMESPACES = [\'common\'] as const\n' +
      'export const REFERENCE_LOCALE = \'he\'\n',
  )
  for (const [locale, namespaces] of Object.entries(bundles)) {
    mkdirSync(join(root, locale), { recursive: true })
    for (const [ns, entries] of Object.entries(namespaces)) {
      writeFileSync(
        join(root, locale, `${ns}.ts`),
        'import type { Bundle } from \'../types\'\n' +
          `export const ${ns}: Bundle = ${JSON.stringify(entries)}\n`,
      )
    }
  }
}

/** Raw source, because `fixture` goes through `JSON.stringify` and an object cannot carry
 *  a duplicate key — which is the whole point: the value this checker has to inspect
 *  cannot be expressed in the value it used to inspect. */
function rawFixture(locale: string, ns: string, body: string) {
  mkdirSync(join(root, locale), { recursive: true })
  writeFileSync(
    join(root, locale, `${ns}.ts`),
    `import type { Bundle } from '../types'\nexport const ${ns}: Bundle = ${body}\n`,
  )
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

describe('duplicate keys — the hole this gate had until 2026-09-07', () => {
  it('finds a key written twice, which the import collapses to one', () => {
    const found = duplicateKeys(
      'export const common: Bundle = {\n  \'a\': \'first\',\n  \'b\': \'x\',\n  \'a\': \'second\',\n}',
      'common',
    )
    expect(found).toEqual([{ key: 'a', count: 2 }])
  })

  it('is not fooled by a colon inside a Hebrew value, which a regex would be', () => {
    // The reason this walks the AST. `'שלום: עולם'` contains `: ` inside a string.
    const found = duplicateKeys(
      'export const common: Bundle = {\n  \'greet\': \'שלום: עולם\',\n  \'bye\': \'להתראות\',\n}',
      'common',
    )
    expect(found).toEqual([])
  })

  it('sees a key whose value is on the next line', () => {
    const found = duplicateKeys(
      'export const common: Bundle = {\n  \'a\':\n    \'first\',\n  \'a\':\n    \'second\',\n}',
      'common',
    )
    expect(found).toEqual([{ key: 'a', count: 2 }])
  })

  it('counts three of the same as three', () => {
    const found = duplicateKeys(
      'export const common: Bundle = {\'a\':\'1\',\'a\':\'2\',\'a\':\'3\'}',
      'common',
    )
    expect(found).toEqual([{ key: 'a', count: 3 }])
  })

  it('fails the whole check, in any locale, not only the reference', async () => {
    fixture({
      he: { common: { hello: 'שלום' } },
      en: { common: { hello: 'Hello' } },
      ru: { common: { hello: 'Привет' } },
    })
    rawFixture('en', 'common', '{\n  \'hello\': \'Hello\',\n  \'hello\': \'Hello again\',\n}')

    const { errors } = await checkParity({ root })
    expect(errors.join('\n')).toMatch(/en\/common\.ts: `hello` appears 2 times/)
  })

  it('says WHY it matters — the last value wins and the others vanish', async () => {
    fixture({
      he: { common: { hello: 'שלום' } },
      en: { common: { hello: 'Hello' } },
      ru: { common: { hello: 'Привет' } },
    })
    rawFixture('he', 'common', '{\n  \'hello\': \'שלום\',\n  \'hello\': \'שלום שוב\',\n}')

    const { errors } = await checkParity({ root })
    expect(errors.join('\n')).toMatch(/silently keeps the LAST value/)
  })
})
