// The language control that survives a `position: fixed` header.
//
// `LanguagePicker` — a plain inline row of three buttons — was rendered by the join shell
// directly above `JoinWizard`, whose header is fixed to the top of the screen. It was
// painted underneath: in the DOM, announced by a screen reader, and invisible to the person
// holding the phone. Reported 2026-09-12 as "I don't have an option to change language in
// the wizard".
//
// These tests are about the BEHAVIOUR that replaced it, not the CSS that fixes the
// stacking — jsdom has no layout, so "is it on top" is not a thing this file can assert.
// What it can pin is that one button opens the three, that choosing one acts immediately,
// and that each language is named in its own script.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LanguageButton } from './LanguageButton'

describe('LanguageButton', () => {
  it('shows the CURRENT language on the button, not a generic icon', async () => {
    // A globe says "language settings live here". `עב` also says "you are reading Hebrew",
    // which is the more useful half for someone who opened the app and cannot read it.
    render(<LanguageButton locale="he" onChoose={vi.fn()} />)
    expect(screen.getByTestId('language-open')).toHaveTextContent('עב')

    render(<LanguageButton locale="ru" onChoose={vi.fn()} />)
    expect(screen.getAllByTestId('language-open')[1]).toHaveTextContent('RU')
  })

  it('offers nothing until it is pressed, then offers all three', async () => {
    const user = userEvent.setup()
    render(<LanguageButton locale="he" onChoose={vi.fn()} />)

    expect(screen.queryByTestId('language-panel')).toBeNull()
    await user.click(screen.getByTestId('language-open'))

    expect(screen.getByTestId('language-panel')).toBeInTheDocument()
    // Each named IN that language — someone who cannot read the current locale still has to
    // recognise their own.
    expect(screen.getByTestId('language-he')).toHaveTextContent('עברית')
    expect(screen.getByTestId('language-en')).toHaveTextContent('English')
    expect(screen.getByTestId('language-ru')).toHaveTextContent('Русский')
  })

  it('choosing one acts at once and closes', async () => {
    // `aria-pressed`, not a radiogroup: each option ACTS on press rather than staging a
    // choice that some later button commits. A parent who cannot read the screen must not
    // have to find a confirm button written in the language they do not speak.
    const user = userEvent.setup()
    const onChoose = vi.fn()
    render(<LanguageButton locale="he" onChoose={onChoose} />)

    await user.click(screen.getByTestId('language-open'))
    await user.click(screen.getByTestId('language-ru'))

    expect(onChoose).toHaveBeenCalledWith('ru')
    expect(screen.queryByTestId('language-panel')).toBeNull()
  })

  it('marks the current language as the pressed one', async () => {
    const user = userEvent.setup()
    render(<LanguageButton locale="en" onChoose={vi.fn()} />)
    await user.click(screen.getByTestId('language-open'))

    expect(screen.getByTestId('language-en')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('language-he')).toHaveAttribute('aria-pressed', 'false')
  })

  it('closes on Escape, and on the scrim', async () => {
    const user = userEvent.setup()
    render(<LanguageButton locale="he" onChoose={vi.fn()} />)

    await user.click(screen.getByTestId('language-open'))
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('language-panel')).toBeNull()

    await user.click(screen.getByTestId('language-open'))
    await user.click(screen.getByTestId('language-scrim'))
    expect(screen.queryByTestId('language-panel')).toBeNull()
  })
})
