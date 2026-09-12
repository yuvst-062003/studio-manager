// The header a parent reads on every step of the join wizard.
//
// **This file exists because of what it now asserts.** Until 2026-09-12 the step title, the
// `שלב 1 מתוך 3` line and all three tabs were hardcoded Hebrew literals in two module-level
// constants. A parent who chose Русский got a Russian page under a Hebrew header — and the
// one number that DID translate, the progress percentage, came from `step1Copy`, which is
// what made the split so obvious in the screenshot that reported it.
//
// Nothing caught it because nothing rendered this component in a second locale.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WizardHeader } from './WizardHeader'

function renderHeader(locale: 'he' | 'en' | 'ru', step: 1 | 2 | 3 = 1) {
  return render(
    <WizardHeader
      locale={locale}
      currentStep={step}
      studioName="מועדון גלדיאטור"
      onNavigate={vi.fn()}
      onBack={vi.fn()}
    />,
  )
}

describe('WizardHeader', () => {
  it('renders its title and stage in the chosen language', () => {
    const { unmount } = renderHeader('he')
    expect(screen.getByText('הסכמים ותנאי הצטרפות')).toBeInTheDocument()
    unmount()

    renderHeader('en')
    expect(screen.getByText('Agreements and joining terms')).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 3: agreements and club rules')).toBeInTheDocument()
  })

  it('renders the three step tabs in the chosen language', () => {
    renderHeader('ru')
    expect(screen.getByText('Условия вступления')).toBeInTheDocument()
    expect(screen.getByText('Данные занимающихся')).toBeInTheDocument()
    expect(screen.getByText('Оплата и итог')).toBeInTheDocument()
  })

  it('carries no Hebrew at all in a non-Hebrew locale, except the club\'s own name', () => {
    // The catch-all, and the one that would have failed before this change: a club's name is
    // not translated (it is the club's name), but nothing else here may arrive in Hebrew
    // just because Hebrew was the language it was written in.
    const { container } = renderHeader('en', 2)
    const text = (container.textContent ?? '').replace('מועדון גלדיאטור', '')
    expect(text).not.toMatch(/[֐-׿]/)
  })

  it('the back arrow is marked as directional so LTR can mirror it', () => {
    // The arrows were drawn RTL-first — `ArrowRight` means BACK here. In an LTR document
    // they all point the wrong way, which is half of what "doesn't support rtl/ltr" meant.
    // The mirroring is one CSS rule on this class; jsdom has no layout, so the class is what
    // this can assert.
    const { container } = renderHeader('en', 2)
    expect(container.querySelector('.wz-dir-icon')).not.toBeNull()
  })
})
