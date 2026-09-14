import { describe, expect, it } from 'vitest'

import { clubPublicUrl, shareClubHref } from './shareClub'

const APEX = ['gladiatorclub.co.il', 'www.gladiatorclub.co.il']

describe('clubPublicUrl — the link a stranger opens', () => {
  it('shares the apex, not the app the sender happens to be standing in', () => {
    // The whole failure this guards: `location.origin` inside the parent app is
    // `app.gladiatorclub.co.il`, whose `/` is the SIGN-IN WALL (#25 — the host decides, and
    // `app.` keeps its root for members). Sharing that sends a friend with no account to a
    // login box, which is the one audience the link exists for.
    expect(clubPublicUrl('gladiator', APEX, 'https://app.gladiatorclub.co.il')).toBe(
      'https://gladiatorclub.co.il/',
    )
  })

  it('prefers the first configured host, so the short domain is the one that travels', () => {
    expect(clubPublicUrl('gladiator', ['www.gladiatorclub.co.il', 'gladiatorclub.co.il'], 'x')).toBe(
      'https://www.gladiatorclub.co.il/',
    )
  })

  it('falls back to the canonical /t/{slug}, which resolves on every host', () => {
    // Staging and development configure no apex. `/t/{slug}` is canonical and matched
    // first on every host (`route.ts`), so this is always right — just longer.
    expect(clubPublicUrl('gladiator', [], 'https://app.staging.gladiatorclub.co.il')).toBe(
      'https://app.staging.gladiatorclub.co.il/t/gladiator',
    )
  })

  it('does not double the slash when the origin already carries one', () => {
    expect(clubPublicUrl('gladiator', [], 'https://example.test/')).toBe(
      'https://example.test/t/gladiator',
    )
  })

  it('returns null with no slug, so the button hides rather than sharing a broken link', () => {
    // An unset `VITE_LANDING_SLUG` collapses to `''`. `/t/` 404s against the API, so a
    // share button built on it hands a friend a refusal page — worse than no button.
    for (const slug of [undefined, '', '   ']) {
      expect(clubPublicUrl(slug, APEX, 'https://app.test')).toBeNull()
    }
  })
})

describe('shareClubHref — the hand-off', () => {
  it('names no recipient, so the sender chooses and nothing about them leaves the device', () => {
    // §5.11's rule, inherited: `wa.me/?text=` opens the share sheet. A `wa.me/<number>` URL
    // would put a phone number in a link, and the unofficial send APIs get numbers banned.
    const href = shareClubHref('בואו להתאמן איתנו', 'https://gladiatorclub.co.il/')
    expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/)
    expect(href).not.toMatch(/wa\.me\/\d/)
  })

  it('carries both the message and the link, encoded', () => {
    const href = shareClubHref('בואו להתאמן איתנו', 'https://gladiatorclub.co.il/')
    expect(decodeURIComponent(href)).toContain('בואו להתאמן איתנו')
    expect(decodeURIComponent(href)).toContain('https://gladiatorclub.co.il/')
  })
})
