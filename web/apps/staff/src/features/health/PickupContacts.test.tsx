// The door surface. What a coach can read, and what they cannot.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { PickupContacts } from './PickupContacts'

const student = { id: 'st-1' }

describe('PickupContacts', () => {
  it('lists who may collect the child, with a phone a coach can tap', async () => {
    const load = vi.fn().mockResolvedValue({
      pickup_contacts: [{ name: 'סבתא רותי', phone: '050-1111111', relation: 'סבתא' }],
    })
    render(<PickupContacts load={load} locale="he" student={student} />)
    expect(await screen.findByText('סבתא רותי')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '050-1111111' })).toHaveAttribute(
      'href',
      'tel:050-1111111',
    )
  })

  it('says out loud that nobody is authorised, rather than rendering blank', async () => {
    // An empty section reads as "not loaded yet". A coach guessing whether the list is empty
    // or merely missing is the one outcome this section cannot afford.
    const load = vi.fn().mockResolvedValue({ pickup_contacts: [] })
    render(<PickupContacts load={load} locale="he" student={student} />)
    expect(await screen.findByText(t('he', 'health.registration.pickupNone'))).toBeInTheDocument()
  })

  it('degrades to the empty state when the read fails', async () => {
    // This card is opened mid-class with one hand. A section that throws takes the
    // attendance marks down with it.
    const load = vi.fn().mockRejectedValue(new Error('offline'))
    render(<PickupContacts load={load} locale="he" student={student} />)
    expect(await screen.findByText(t('he', 'health.registration.pickupNone'))).toBeInTheDocument()
  })

  it('never renders the aliyah year even if the API sent one', async () => {
    // National-origin data for the עמותה's funding return. The API withholds it below
    // manager; this asserts the coach's card would not show it even if that failed.
    const load = vi.fn().mockResolvedValue({
      pickup_contacts: [{ name: 'דוד יוסי', phone: '050-2222222' }],
      aliyah_years: ['2019'],
    })
    render(<PickupContacts load={load} locale="he" student={student} />)
    await screen.findByText('דוד יוסי')
    expect(screen.queryByText('2019')).not.toBeInTheDocument()
  })
})
