import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { JoinFamilyStep } from './JoinFamilyStep'

const groups = [{ id: 'g1', name: 'ילדים א', weekdays: [0, 2] }]

describe('JoinFamilyStep (flat list)', () => {
  it('starts with an empty subject list and requires at least one row before submitting', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    expect(screen.queryByLabelText(t('he', 'people.join.birthdate'))).toBeNull()
    await user.click(screen.getByTestId('join-submit'))
    expect(onSubmit).not.toHaveBeenCalled()
    await screen.findByRole('alert')
    expect(screen.getAllByText(t('he', 'people.join.required')).length).toBeGreaterThan(0)
  })

  it('the forward button is never disabled, even while invalid', () => {
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByTestId('join-submit')).not.toBeDisabled()
  })

  it('"I train too" adds a self row with no name/birthdate fields, and no parent/pickup cards', async () => {
    const user = userEvent.setup()
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    await user.click(screen.getByTestId('join-add-self'))
    expect(screen.queryByLabelText(t('he', 'people.join.birthdate'))).toBeNull()
    expect(screen.queryByText(t('he', 'people.join.pickupTitle'))).toBeNull()
    // only one signer -- the button disappears once a self row exists
    expect(screen.queryByTestId('join-add-self')).toBeNull()
  })

  it('a minor child row shows the parent/pickup cards by default; a second minor row does not duplicate them', async () => {
    const user = userEvent.setup()
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    await user.click(screen.getByTestId('join-add-child'))
    expect(screen.getAllByText(t('he', 'people.join.pickupTitle'))).toHaveLength(1)
    await user.click(screen.getByTestId('join-add-child'))
    expect(screen.getAllByText(t('he', 'people.join.pickupTitle'))).toHaveLength(1)
  })

  it('an 18+ row hides the parent/pickup section once it is the only subject', async () => {
    const user = userEvent.setup()
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    await user.click(screen.getByTestId('join-add-child'))
    await user.click(screen.getAllByRole('radio', { name: t('he', 'health.declaration.yes') })[0]!)
    expect(screen.queryByText(t('he', 'people.join.pickupTitle'))).toBeNull()
  })

  it('submits a valid flat-list payload with one self row', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <JoinFamilyStep
        displayName="מיכל כהן"
        email={null}
        groups={groups}
        locale="he"
        onBack={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    await user.type(screen.getByLabelText(t('he', 'people.join.nationalId')), '100000017')
    await user.type(screen.getByLabelText(t('he', 'people.join.address')), 'הרצל 12')
    await user.type(screen.getByLabelText(t('he', 'people.join.city')), 'רעננה')
    await user.type(screen.getByLabelText(t('he', 'people.join.phone')), '0548123456')
    await user.click(screen.getByTestId('join-add-self'))
    await user.click(screen.getByRole('checkbox', { name: 'ילדים א · ראשון·שלישי' }))
    await user.click(screen.getByTestId('join-submit'))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        children: [
          expect.objectContaining({ self_student: true, group_ids: ['g1'] }),
        ],
      }),
    )
  })
})
