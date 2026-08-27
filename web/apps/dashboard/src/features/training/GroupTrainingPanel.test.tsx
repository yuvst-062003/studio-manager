// What a group IS, for the purposes of a training plan.
//
// The rule under test is §2's: `kind` is set by the manager EXPLICITLY and is never derived
// from the class or the printed colour. Sunday's Judo 8-12 is a judo class in every other
// sense and is printed the same blue as the base groups; functionally it is an extra.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { GroupTrainingPanel } from './GroupTrainingPanel'
import type { TrainingClient, TrainingGroup } from './trainingClient'

const LOCALE = 'he' as const

const GROUPS: TrainingGroup[] = [
  { id: 'g2', name: 'קבוצה 2', kind: 'base', is_invite_only: false },
  { id: 'g3', name: 'קבוצה 3', kind: 'base', is_invite_only: false },
  { id: 'cf', name: 'קרוספיט שני', kind: 'extra', is_invite_only: false },
]

function stub(overrides: Partial<TrainingClient> = {}): TrainingClient {
  return {
    groups: vi.fn().mockResolvedValue(GROUPS),
    setKind: vi.fn().mockResolvedValue(undefined),
    eligibility: vi.fn().mockResolvedValue([]),
    setEligibility: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as TrainingClient
}

describe('the manager’s group switches', () => {
  it('sets the kind explicitly, because nothing derives it', async () => {
    const setKind = vi.fn().mockResolvedValue(undefined)
    render(<GroupTrainingPanel locale={LOCALE} groupId="cf" client={stub({ setKind })} />)
    await screen.findByTestId('group-training')
    await userEvent.click(screen.getByRole('radio', { name: t(LOCALE, 'schedule.plan.group.kind.private') }))
    expect(setKind).toHaveBeenCalledWith('cf', { kind: 'private' })
  })

  it('turns a group into an invite list', async () => {
    // §4.1 — the Girls Team, and why `person` gains no gender column. Eligibility comes
    // from an enrollment the manager creates rather than from a personal-data field about
    // a minor.
    const setKind = vi.fn().mockResolvedValue(undefined)
    render(<GroupTrainingPanel locale={LOCALE} groupId="cf" client={stub({ setKind })} />)
    const invite = await screen.findByTestId('group-invite-only')
    // By role rather than by clicking the wrapper: `Switch` renders its own control, and a
    // testid on a span would let it stop being a control without a test noticing.
    await userEvent.click(within(invite).getByRole('switch'))
    expect(setKind).toHaveBeenCalledWith('cf', { is_invite_only: true })
  })

  it('offers only BASE groups on the eligibility checklist', async () => {
    // The link is base-group → extra-group. Offering an extra as a source would let a
    // manager build a chain nothing reads.
    render(<GroupTrainingPanel locale={LOCALE} groupId="cf" client={stub()} />)
    const list = await screen.findByTestId('group-eligibility')
    expect(within(list).getAllByRole('checkbox')).toHaveLength(2)
  })

  it('saves the checklist as a whole', async () => {
    const setEligibility = vi.fn().mockResolvedValue(undefined)
    render(
      <GroupTrainingPanel
        locale={LOCALE}
        groupId="cf"
        client={stub({ eligibility: vi.fn().mockResolvedValue(['g3']), setEligibility })}
      />,
    )
    const list = await screen.findByTestId('group-eligibility')
    await userEvent.click(within(list).getAllByRole('checkbox')[0]!)
    await waitFor(() => expect(setEligibility).toHaveBeenCalled())
    expect(setEligibility).toHaveBeenCalledWith('cf', ['g3', 'g2'])
  })

  it('hides the eligibility checklist for an invite-only group', async () => {
    // Its eligibility comes from an enrollment, so a link table the rules never read for
    // it would be a control that quietly does nothing.
    render(
      <GroupTrainingPanel
        locale={LOCALE}
        groupId="cf"
        client={stub({
          groups: vi
            .fn()
            .mockResolvedValue([...GROUPS.slice(0, 2), { ...GROUPS[2]!, is_invite_only: true }]),
        })}
      />,
    )
    await screen.findByTestId('group-training')
    expect(screen.queryByTestId('group-eligibility')).not.toBeInTheDocument()
  })

  it('shows no eligibility checklist for a base group either', async () => {
    render(<GroupTrainingPanel locale={LOCALE} groupId="g2" client={stub()} />)
    await screen.findByTestId('group-training')
    expect(screen.queryByTestId('group-eligibility')).not.toBeInTheDocument()
  })
})
