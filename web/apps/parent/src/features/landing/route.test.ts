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
  // of the parent app currently renders the sign-in wall — so DNS alone would point the
  // apex at a login box.
  //
  // The variable is what makes this safe: an environment that does not set it behaves
  // exactly as before, so `app.` and staging are untouched by the domain move.
  it('serves the configured club at the root', () => {
    expect(landingSlugFor('/', 'gladiator')).toBe('gladiator')
  })

  it('serves nothing at the root when no club is configured', () => {
    // Every environment but production. `''` is what an unset `import.meta.env` read
    // collapses to, and it must not become a slug — `/t/` would 404 against the API and
    // render a refusal on the one page a stranger sees first.
    expect(landingSlugFor('/', '')).toBeNull()
    expect(landingSlugFor('/', undefined)).toBeNull()
  })

  it('still prefers an explicit /t/{slug} over the configured one', () => {
    // The canonical URL keeps working and keeps naming its own club. A flyer QR printed
    // for one club must not resolve to whichever club the build was configured with.
    expect(landingSlugFor('/t/other-club', 'gladiator')).toBe('other-club')
  })

  it('leaves every other path alone', () => {
    // `/join/{token}` and the signed-in app both live under paths this must not claim.
    expect(landingSlugFor('/join/abc', 'gladiator')).toBeNull()
    expect(landingSlugFor('/anything', 'gladiator')).toBeNull()
  })
})
