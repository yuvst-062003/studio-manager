// מחירים לפי חוג — the editor that makes per-class pricing operable.
//
// The routes it drives have been tested server-side since they landed; what had never been
// tested is that a SCREEN calls them, which is the exact gap that left the feature inert in
// production. So these assert the seam — what the card puts on screen from a read, and what
// it sends back on a save — rather than the markup.
//
// Two of them are about money being explicable rather than about a control working:
// an unpriced class must name the amount it actually falls back to, and a class must be
// offered only the plans it may legally be priced with.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ClassPricesCard } from './ClassPricesCard'
import type { DashboardBillingClient, PricePlanOut } from './billingClient'

const LOCALE = 'he' as const
const JUDO = 'class-judo'
const KARATE = 'class-karate'

function plan(overrides: Partial<PricePlanOut> & { id: string }): PricePlanOut {
  return {
    name: 'מסלול',
    sessions_per_week: 2,
    monthly_amount_agorot: 18_000,
    registration_fee_agorot: 0,
    active_from: '2026-01-01',
    active_to: null,
    class_id: null,
    ...overrides,
  } as PricePlanOut
}

/** Judo has three plans and karate two — the owner's own example — plus one plan nobody has
 *  filed under a class at all, which is every plan created before per-class pricing. */
const PLANS: PricePlanOut[] = [
  plan({ id: 'judo-1', name: 'ג׳ודו פעם בשבוע', class_id: JUDO, monthly_amount_agorot: 15_000 }),
  plan({ id: 'judo-2', name: 'ג׳ודו פעמיים בשבוע', class_id: JUDO, monthly_amount_agorot: 18_000 }),
  plan({ id: 'judo-3', name: 'ג׳ודו שלוש בשבוע', class_id: JUDO, monthly_amount_agorot: 21_000 }),
  plan({ id: 'karate-1', name: 'קראטה פעם בשבוע', class_id: KARATE, monthly_amount_agorot: 14_000 }),
  plan({ id: 'karate-2', name: 'קראטה פעמיים בשבוע', class_id: KARATE, monthly_amount_agorot: 16_000 }),
  plan({ id: 'unfiled', name: 'מסלול ישן', class_id: null, monthly_amount_agorot: 15_000 }),
]

function stub(overrides: Partial<DashboardBillingClient> = {}): DashboardBillingClient {
  return {
    pricePlans: vi.fn().mockResolvedValue(PLANS),
    studentClassPrices: vi.fn().mockResolvedValue({
      items: [
        {
          class_id: JUDO,
          class_name: 'ג׳ודו',
          price_plan_id: 'judo-2',
          price_plan_name: 'ג׳ודו פעמיים בשבוע',
          monthly_amount_agorot: 18_000,
        },
        {
          class_id: KARATE,
          class_name: 'קראטה',
          price_plan_id: null,
          price_plan_name: null,
          monthly_amount_agorot: null,
        },
      ],
      fallback_price_plan_id: 'unfiled',
    }),
    setStudentClassPrices: vi.fn().mockResolvedValue({ items: [], fallback_price_plan_id: null }),
    ...overrides,
  } as unknown as DashboardBillingClient
}

