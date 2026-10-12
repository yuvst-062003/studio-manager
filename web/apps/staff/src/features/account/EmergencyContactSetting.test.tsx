// 0025's emergency contact, after the owner moved it out of the launch flow (2026-10-12).
// The component's own file header carries the why; these are the three rules that survived
// the move: assistant coaches only, prefilled from what is on file, and editable afterwards.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import {
  EmergencyContactSetting,
  shouldOfferEmergencyContact,
} from './EmergencyContactSetting'
import type { MyProfile, StaffPeopleClient } from '../people'

const PROFILE = {
  person_id: 'p1',
  first_name: 'יובל',
  last_name: 'סטולין',
  display_name: 'יובל סטולין',
  email: null,
  phone: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  emergency_contact_relation: null,
} as unknown as MyProfile

const client = (over: Partial<StaffPeopleClient> = {}): StaffPeopleClient =>
  ({
    updateMyProfile: vi.fn(() => Promise.resolve(PROFILE)),
    ...over,
  }) as unknown as StaffPeopleClient

describe('who is offered an emergency contact', () => {
  it('is an assistant coach', () => {
    expect(shouldOfferEmergencyContact(['assistant_coach'])).toBe(true)
  })

  it('is an assistant who also manages — on the mat they are the assistant', () => {
    expect(shouldOfferEmergencyContact(['manager', 'assistant_coach'])).toBe(true)
  })

  it('is nobody else — a lead coach, a manager and an owner are adults on staff', () => {
    expect(shouldOfferEmergencyContact(['lead_coach'])).toBe(false)
    expect(shouldOfferEmergencyContact(['manager'])).toBe(false)
    expect(shouldOfferEmergencyContact(['owner', 'manager'])).toBe(false)
  })
})

describe('the setting itself', () => {
  it('saves a name and a number', async () => {
    const updateMyProfile = vi.fn(() => Promise.resolve(PROFILE))
    render(
      <EmergencyContactSetting
        locale="he"
        client={client({ updateMyProfile } as Partial<StaffPeopleClient>)}
        profile={PROFILE}
      />,
    )
    await userEvent.type(screen.getByTestId('emergency-name'), 'רונית גולן')
    await userEvent.type(screen.getByTestId('emergency-phone'), '0521234567')
    await userEvent.click(screen.getByTestId('emergency-save'))

    await waitFor(() =>
      expect(updateMyProfile).toHaveBeenCalledWith({
        emergency_contact_name: 'רונית גולן',
        emergency_contact_phone: '0521234567',
        emergency_contact_relation: '',
      }),
    )
    expect(await screen.findByTestId('emergency-saved')).toBeInTheDocument()
  })

  it('refuses to save a name with no number — an unreachable contact is not one', async () => {
    render(<EmergencyContactSetting locale="he" client={client()} profile={PROFILE} />)
    await userEvent.type(screen.getByTestId('emergency-name'), 'רונית גולן')
    expect(screen.getByTestId('emergency-save')).toBeDisabled()
  })

  it('shows what is already on file, so a number that changed can be corrected', async () => {
    // The first-run step could not do this: it vanished the moment a name existed.
    render(
      <EmergencyContactSetting
        locale="he"
        client={client()}
        profile={
          {
            ...PROFILE,
            emergency_contact_name: 'רונית גולן',
            emergency_contact_phone: '0521234567',
            emergency_contact_relation: 'אמא',
          } as unknown as MyProfile
        }
      />,
    )
    await waitFor(() => expect(screen.getByTestId('emergency-name')).toHaveValue('רונית גולן'))
    expect(screen.getByTestId('emergency-phone')).toHaveValue('0521234567')
    expect(screen.getByTestId('emergency-relation')).toHaveValue('אמא')
  })

  it('says so when the save fails, and keeps what was typed', async () => {
    render(
      <EmergencyContactSetting
        locale="he"
        client={client({
          updateMyProfile: vi.fn(() => Promise.reject(new Error('500'))),
        } as Partial<StaffPeopleClient>)}
        profile={PROFILE}
      />,
    )
    await userEvent.type(screen.getByTestId('emergency-name'), 'רונית גולן')
    await userEvent.type(screen.getByTestId('emergency-phone'), '0521234567')
    await userEvent.click(screen.getByTestId('emergency-save'))

    expect(await screen.findByTestId('emergency-failed')).toHaveTextContent(
      t('he', 'people.emergency.saveFailed'),
    )
    expect(screen.getByTestId('emergency-name')).toHaveValue('רונית גולן')
  })
})
