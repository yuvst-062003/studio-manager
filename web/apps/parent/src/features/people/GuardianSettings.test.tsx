// Screen 8 — the profile tab as the guardian's own screen.
//
// The tests that carry weight here are the two negatives and the seam. The screen must NOT
// be titled "students" and must NOT offer the destructive action at all — those are the
// defects the 2026-09-01 redesign named, and both are the kind that come back the moment
// somebody "restores" a child card. And the account edit is asserted through the CLIENT,
// not through component state: a field that never reaches `updateMyProfile` looks identical
// on screen to one that does.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@studio/ui'
import { t } from '@studio/i18n'
import { GuardianSettings } from './GuardianSettings'
import type { MyProfile, PeopleClient, StudentSummary } from './peopleClient'

const student = (over: Partial<StudentSummary> = {}): StudentSummary =>
  ({
    id: 'st1',
    person_id: 'p1',
    first_name: 'דנה',
    last_name: 'הורה',
    birthdate: '2018-05-01',
    status: 'active',
    health_status: 'signed',
    joined_on: '2026-09-01',
    left_on: null,
    group_names: [],
    guardian_display_names: ['שירה הורה'],
    frozen_until: null,
    ...over,
  }) as StudentSummary

const PROFILE: MyProfile = {
  person_id: 'g1',
  first_name: 'שירה',
  last_name: 'הורה',
  display_name: 'שירה הורה',
  email: 'shira@example.invalid',
  phone: '050-1234567',
}

function makeClient(over: Partial<PeopleClient> = {}): PeopleClient {
  return {
    updateMyProfile: vi.fn().mockResolvedValue(PROFILE),
    ...over,
  } as unknown as PeopleClient
}

function renderScreen(props: Partial<Parameters<typeof GuardianSettings>[0]> = {}) {
  return render(
    <ThemeProvider>
      <GuardianSettings
        client={makeClient()}
        locale="he"
        onLocaleChange={() => undefined}
        profile={PROFILE}
        students={[student()]}
        {...props}
      />
    </ThemeProvider>,
  )
}

describe('GuardianSettings — screen 8', () => {
  it('is titled for the tab that opens it, not for the children', () => {
    // The shipped screen read `student.plural` ("חניכים") under a tab labelled "פרופיל".
    renderScreen()
    expect(
      screen.getByRole('heading', { level: 1, name: t('he', 'people.profile.title') }),
    ).toBeTruthy()
    expect(screen.queryByText(t('he', 'people.student.plural'))).toBeNull()
  })

  it('shows the parent their own name, email and phone', () => {
    renderScreen()
    expect(screen.getByText('שירה הורה')).toBeTruthy()
    expect(screen.getByText('shira@example.invalid')).toBeTruthy()
    expect(screen.getByText('050-1234567')).toBeTruthy()
  })

  it('offers no way to remove a child from this screen', () => {
    // The whole point of the chosen arrangement: leaving is rare, permanent, and the
    // month's charge survives it, so it belongs on the child's card and not on the tab a
    // parent opens to correct a phone number.
    renderScreen({ students: [student(), student({ id: 'st2', first_name: 'יוסי' })] })
    expect(screen.queryByText(t('he', 'people.leave.title'))).toBeNull()
    expect(screen.queryByText(t('he', 'people.leave.submit'))).toBeNull()
  })

  it('sends only the fields that actually changed', async () => {
    // The seam. A screen that PATCHed all four every time would overwrite a co-parent's
    // correction made between the read and the save, and nothing on screen would show it.
    const updateMyProfile = vi.fn().mockResolvedValue({ ...PROFILE, phone: '052-7654321' })
    renderScreen({ client: makeClient({ updateMyProfile } as Partial<PeopleClient>) })

    await userEvent.click(screen.getByTestId('profile-row-name'))
    const phone = screen.getByLabelText(t('he', 'people.profile.phone'))
    await userEvent.clear(phone)
    await userEvent.type(phone, '052-7654321')
    await userEvent.click(screen.getByText(t('he', 'people.profile.save')))

    await waitFor(() => expect(updateMyProfile).toHaveBeenCalledTimes(1))
    expect(updateMyProfile).toHaveBeenCalledWith({ phone: '052-7654321' })
  })

  it('clears a phone number as an explicit null rather than an empty string', async () => {
    // `null` is what the server reads as "clear it"; an absent key means "leave it alone"
    // and `''` would store a blank that renders as a working tel: link dialling nothing —
    // the defect `ProfileAndLeave` already shipped once.
    const updateMyProfile = vi.fn().mockResolvedValue({ ...PROFILE, phone: null })
    renderScreen({ client: makeClient({ updateMyProfile } as Partial<PeopleClient>) })

    await userEvent.click(screen.getByTestId('profile-row-name'))
    await userEvent.clear(screen.getByLabelText(t('he', 'people.profile.phone')))
    await userEvent.click(screen.getByText(t('he', 'people.profile.save')))

    await waitFor(() => expect(updateMyProfile).toHaveBeenCalledWith({ phone: null }))
  })

  it('leads to each child rather than acting on them', () => {
    renderScreen({ students: [student(), student({ id: 'st2', first_name: 'נעמי' })] })
    expect(screen.getByTestId('profile-child-st1').getAttribute('href')).toBe('#/student/st1')
    expect(screen.getByTestId('profile-child-st2').getAttribute('href')).toBe('#/student/st2')
  })

  it('puts the club telephone in a real row inside the page', () => {
    // It used to render below the tab bar, outside the scroll region: visible in the
    // capture, unreachable with a finger.
    renderScreen({ studio: { name: 'מועדון הדגמה', address: 'הרצל 15', phone: '03-1234567' } })
    expect(screen.getByTestId('profile-club-phone').getAttribute('href')).toBe('tel:03-1234567')
  })

  it('offers no telephone link when the club has not set one', () => {
    renderScreen({ studio: { name: 'מועדון הדגמה', address: null, phone: null } })
    expect(screen.getByTestId('profile-club-phone').getAttribute('href')).toBeNull()
  })

  it('turns notifications off as well as on', async () => {
    // §5.11 permits push and a one-way in-app notice. Until `DELETE /push-tokens` existed
    // a parent could reach only the first and never leave it, so a switch here would have
    // been a control that lies about its own state the moment it is flipped back.
    const onChange = vi.fn()
    renderScreen({ notifications: { enabled: true, onChange } })
    await userEvent.click(screen.getByRole('switch', { name: t('he', 'people.profile.notifications') }))
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('draws no notifications switch where push cannot exist', () => {
    // §6.5 — on an iOS browser tab push is "absent, not denied". A control that cannot
    // move is worse than no control.
    renderScreen({ notifications: null })
    expect(screen.queryByRole('switch')).toBeNull()
  })
})
