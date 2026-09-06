import { describe, expect, it } from 'vitest'
import { phoneList, whatsappShareUrl } from './comms'

describe('phoneList', () => {
  it('newline-joins the phones it is given', () => {
    expect(phoneList([{ phone: '050-1112222' }, { phone: '052-3334444' }])).toBe(
      '050-1112222\n052-3334444',
    )
  })

  it('drops a family with no number rather than pasting a blank line', () => {
    expect(
      phoneList([{ phone: '050-1112222' }, { phone: null }, { phone: '052-3334444' }]),
    ).toBe('050-1112222\n052-3334444')
  })

  it('returns an empty string for no rows, and for undefined', () => {
    expect(phoneList([])).toBe('')
    expect(phoneList(undefined)).toBe('')
  })
})

describe('whatsappShareUrl', () => {
  it('joins title and body with a blank line and url-encodes the result', () => {
    const url = whatsappShareUrl('אימון היום', 'נשמח לאישור הגעה')
    expect(url).toBe(
      `https://wa.me/?text=${encodeURIComponent('אימון היום\n\nנשמח לאישור הגעה')}`,
    )
  })

  it('embeds no phone number — this is a share handoff, never a one-to-one send', () => {
    expect(whatsappShareUrl('כותרת', 'גוף')).not.toMatch(/wa\.me\/\d/)
  })
})