describe('ClassPricesCard', () => {
  it('lists every class the child trains in, priced or not', async () => {
    render(<ClassPricesCard locale={LOCALE} studentId="st1" client={stub()} />)
    expect(await screen.findByTestId(`class-price-row-${JUDO}`)).toBeInTheDocument()
    // The unpriced one is the row that matters: it is driven by the ENROLMENT, so a class
    // nobody has priced is still something a manager can act on.
    expect(screen.getByTestId(`class-price-row-${KARATE}`)).toBeInTheDocument()
  })

  it('says what an unpriced class actually charges, never nothing', async () => {
    // The load-bearing string. "ללא מחיר מיוחד" alone reads as "pays nothing", and the one
    // thing that must not be ambiguous on this screen is money.
    render(<ClassPricesCard locale={LOCALE} studentId="st1" client={stub()} />)
    const note = await screen.findByTestId(`class-price-fallback-${KARATE}`)
    // The formatter puts the sign after the number in Hebrew — asserted as it renders.
    expect(note).toHaveTextContent('150₪')
    expect(note).not.toHaveTextContent(t(LOCALE, 'billing.classPrices.noFallback'))
  })

  it('says so plainly when there is no fallback either', async () => {
    // The ONLY state in which nothing is charged, and so the only one allowed to look
    // like it.
    render(
      <ClassPricesCard
        locale={LOCALE}
        studentId="st1"
        client={stub({
          studentClassPrices: vi.fn().mockResolvedValue({
            items: [
              {
                class_id: KARATE,
                class_name: 'קראטה',
                price_plan_id: null,
                price_plan_name: null,
                monthly_amount_agorot: null,
              },
            ],
            fallback_price_plan_id: null,
          }),
        })}
      />,
    )
    expect(await screen.findByTestId(`class-price-fallback-${KARATE}`)).toHaveTextContent(
      t(LOCALE, 'billing.classPrices.noFallback'),
    )
  })

  it('offers a class only its own plans', async () => {
    // Owner, 2026-09-09: "each class can have different payment plans — judo has 3, karate
    // has 2", and then "it's per class — a class can have no all-classes plan". Offering
    // karate's plan under judo is a choice the server refuses; offering the unfiled one is
    // a choice the club has said it does not want.
    render(<ClassPricesCard locale={LOCALE} studentId="st1" client={stub()} />)
    const judo = await screen.findByTestId(`class-price-select-${JUDO}`)
    const offered = [...judo.querySelectorAll('option')].map((option) => option.value)
    expect(offered).toEqual(['', 'judo-1', 'judo-2', 'judo-3'])
    expect(offered).not.toContain('karate-1')
    expect(offered).not.toContain('unfiled')
  })

  it('sends an explicit null to clear a price, and keeps the other class', async () => {
    // `price_plan_id: null` DELETES the row and returns the child to the fallback. Dropping
    // the key instead would leave the price standing while the screen said it was gone.
    const setStudentClassPrices = vi
      .fn()
      .mockResolvedValue({ items: [], fallback_price_plan_id: null })
    render(
      <ClassPricesCard locale={LOCALE} studentId="st1" client={stub({ setStudentClassPrices })} />,
    )
    const judo = await screen.findByTestId(`class-price-select-${JUDO}`)
    await userEvent.selectOptions(judo, '')
    await userEvent.click(screen.getByTestId('class-prices-save'))

    await waitFor(() => expect(setStudentClassPrices).toHaveBeenCalled())
    expect(setStudentClassPrices).toHaveBeenCalledWith('st1', [
      { classId: JUDO, pricePlanId: null },
      // Untouched, and still sent: the PUT is over the whole picture, so a row left out
      // would be a row deleted.
      { classId: KARATE, pricePlanId: null },
    ])
  })

  it('saves a chosen plan for one class', async () => {
    const setStudentClassPrices = vi
      .fn()
      .mockResolvedValue({ items: [], fallback_price_plan_id: null })
    render(
      <ClassPricesCard locale={LOCALE} studentId="st1" client={stub({ setStudentClassPrices })} />,
    )
    const karate = await screen.findByTestId(`class-price-select-${KARATE}`)
    await userEvent.selectOptions(karate, 'karate-2')
    await userEvent.click(screen.getByTestId('class-prices-save'))

    await waitFor(() => expect(setStudentClassPrices).toHaveBeenCalled())
    expect(setStudentClassPrices).toHaveBeenCalledWith('st1', [
      { classId: JUDO, pricePlanId: 'judo-2' },
      { classId: KARATE, pricePlanId: 'karate-2' },
    ])
  })

  it('says a child enrolled in nothing has no classes to price', async () => {
    render(
      <ClassPricesCard
        locale={LOCALE}
        studentId="st1"
        client={stub({
          studentClassPrices: vi
            .fn()
            .mockResolvedValue({ items: [], fallback_price_plan_id: null }),
        })}
      />,
    )
    expect(await screen.findByTestId('class-prices-empty')).toBeInTheDocument()
  })

  it('every picker has an accessible name', async () => {
    render(<ClassPricesCard locale={LOCALE} studentId="st1" client={stub()} />)
    await screen.findByTestId(`class-price-select-${JUDO}`)
    for (const select of screen.getAllByRole('combobox')) {
      expect(select).toHaveAccessibleName()
    }
  })
})
