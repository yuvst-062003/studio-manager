import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { IPN_SHAPES } from '../../packages/ui/src/dev-bar/api'

/**
 * §19.5's four shapes are named in two languages: `IpnShape` in
 * app/integrations/upay/ipn.py and IPN_SHAPES here. The endpoint rejects an unknown
 * value with a 422, so a drift between them is a runtime failure in the one tool that
 * exists to make §5.10's four security requirements testable.
 *
 * Source-level by necessity, and this is the same technique i18n-parity.mjs uses: the
 * committed openapi.json is exported from the PRODUCTION app (see
 * scripts/export_openapi.py), which by §19.2 has no /dev surface at all — so the schema
 * cannot be the shared source of truth here.
 */
const PY = new URL('../../../app/integrations/upay/ipn.py', import.meta.url)

describe('the IPN shape names agree across the two languages', () => {
  it('matches the Python enum member for member', () => {
    const source = readFileSync(PY, 'utf-8')
    const block = source.slice(source.indexOf('class IpnShape'))
    const members = [...block.matchAll(/^\s{4}[A-Z_]+ = "([a-z_]+)"$/gm)].map((m) => m[1])
    expect(members.sort()).toEqual([...IPN_SHAPES].sort())
  })
})
