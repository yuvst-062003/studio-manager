import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { MoneyDisplay } from './MoneyDisplay'
import { DIRECTIONS, THEMES, renderIn } from '../testing'

/**
 * SPEC §13 — every component rendered in both `he` (RTL) and `en` (LTR).
 *
 * Money is the case where bidi actually bites. A shekel amount is a left-to-right run of
 * digits inside a right-to-left sentence, and a leading minus sign on a credit is exactly
 * the character the bidi algorithm reorders if the run is not isolated.
 */
describe('MoneyDisplay', () => {
  it.each(DIRECTIONS)('renders the amount in $locale', ({ locale }) => {
    renderIn(<MoneyDisplay agorot={32000} />, { locale })
    expect(screen.getByText('320₪')).toBeInTheDocument()
  })

  it('formats through @studio/core rather than reimplementing it', () => {
    // A second formatter would be a second set of rounding rules. 32050 is the case that
    // would diverge first.
    renderIn(<MoneyDisplay agorot={32050} />)
    expect(screen.getByText('320.50₪')).toBeInTheDocument()
  })

  /**
   * **The RTL bug this component exists to prevent.**
   *
   * `-320₪` inside a Hebrew sentence renders as `320₪-` without isolation — the minus
   * jumps to the other end and a credit reads as a debt. `<bdi>` isolates the numeric run
   * so the bidi algorithm cannot reorder it against the surrounding text.
   */
  it('isolates the amount from the surrounding text direction', () => {
    const { container } = renderIn(<MoneyDisplay agorot={-32000} />, { locale: 'he' })
    const bdi = container.querySelector('bdi')
    expect(bdi).not.toBeNull()
    expect(bdi).toHaveTextContent('-320₪')
  })

  it('renders a credit and a debt as different text, not only different colour', () => {
    // SC 1.4.1 — colour is never the only carrier. The sign is in the text itself.
    const { rerender } = renderIn(<MoneyDisplay agorot={32000} />)
    expect(screen.getByText('320₪')).toBeInTheDocument()
    rerender(<MoneyDisplay agorot={-32000} />)
    expect(screen.getByText('-320₪')).toBeInTheDocument()
  })

  describe('semantic tone', () => {
    it.each(['debt', 'paid', 'pending', 'cancelled'] as const)(
      'binds the %s tone to its token',
      (tone) => {
        const { container } = renderIn(<MoneyDisplay agorot={32000} tone={tone} />)
        expect(container.querySelector('.studio-money')).toHaveAttribute('data-tone', tone)
      },
    )

    it('defaults to no tone, so a plain amount is plain', () => {
      // D2 — semantic colours mean something. An amount with no state must not borrow one.
      const { container } = renderIn(<MoneyDisplay agorot={32000} />)
      expect(container.querySelector('.studio-money')).not.toHaveAttribute('data-tone')
    })

    it('hardcodes no colour, so the tone can only come from a token', () => {
      // G13 / D2 — semantic tokens are never overridable, so there is deliberately no way
      // to pass a hex. A `color` prop here is how the debt amount ends up brand-coloured.
      expect(MoneyDisplay.toString()).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    })

    it('rejects a tone outside the semantic set at compile time', () => {
      // @ts-expect-error — 'brand' is not a MoneyTone. D2: brand colour is forbidden in
      // status positions, and the type is the first place that is enforced.
      renderIn(<MoneyDisplay agorot={32000} tone="brand" />)
    })
  })

  it.each(THEMES)('renders in the %s theme', (theme) => {
    renderIn(<MoneyDisplay agorot={32000} tone="debt" />, { theme })
    expect(screen.getByText('320₪')).toBeInTheDocument()
  })

  it('accepts an accessible label so a bare number is not read alone', () => {
    // A screen reader announcing "320 shekels" on a row already labelled "September" is
    // fine; announcing it with no context is not. The label is a prop because only the
    // caller knows the context.
    renderIn(<MoneyDisplay agorot={32000} label="חוב לספטמבר" />)
    expect(screen.getByLabelText('חוב לספטמבר')).toBeInTheDocument()
  })
})
