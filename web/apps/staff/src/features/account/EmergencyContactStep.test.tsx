// Revision 0025 — asked of ASSISTANT COACHES and nobody else.
//
// The first block is the rule, tested as a pure function so it can be asserted without
// rendering anything. The last test is the one that matters most, and it is not about this
// component: a step that the shell never mounts asks nobody anything.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { EmergencyContactStep, shouldAskForEmergencyContact } from './EmergencyContactStep'

describe('who gets asked', () => {
  it('asks an assistant coach with nothing on file', () => {
    expect(shouldAskForEmergencyContact(['assistant_coach'], null)).toBe(true)
  })

  it.each([['lead_coach'], ['manager'], ['owner']])('never asks a %s', (role) => {
    // An adult member of staff whose details the club already holds through employment.
    // Collecting a next-of-kin from them would be gathering a third party's data the
    // product has no use for.
    expect(shouldAskForEmergencyContact([role], null)).toBe(false)
  })

  it('asks somebody who is both an assistant and a manager', () => {
    // They are on the mat as an assistant, and being asked is the safer of the two errors.
    expect(shouldAskForEmergencyContact(['assistant_coach', 'manager'], null)).toBe(true)
  })

  it('stops asking the moment something is on file', () => {
    expect(shouldAskForEmergencyContact(['assistant_coach'], 'רונית גולן')).toBe(false)
  })

  it('asks nobody with no roles at all', () => {
    expect(shouldAskForEmergencyContact([], null)).toBe(false)
  })
})

describe('the step itself', () => {
  const renderStep = (overrides: { onSave?: () => Promise<void>; onSkip?: () => void } = {}) => {
    const onSave = overrides.onSave ?? vi.fn(async () => undefined)
    const onSkip = overrides.onSkip ?? vi.fn()
    render(<EmergencyContactStep locale="he" onSave={onSave} onSkip={onSkip} />)
    return { onSave, onSkip }
  }

  it('saves a name, a phone and a relation', async () => {
    const { onSave } = renderStep()
    await userEvent.type(screen.getByTestId('emergency-name'), 'רונית גולן')
    await userEvent.type(screen.getByTestId('emergency-phone'), '0521234567')
    await userEvent.type(screen.getByTestId('emergency-relation'), 'אמא')
    await userEvent.click(screen.getByTestId('emergency-save'))

    expect(onSave).toHaveBeenCalledWith({
      emergency_contact_name: 'רונית גולן',
      emergency_contact_phone: '0521234567',
      emergency_contact_relation: 'אמא',
    })
  })

  it('needs a name and a number, but not a relationship', async () => {
    renderStep()
    expect(screen.getByTestId('emergency-save')).toBeDisabled()
    await userEvent.type(screen.getByTestId('emergency-name'), 'רונית')
    expect(screen.getByTestId('emergency-save')).toBeDisabled()
    await userEvent.type(screen.getByTestId('emergency-phone'), '052')
    // A blank relationship never stopped anybody dialling.
    expect(screen.getByTestId('emergency-save')).toBeEnabled()
  })

  it('can be postponed, because a hard block makes records worse and nobody safer', async () => {
    const { onSkip } = renderStep()
    await userEvent.click(screen.getByTestId('emergency-skip'))
    expect(onSkip).toHaveBeenCalled()
  })

  it('stays up when the save fails — an unrecorded number is one nobody can call', async () => {
    renderStep({
      onSave: vi.fn(async () => {
        throw new Error('500')
      }),
    })
    await userEvent.type(screen.getByTestId('emergency-name'), 'רונית')
    await userEvent.type(screen.getByTestId('emergency-phone'), '052')
    await userEvent.click(screen.getByTestId('emergency-save'))

    expect(await screen.findByTestId('emergency-failed')).toBeInTheDocument()
    expect(screen.getByTestId('emergency-contact-step')).toBeInTheDocument()
  })

  it('says who can see it, before asking for a third party number', async () => {
    renderStep()
    await waitFor(() =>
      expect(screen.getByText(t('he', 'people.emergency.body'))).toBeInTheDocument(),
    )
  })
})
