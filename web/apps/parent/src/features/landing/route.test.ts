import { describe, expect, it } from 'vitest'
import { landingSlugFor, matchLandingPath } from './route'

describe('matchLandingPath', () => {
  it('matches §5.4a’s /t/{studio-slug}', () => {
    expect(matchLandingPath('/t/judo-tel-aviv')).toEqual({ slug: 'judo-tel-aviv' })
  })

  it('tolerates a trailing slash, because a QR generator will add one', () => {
    expect(matchLandingPath('/t/judo-tel-aviv/')).toEqual({ slug: 'judo-tel-aviv' })
  })

  it('is a real path and not a hash, because this URL goes on a flyer', () => {
    // The other two apps route on location.hash. This one cannot: a hash is invisible to a
    // link preview and awkward inside a printed QR code.
    expect(matchLandingPath('/#/t/judo-tel-aviv')).toBeNull()
  })

  it('does not match the app’s own routes', () => {
    expect(matchLandingPath('/')).toBeNull()
    expect(matchLandingPath('/payments')).toBeNull()
    expect(matchLandingPath('/t')).toBeNull()
  })

  it('rejects a slug that could address a different endpoint', () => {
    // The slug reaches an API path. Anything with a separator, a dot or an escape in it is
    // a crafted link, not a club.
    expect(matchLandingPath('/t/a/b')).toBeNull()
    expect(matchLandingPath('/t/..')).toBeNull()
    expect(matchLandingPath('/t/a%2Fb')).toBeNull()
    expect(matchLandingPath('/t/UPPER')).toBeNull()
  })
})

describe('landingSlugFor — the club at the apex (#25)', () => {
  // §5.4a ① puts the landing at `/t/{slug}` and that stays the canonical URL. #25 asks for
  // the club's shop window at `gladiatorclub.co.il` rather than under `app.`, and the root
  // of the parent app renders the sign-in wall — so DNS alone would point the apex at a
  // login box.
  //
  // **Keyed on the HOST, not on the path alone.** One Railway service answers for both
  // `app.` and the apex from a single build, so a rule that claimed every root would have
  // turned `app.gladiatorclub.co.il/` into a marketing page for parents who are already
  // members. The sign-in state cannot decide it either: `App()` resolves the public routes
  // before any session hook runs, deliberately, and the in-memory token is empty on a cold
  // load even for a returning parent — so that test would show the landing to a member
  // every time they opened the app fresh.
  const APEX = ['gladiatorclub.co.il', 'www.gladiatorclub.co.il']

  it('serves the configured club at the root of a landing host', () => {
    expect(landingSlugFor('/', 'gladiator', APEX, 'gladiatorclub.co.il')).toBe('gladiator')
    expect(landingSlugFor('/', 'gladiator', APEX, 'www.gladiatorclub.co.il')).toBe('gladiator')
  })

  it('leaves the app host alone, which is the whole point', () => {
    // A signed-in parent opening `app.gladiatorclub.co.il` must reach their app, not the
    // club's advertisement.
    expect(landingSlugFor('/', 'gladiator', APEX, 'app.gladiatorclub.co.il')).toBeNull()
  })

  it('serves nothing when no club or no host is configured', () => {
    // Every environment but production. `''` is what an unset build variable collapses to,
    // and it must never become a slug — `/t/` 404s against the API and would render a
    // refusal on the one page a stranger sees first.
    expect(landingSlugFor('/', '', APEX, 'gladiatorclub.co.il')).toBeNull()
    expect(landingSlugFor('/', undefined, APEX, 'gladiatorclub.co.il')).toBeNull()
    expect(landingSlugFor('/', 'gladiator', [], 'gladiatorclub.co.il')).toBeNull()
  })

  it('still prefers an explicit /t/{slug}, on any host', () => {
    // The canonical URL keeps working and keeps naming its own club. A flyer QR printed for
    // one club must not resolve to whichever club the build was configured with.
    expect(landingSlugFor('/t/other-club', 'gladiator', APEX, 'app.gladiatorclub.co.il')).toBe(
      'other-club',
    )
  })

  it('leaves every other path alone', () => {
    expect(landingSlugFor('/join/abc', 'gladiator', APEX, 'gladiatorclub.co.il')).toBeNull()
    expect(landingSlugFor('/anything', 'gladiator', APEX, 'gladiatorclub.co.il')).toBeNull()
  })
})

