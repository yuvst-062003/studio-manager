#!/usr/bin/env node
/**
 * Seam 3's parity check.  `node web/scripts/i18n-parity.mjs [namespace]`
 *
 * Scoped to one namespace so it is part of a lane's own check rather than only CI's — a
 * lane that adds Hebrew keys learns about the gap before it merges, not after. With no
 * argument it checks all nine.
 *
 * Lives in web/scripts/ rather than the milestone plan's scripts/, because that is where
 * node dependencies resolve and `typescript` is a web devDependency. The namespace files
 * are TypeScript carrying a single `import type`, so transpiling and importing them is
 * exact where a regex would be a guess.
 *
 * ── What is an error, and what is only reported ──────────────────────────────────
 * SPEC §9: "Hebrew is the reference locale. Missing keys in other locales fall back to
 * Hebrew and are reported by a CI check that lists untranslated keys per locale." So a
 * missing translation is a report, not automatically a failure — but a report nobody
 * fails on is a report nobody reads. The policy below splits it per locale:
 *
 *   en   strict   complete today, so the gate genuinely bites
 *   ru   report   SPEC §15 item 9 (the ru translation source) is still outstanding, and
 *                 web/packages/i18n/ru/common.ts is partial by design. Change this one
 *                 word to 'strict' when the translation source lands.
 *
 * Orphan keys, missing namespace files, non-string values and empty strings are hard
 * errors in every locale: none of them is a translation gap, they are all bugs.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = resolve(HERE, '../packages/i18n')

export const POLICY = { en: 'strict', ru: 'report' }

async function loadModule(path) {
  const source = await readFile(path, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  })
  const encoded = Buffer.from(outputText, 'utf8').toString('base64')
  return import(`data:text/javascript;base64,${encoded}`)
}

export async function checkParity({ root = DEFAULT_ROOT, namespace } = {}) {
  const errors = []
  const report = []

  const { LOCALES, NAMESPACES, REFERENCE_LOCALE } = await loadModule(join(root, 'types.ts'))

  if (namespace && !NAMESPACES.includes(namespace)) {
    errors.push(`unknown namespace \`${namespace}\` — expected one of ${NAMESPACES.join(', ')}`)
    return { errors, report }
  }

  for (const ns of namespace ? [namespace] : NAMESPACES) {
    const bundles = {}
    for (const locale of LOCALES) {
      const file = join(root, locale, `${ns}.ts`)
      if (!existsSync(file)) {
        errors.push(
          `${locale}/${ns}.ts is missing — index.ts lists every namespace in every locale`,
        )
        continue
      }
      const bundle = (await loadModule(file))[ns]
      if (!bundle || typeof bundle !== 'object') {
        errors.push(`${locale}/${ns}.ts does not export \`${ns}\``)
        continue
      }
      for (const [key, value] of Object.entries(bundle)) {
        if (typeof value !== 'string') {
          errors.push(`${locale}/${ns}.ts: \`${key}\` is not a string`)
        } else if (value.trim() === '') {
          errors.push(`${locale}/${ns}.ts: \`${key}\` is empty — a blank label reads as broken`)
        }
      }
      bundles[locale] = bundle
    }

    const reference = bundles[REFERENCE_LOCALE]
    if (!reference) continue

    for (const locale of LOCALES) {
      if (locale === REFERENCE_LOCALE || !bundles[locale]) continue

      for (const key of Object.keys(bundles[locale])) {
        if (!(key in reference)) {
          errors.push(
            `${locale}/${ns}.ts: \`${key}\` has no ${REFERENCE_LOCALE} source — ` +
              'Hebrew is the reference locale (SPEC §9)',
          )
        }
      }

      const missing = Object.keys(reference).filter((key) => !(key in bundles[locale]))
      if (missing.length === 0) continue
      const shown = missing.slice(0, 5).join(', ') + (missing.length > 5 ? ', …' : '')
      const line = `${locale}/${ns}.ts: ${missing.length} untranslated (${shown})`
      if (POLICY[locale] === 'strict') errors.push(line)
      else report.push(line)
    }
  }

  return { errors, report }
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (invokedDirectly) {
  const namespace = process.argv[2]
  const { errors, report } = await checkParity({ namespace })
  for (const line of report) console.log(`   · ${line}`)
  for (const line of errors) console.error(`   ✗ ${line}`)
  if (errors.length) {
    console.error(`\n${errors.length} i18n parity error(s)`)
    process.exit(1)
  }
  console.log(`✅ i18n parity${namespace ? ` · ${namespace}` : ' · all namespaces'}`)
}
