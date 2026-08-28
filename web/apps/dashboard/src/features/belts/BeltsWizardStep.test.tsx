// Artboard 5d — אשף · שלב 2, and Seam 4.
//
// **The seam assertion comes first, because it is the one that protects another lane.**
// This step has to reach M1's wizard without `SetupWizard.tsx` changing and without
// `packages/ui/src/setup-wizard/register.ts` changing — that file registers M1's OWN four
// steps, and reopening it would put an M7 line inside M1's container. `slots.ts` describes
// the mechanism: "a lane adds one file that calls registerSlot(), plus one line in its own
// feature barrel; the container file is never reopened."
//
// **The container never computes completeness.** `types.ts` says so in as many words, and
// it is what makes the seam hold: the container cannot know when *belts* is finished
// without M7 reopening it, so the step reports its own outcome through `onDone`.
import { render, screen, waitFor } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSlot, useSlot } from '@studio/ui'
import type { WizardStepProps } from '@studio/ui'
import { t } from '@studio/i18n'
import { BeltsWizardStep, registerBeltsWizardStep } from './BeltsWizardStep'
import type { BeltPresetOut, DashboardBeltsClient } from './client'

const PRESETS: BeltPresetOut[] = [
  {
    key: 'judo_children',
    discipline: 'judo',
    name: "ג'ודו ילדים",
    ranks: [
      { name: 'לבנה', kyu: 12, order_index: 0, color_hex: '#FFFFFF', secondary_color_hex: null },
      {
        name: 'לבנה-צהובה',
        kyu: 11,
        order_index: 1,
        color_hex: '#FFFFFF',
        secondary_color_hex: '#F7E017',
      },
      { name: 'צהובה', kyu: 10, order_index: 2, color_hex: '#F7E017', secondary_color_hex: null },
    ],
  },
  {
    key: 'judo_adults',
    discipline: 'judo',
    name: "ג'ודו",
    ranks: [
      { name: 'לבנה', kyu: 6, order_index: 0, color_hex: '#FFFFFF', secondary_color_hex: null },
    ],
  },
]

const ONE_CLASS = [{ id: 'c1', name: "ג'ודו", discipline: 'judo' }]

function makeClient(classes: unknown[] = ONE_CLASS): DashboardBeltsClient {
  return {
    presets: vi.fn().mockResolvedValue({ items: PRESETS, next_cursor: null, has_more: false }),
    classes: vi.fn().mockResolvedValue({ items: classes, next_cursor: null }),
    seed: vi.fn().mockResolvedValue({ items: [], next_cursor: null, has_more: false }),
    ladder: vi.fn().mockResolvedValue({ items: [], next_cursor: null, has_more: false }),
  } as unknown as DashboardBeltsClient
}

function renderStep(over: Partial<WizardStepProps> = {}, client = makeClient()) {
  const props: WizardStepProps = {
    locale: 'he',
    status: 'pending',
    onDone: vi.fn(),
    onSkip: vi.fn(),
    ...over,
  }
  render(<BeltsWizardStep {...props} client={client} />)
  return { props, client }
}

afterEach(() => clearSlot('setup-wizard'))

