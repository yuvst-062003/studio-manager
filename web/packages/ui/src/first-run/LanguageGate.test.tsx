// The first-run language gate. §6.1 step 1, as the first thing anybody sees.
//
// Every assertion here is about the same property: **the person who most needs this screen
// cannot read the language it is currently in.** That is why the welcome and the
// instruction appear three times at once, why each language is named in its own script, and
// why the only way past is a deliberate press rather than a tap-anywhere dismiss.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LanguageGate } from './LanguageGate'

function open(overrides: Partial<Parameters<typeof LanguageGate>[0]> = {}) {
  const onDone = vi.fn()
  render(<LanguageGate locale="he" onChoose={vi.fn()} onDone={onDone} {...overrides} />)
  return { onDone }
}

describe('LanguageGate', () => {
  it('greets in all three languages at once', () => {
    // The whole design. A single-locale greeting is unreadable to exactly the person the
    // §6.1 ordering exists for.
    open()
    expect(screen.getByText('ברוכים הבאים')).toBeInTheDocument()
    expect(screen.getByText('Welcome')).toBeInTheDocument()
    expect(screen.getByText('Добро пожаловать')).toBeInTheDocument()
  })

  it('asks in all three languages too', () => {
    open()
    expect(screen.getByText('בחרו שפה')).toBeInTheDocument()
    expect(screen.getByText('Choose a language')).toBeInTheDocument()
    expect(screen.getByText('Выберите язык')).toBeInTheDocument()
  })

  it('names each language in its own script, and tags it for a screen reader', () => {
    open()
    const russian = screen.getByRole('radio', { name: 'Русский' })
    // `lang` so a screen reader switches voice — otherwise Русский is read aloud by a
    // Hebrew synthesiser, to the one person who needs to recognise it.
    expect(russian).toHaveAttribute('lang', 'ru')
    expect(screen.getByRole('radio', { name: 'עברית' })).toHaveAttribute('lang', 'he')
    expect(screen.getByRole('radio', { name: 'English' })).toHaveAttribute('lang', 'en')
  })

  it('previews the choice immediately, before Continue is pressed', () => {
    // The parent taps Русский and the screen becomes Russian at once. Without this they
    // must take it on faith that the right row was pressed.
    const onChoose = vi.fn()
    render(<LanguageGate locale="he" onChoose={onChoose} onDone={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: 'English' }))
    expect(onChoose).toHaveBeenCalledWith('en')
  })

  it('marks the active language as the selected radio', () => {
    render(<LanguageGate locale="ru" onChoose={vi.fn()} onDone={vi.fn()} />)
    expect(screen.getByRole('radio', { name: 'Русский' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'עברית' })).not.toBeChecked()
  })

  it('closes only on Continue, and reports the locale showing at that moment', () => {
    const { onDone } = open({ locale: 'en' })
    fireEvent.click(screen.getByTestId('language-gate-continue'))
    expect(onDone).toHaveBeenCalledWith('en')
  })

  it('cannot be dismissed by pressing the scrim', () => {
    // A tap-anywhere dismiss records "Hebrew" for a parent who was reaching for the list
    // and missed — which is a wrong answer stored silently, not a skipped question.
    const { onDone } = open()
    fireEvent.click(screen.getByTestId('language-gate-scrim'))
    expect(onDone).not.toHaveBeenCalled()
  })

  it('says the choice is not final', () => {
    open()
    expect(screen.getByText('תמיד אפשר לשנות בהגדרות')).toBeInTheDocument()
  })

  it('is a modal dialog, and its direction follows the active locale', () => {
    render(<LanguageGate locale="en" onChoose={vi.fn()} onDone={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('dir', 'ltr')
    expect(within(dialog).getByTestId('language-gate-continue')).toHaveTextContent('Continue')
  })
})
