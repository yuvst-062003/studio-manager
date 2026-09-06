// Screen-level coverage for the seams `useTimerEngine.test.ts` and `presetsStore.test.ts`
// prove in isolation: a tap on a preset chip really does reach the rendered numbers (not
// just the hook's own state), and a saved preset really does show up as a new chip. Per
// this repo's own verification note, "a field added to an API is not proven by a test that
// constructs the component's props by hand" — the analogue here is a preset's six numbers
// not being proven by a hook test alone, since that never touches the DOM a coach taps.
import { memoryStore, setOfflineStore } from '@studio/core'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { t } from '@studio/i18n'
import { TimerScreen } from './TimerScreen'

beforeEach(() => {
  // A fresh in-memory store per test — `offlineStore()` is a module-level singleton, and
  // without this a preset saved in one test would still be there for the next.
  setOfflineStore(memoryStore())
})

afterEach(() => {
  setOfflineStore(null)
})

describe('TimerScreen', () => {
  it('renders the screen, labelled by the timer namespace title', async () => {
    render(<TimerScreen locale="he" />)
    expect(await screen.findByTestId('timer-screen')).toHaveAccessibleName(t('he', 'timer.title'))
  })

  it('tapping a built-in preset chip carries its six numbers onto the screen', async () => {
    render(<TimerScreen locale="he" />)
    const user = userEvent.setup()

    // Uchikomi: prep 10 / work 30 / rest 30 / rounds 10 / sets 1 / setRest 60.
    await user.click(await screen.findByRole('button', { name: t('he', 'timer.presets.uchikomi.name') }))

    expect(await screen.findByTestId('timer-round')).toHaveTextContent('1')
    // The digital clock and two independent adjuster tiles all read off `settings`, so
    // asserting all three together is the actual seam: engine state reaching multiple,
    // independent parts of the render tree, not just the one field a narrower test
    // might have set by hand.
    expect(screen.getByTestId('timer-clock')).toHaveTextContent('00:10') // prep time
    expect(screen.getByTestId('adjust-work-value')).toHaveTextContent('30s')
    expect(screen.getByTestId('adjust-rest-value')).toHaveTextContent('30s')
    expect(screen.getByTestId('adjust-rounds-value')).toHaveTextContent('10')
    expect(screen.getByTestId('adjust-setRest-value')).toHaveTextContent('60s')
  })

  it('every icon-only transport button has an accessible name', async () => {
    render(<TimerScreen locale="he" />)
    expect(await screen.findByRole('button', { name: t('he', 'timer.actions.reset') })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('he', 'timer.actions.skip') })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: t('he', 'timer.sound.toggleAria') }),
    ).toBeInTheDocument()
    // The play button's name comes from its own visible text, which changes with state —
    // "start" before anything has run.
    expect(screen.getByRole('button', { name: t('he', 'timer.actions.start') })).toBeInTheDocument()
  })

  it('saving the current configuration adds a new, persisted custom preset chip', async () => {
    render(<TimerScreen locale="he" />)
    const user = userEvent.setup()

    await user.click(screen.getAllByRole('button', { name: t('he', 'timer.presets.save') })[0]!)
    const dialog = await screen.findByRole('dialog', { name: t('he', 'timer.modal.heading') })
    await user.type(within(dialog).getByLabelText(t('he', 'timer.modal.nameLabel')), 'הטבנית שלי')
    await user.click(within(dialog).getByRole('button', { name: t('he', 'timer.modal.confirm') }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'הטבנית שלי' })).toBeInTheDocument()
    // The delete control only exists on a custom preset, never a built-in one.
    expect(
      screen.getByRole('button', { name: t('he', 'timer.presets.deleteAria').replace('{{name}}', 'הטבנית שלי') }),
    ).toBeInTheDocument()
  })
})