describe('5d — the belts wizard step', () => {
  it('registers itself into the container at order 2 without reopening it', () => {
    clearSlot('setup-wizard')
    registerBeltsWizardStep(makeClient())
    const { result } = renderHook(() => useSlot<WizardStepProps>('setup-wizard'))
    // `belts` is step 2 of six in WIZARD_STEP_ORDER: studio, belts, groups, prices, staff,
    // students. M1 registers 1, 3, 5 and 6; M6 registers 4 the same way.
    expect(result.current.map((entry) => [entry.key, entry.order])).toEqual([['belts', 2]])
  })

  it('reports its own outcome rather than letting the container compute it', async () => {
    const { props, client } = renderStep()
    await userEvent.click(await screen.findByLabelText(/ג'ודו ילדים/))
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(t('he', 'events.belt.add')) }),
    )
    expect(client.seed).toHaveBeenCalledWith('c1', 'judo_children')
    expect(props.onDone).toHaveBeenCalled()
  })

  it('previews the ranks a preset would create, every one of them ringed', async () => {
    renderStep()
    await userEvent.click(await screen.findByLabelText(/ג'ודו ילדים/))
    const bars = await screen.findAllByRole('img')
    expect(bars.length).toBeGreaterThan(0)
    for (const bar of bars) {
      expect(bar.style.boxShadow).toContain('var(--belt-ring)')
    }
  })

  it('shows a bi-colour rank in the preview, because that is what a children ladder is', async () => {
    renderStep()
    await userEvent.click(await screen.findByLabelText(/ג'ודו ילדים/))
    const bar = await screen.findByRole('img', { name: 'לבנה-צהובה' })
    expect(bar.style.background).toContain('linear-gradient')
  })

  it('claims no promotion condition it cannot compute', async () => {
    // 5d findings 2 and 4. The canvas's preview footer states "80% נוכחות · 4 חודשי ותק"
    // and its caption promises a promotion every three to four months. Neither has a
    // column, and §5.9 has no cadence at all.
    renderStep()
    await screen.findByRole('radiogroup')
    expect(screen.queryByText(/%/)).toBeNull()
    expect(screen.queryByText(/3–4/)).toBeNull()
    expect(screen.queryByText(/נוכחות/)).toBeNull()
  })

  it('offers build-from-scratch as a fourth choice that seeds nothing', async () => {
    const { props, client } = renderStep()
    await userEvent.click(
      await screen.findByLabelText(t('he', 'events.belt.presetScratch')),
    )
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(t('he', 'events.belt.add')) }),
    )
    // The fourth card creates nothing — it is the absence of a preset, not a preset. The
    // step is still done: the manager has answered the question it asks.
    expect(client.seed).not.toHaveBeenCalled()
    expect(props.onDone).toHaveBeenCalled()
  })

  it('says a ladder needs a class when the studio has none yet', async () => {
    // WIZARD_STEP_ORDER puts `belts` at step 2 and `groups` -- where classes are created --
    // at step 3, and `belt_rank.class_id` is NOT NULL. Nothing in step 1 makes a class, so
    // this state is reachable on every brand-new studio. The step says so and offers the
    // container's own `onSkip` rather than seeding into a class that does not exist.
    //
    // This is the one place the step departs from `5d`, which draws no defer link. The
    // audit justified that absence as "belt setup is required and pricing is not"; the
    // requirement stands, and it is the ORDERING that makes it unmeetable here.
    const { props } = renderStep({}, makeClient([]))
    const skip = await screen.findByRole('button', {
      name: t('he', 'events.belt.noClassYet'),
    })
    expect(screen.queryByRole('radiogroup')).toBeNull()
    await userEvent.click(skip)
    expect(props.onSkip).toHaveBeenCalled()
  })

  it('lets a manager choose which class the ladder belongs to', async () => {
    // `belt.perClassHint` -- the system is defined per class, and a club running judo and
    // karate grades them on different ladders (§5.9). The selector appears only when there
    // is a choice to make.
    const { client } = renderStep(
      {},
      makeClient([
        { id: 'c1', name: "ג'ודו", discipline: 'judo' },
        { id: 'c2', name: 'קראטה', discipline: 'karate' },
      ]),
    )
    await userEvent.click(await screen.findByLabelText('קראטה'))
    await userEvent.click(screen.getByLabelText(/ג'ודו ילדים/))
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(t('he', 'events.belt.add')) }),
    )
    expect(client.seed).toHaveBeenCalledWith('c2', 'judo_children')
  })

  it('names the rank count of whichever preset is chosen', async () => {
    // The canvas's primary carries the selected preset's count and changes with it. Good
    // pattern, and a translation problem: it interpolates a number into a verb phrase.
    renderStep()
    await userEvent.click(await screen.findByLabelText(/ג'ודו ילדים/))
    expect(
      screen.getByRole('button', { name: new RegExp(t('he', 'events.belt.add')) }).textContent,
    ).toContain('3')
  })
})


describe('the two dead ends (2026-08-28)', () => {
  it('offers plain continuation when the class already HAS a ladder', async () => {
    // The owner picked a system for a class I had seeded directly; seed answered 409, the
    // await threw, and the button silently did nothing — a wizard with no way forward.
    const client = makeClient()
    vi.mocked(client.ladder).mockResolvedValue({
      items: Array.from({ length: 13 }, (_, index) => ({ id: `r${index}` })),
      next_cursor: null,
      has_more: false,
    } as never)
    const { props } = renderStep({}, client)
    expect(await screen.findByTestId('belts-already-seeded')).toHaveTextContent('13')
    await userEvent.click(screen.getByTestId('belts-continue'))
    expect(props.onDone).toHaveBeenCalled()
    // The picker is withheld: the question is already answered.
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('treats a 409 on seed as the goal state and continues', async () => {
    const client = makeClient()
    vi.mocked(client.seed).mockRejectedValue(new Error('409 conflict'))
    const { props } = renderStep({}, client)
    const radios = await screen.findAllByRole('radio', { name: /ג'ודו/ })
    await userEvent.click(radios[0] as HTMLElement)
    await userEvent.click(screen.getByRole('button', { name: new RegExp(t('he', 'events.belt.add')) }))
    await waitFor(() => expect(props.onDone).toHaveBeenCalled())
  })

  it('says a seed failure out loud and keeps the button alive', async () => {
    const client = makeClient()
    vi.mocked(client.seed).mockRejectedValue(new TypeError('offline'))
    const { props } = renderStep({}, client)
    const radios = await screen.findAllByRole('radio', { name: /ג'ודו/ })
    await userEvent.click(radios[0] as HTMLElement)
    await userEvent.click(screen.getByRole('button', { name: new RegExp(t('he', 'events.belt.add')) }))
    expect(await screen.findByTestId('belts-seed-failed')).toBeInTheDocument()
    expect(props.onDone).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: new RegExp(t('he', 'events.belt.add')) })).toBeEnabled()
  })
})
