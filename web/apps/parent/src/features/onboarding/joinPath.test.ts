import { describe, expect, it } from 'vitest'
import { matchJoinPath } from './joinPath'

describe('matchJoinPath', () => {
  it('matches /join/{token} and captures the token', () => {
    expect(matchJoinPath('/join/abcdEFGH12345678')).toBe('abcdEFGH12345678')
  })

  it('accepts underscores and hyphens, the same charset a real token is generated from', () => {
    expect(matchJoinPath('/join/abcd-EFGH_1234-5678')).toBe('abcd-EFGH_1234-5678')
  })

  it('rejects a token shorter than 16 characters', () => {
    expect(matchJoinPath('/join/short')).toBeNull()
  })

  it('is a real path and not a hash: the URL lives in a WhatsApp message and must survive being tapped cold', () => {
    expect(matchJoinPath('/#/join/abcdEFGH12345678')).toBeNull()
  })

  it('does not match the app\'s own routes', () => {
    expect(matchJoinPath('/')).toBeNull()
    expect(matchJoinPath('/payments')).toBeNull()
    expect(matchJoinPath('/join')).toBeNull()
    expect(matchJoinPath('/join/')).toBeNull()
  })

  it('rejects a token with a trailing slash or extra path segment', () => {
    expect(matchJoinPath('/join/abcdEFGH12345678/')).toBeNull()
    expect(matchJoinPath('/join/abcdEFGH12345678/extra')).toBeNull()
  })

  it('rejects characters outside the token charset, such as a stray dot or slash', () => {
    expect(matchJoinPath('/join/abcdEFGH1234567.')).toBeNull()
    expect(matchJoinPath('/join/abcdEFGH1234%20')).toBeNull()
  })
})
