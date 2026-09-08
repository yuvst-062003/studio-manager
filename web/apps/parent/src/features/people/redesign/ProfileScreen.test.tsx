// פרופיל, and the difference between "nothing" and "we could not find out".
//
// Every read on this screen used to end `.catch(() => setChildren([]))`. A parent on a
// train was told they had no trainees; the payments sheet span on 'טוען…' for ever,
// because `coverage` is null until both the balance and the charges have landed and
// nothing ever set them. An empty list is an ANSWER. A failed read is not one, and the
// tests below are all about that distinction.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@studio/ui'
import { t } from '@studio/i18n'
import { ProfileScreen } from './ProfileScreen'

afterEach(() => vi.unstubAllGlobals())

const ACCOUNT = {
  locale: 'he' as const,
  studios: [],
  activeStudioId: null,
  onSwitchStudio: vi.fn(),
  onSignOut: vi.fn(),
}

/** A club with everything filled in, so the המועדון sheet draws every control it can. */
const CLUB = {
  id: 'st-1',
  name: 'גלדיאטור',
  slug: 'gladiator',
  address: 'ששת הימים 4, נתניה',
  phone: '054-2778878',
  email: 'club@example.invalid',
}

/** Answers `/me/studio` with a real club and every other read with an empty list. */
function stubClub(club: Partial<typeof CLUB> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const body = url.includes('/me/studio')
        ? JSON.stringify({ ...CLUB, ...club })
        : '{"items":[]}'
      return new Response(body, { status: 200 })
    }),
  )
}

/** Every read answers `status`, so one number puts the whole screen in one state. */
function stubAll(status: number, body = '{"items":[]}') {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input))
      return new Response(status === 200 ? body : 'nope', { status })
    }),
  )
  return calls
}

function renderScreen() {
  render(
    // `ProfileScreen` reads `useTheme()` for the הגדרות sheet's light/dark control.
    <ThemeProvider>
      <ProfileScreen locale="he" onLocaleChange={vi.fn()} account={ACCOUNT as never} />
    </ThemeProvider>,
  )
}

describe('when a read fails', () => {
  it('does NOT tell a family they have no trainees', async () => {
    stubAll(500)
    renderScreen()
    await userEvent.click(await screen.findByTestId('profile-row-trainees'))
    const sheet = await screen.findByTestId('sheet-trainees')
    expect(sheet).toContainElement(screen.getByTestId('profile-sheet-failed'))
  })

  it('does not leave the payments sheet spinning for ever', async () => {
    // `coverage` stays null until BOTH the balance and the charges land. Before the flag,
    // a failure on either left 'טוען…' on screen with nothing that could ever clear it.
    stubAll(500)
    renderScreen()
    await userEvent.click(await screen.findByTestId('profile-row-payments'))
    expect(await screen.findByTestId('profile-sheet-failed')).toBeInTheDocument()
    expect(screen.queryByText(t('he', 'people.profile.loading'))).toBeNull()
  })

  it('does not blame the club for the network', async () => {
    // Without the flag the sheet reads "המועדון לא הגדיר כתובת" and "המועדון עדיין לא הגדיר
    // פרטי יצירת קשר" — two statements about the CLUB made out of a failed request.
    stubAll(500)
    renderScreen()
    await userEvent.click(await screen.findByTestId('profile-row-club'))
    expect(await screen.findByTestId('profile-sheet-failed')).toBeInTheDocument()
  })

  it('re-reads when the parent retries, rather than only clearing the message', async () => {
    const calls = stubAll(500)
    renderScreen()
    await userEvent.click(await screen.findByTestId('profile-row-trainees'))
    await screen.findByTestId('profile-sheet-failed')
    const before = calls.length
    await userEvent.click(screen.getByTestId('profile-sheet-retry'))
    await waitFor(() => expect(calls.length).toBeGreaterThan(before))
  })

  it('does not leave the פרטים אישיים row doing nothing when its read failed', async () => {
    // The sheet is gated on `details`, so a failed read turned that row into a button that
    // opened nothing at all — the worst of the three, because it looks like a broken app
    // rather than a broken network.
    stubAll(500)
    renderScreen()
    await userEvent.click(await screen.findByTestId('profile-row-personal'))
    expect(await screen.findByTestId('sheet-personal-failed')).toBeInTheDocument()
    expect(screen.getByTestId('profile-sheet-failed')).toBeInTheDocument()
  })

  it('says nothing when the reads succeed', async () => {
    stubAll(200)
    renderScreen()
    await userEvent.click(await screen.findByTestId('profile-row-trainees'))
    await screen.findByTestId('sheet-trainees')
    expect(screen.queryByTestId('profile-sheet-failed')).toBeNull()
  })
})

// The המועדון sheet, after the owner's review of 2026-09-06: two labelled groups rather
// than one run of buttons, email first, and a way to actually navigate there.
describe('the המועדון sheet', () => {
  async function openClub() {
    renderScreen()
    await userEvent.click(await screen.findByTestId('profile-row-club'))
    return screen.findByTestId('sheet-club')
  }

  it('offers email, WhatsApp and a call, with email first', async () => {
    stubClub()
    const sheet = await openClub()
    const actions = ['profile-contact-email', 'profile-contact-whatsapp', 'profile-contact-call']
    for (const id of actions) expect(sheet).toContainElement(screen.getByTestId(id))
    // Order is the owner's ask, so it is asserted rather than left to source position:
    // email leads because it is the one that interrupts nobody.
    const rendered = actions.map((id) => screen.getByTestId(id))
    expect(rendered[0]!.compareDocumentPosition(rendered[1]!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('draws no email button for a club that has not set one', async () => {
    // The reason none was visible on staging: the code was right and the column was empty.
    // A mailto: to a guessed address is a message the club never receives.
    stubClub({ email: undefined })
    const sheet = await openClub()
    expect(sheet).toContainElement(screen.getByTestId('profile-contact-call'))
    expect(screen.queryByTestId('profile-contact-email')).toBeNull()
  })

  it('opens Waze and Maps behind one הוראות הגעה press, both carrying the address', async () => {
    stubClub()
    await openClub()
    // Collapsed until asked: the parent said "directions", not "choose an app".
    expect(screen.getByTestId('club-route-waze')).not.toBeVisible()

    await userEvent.click(screen.getByTestId('club-directions-open'))

    const waze = screen.getByTestId('club-route-waze')
    const maps = screen.getByTestId('club-route-maps')
    expect(waze).toBeVisible()
    const address = encodeURIComponent(CLUB.address)
    // https and not waze:// — an app scheme opens nothing when the app is absent, which is
    // a dead tap with no error.
    expect(waze).toHaveAttribute('href', `https://waze.com/ul?q=${address}&navigate=yes`)
    expect(maps).toHaveAttribute(
      'href',
      `https://www.google.com/maps/search/?api=1&query=${address}`,
    )
  })

  it('offers no navigation at all for a club with no address', async () => {
    // A route link with an empty query opens a map of nowhere.
    stubClub({ address: undefined })
    await openClub()
    expect(screen.queryByTestId('club-directions-open')).toBeNull()
    expect(screen.getByText(t('he', 'people.profile.dojoNoAddress'))).toBeInTheDocument()
  })
})

// נגישות moved into פרופיל → הגדרות, and off every other signed-in screen. `App.tsx` holds
// the other half of this rule; here we prove the row exists and opens the real panel, so
// "removed from everywhere" cannot quietly mean "removed".
describe('the accessibility menu inside הגדרות', () => {
  it('opens the same adjustments panel from a settings row', async () => {
    stubClub()
    renderScreen()
    await userEvent.click(await screen.findByTestId('profile-row-settings'))
    const trigger = await screen.findByTestId('a11y-open')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(trigger)

    expect(await screen.findByRole('dialog', { name: t('he', 'common.a11y.title') })).toBeInTheDocument()
    expect(screen.getByText(t('he', 'common.a11y.statement.title'))).toBeInTheDocument()
  })
})

// #29 — the SEAM, not the component. `CalendarSyncPopup.test.tsx` proves the popup itself;
// this proves הגדרות actually opens it, which is the half the owner reported broken: the
// row led to `#/calendar` — לוח הילד, a whole calendar screen — instead of the subscribe
// controls its own label promised.
describe('סנכרון יומן inside הגדרות', () => {
  it('opens the subscribe popup rather than navigating to the calendar screen', async () => {
    stubClub()
    renderScreen()
    await userEvent.click(await screen.findByTestId('profile-row-settings'))

    const row = await screen.findByTestId('row-calendar-sync')
    // A control, not a link. A row that navigates is the defect.
    expect(row.tagName).toBe('BUTTON')
    expect(row).not.toHaveAttribute('href')

    await userEvent.click(row)
    expect(await screen.findByTestId('calendar-sync-popup')).toBeInTheDocument()
  })

  it('still leads to לוח הילד, from a row that says so', async () => {
    // `#/calendar` had exactly one link in the whole signed-in app and it was the row above,
    // mislabelled. Splitting them must not strand the screen — the two rows now say which
    // is which.
    stubClub()
    renderScreen()
    await userEvent.click(await screen.findByTestId('profile-row-settings'))
    const link = await screen.findByTestId('link-calendar')
    expect(link).toHaveAttribute('href', '#/calendar')
    expect(link).toHaveTextContent(t('he', 'people.profile.trainingCalendar'))
  })
})

// הוראת קבע and צ׳קים moved here from תשלומים on 2026-09-07. Both are set up ONCE — a
// mandate moves the money by itself and a season of cheques is handed over in one go — so
// neither is a monthly decision, and on the payments screen they competed every month with
// the one that is.
describe('אמצעי תשלום — the picker, and the two routes inside it', () => {
  const LINK = {
    student_id: 's1',
    student_name: 'יובל כהן',
    plan_name: 'פעמיים בשבוע',
    amount_agorot: 25_000,
    url: 'https://pay.example.invalid/mandate/1',
  }

  /** Every read answers something real, so the sheet draws both routes. */
  function stubMoney() {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        calls.push({ url, init })
        const body = url.includes('/me/payment-methods')
          ? JSON.stringify({
              items: [{ student_id: 's1', student_name: 'יובל כהן', method: null }],
            })
          : url.includes('/me/standing-order-links')
          ? JSON.stringify({ items: [LINK] })
          : url.includes('/me/prepay-terms')
            ? JSON.stringify({
                cash_prepay_months: 3,
                cheque_prepay_months: 12,
                monthly_total_agorot: 25_000,
              })
            : url.includes('/me/charges?status=open')
              ? JSON.stringify({ items: [{ id: 'ch-1', amount_agorot: 20_833 }] })
              : url.includes('/me/balance')
                ? JSON.stringify({ balance_agorot: 20_833, open_charge_count: 1, credit_agorot: 0 })
                : '{"items":[]}'
        return new Response(body, { status: 200 })
      }),
    )
    return calls
  }

  async function openPayments() {
    renderScreen()
    await userEvent.click(await screen.findByTestId('profile-row-payments'))
    return screen.findByTestId('sheet-payments')
  }

  /** אמצעי תשלום is a BUTTON now (2026-09-08), and the two once-only routes live behind
   *  it — as the detail of whichever method is selected, rather than as two cards shown
   *  to every family whether they use them or not. */
  async function openMethod(method: 'standing_order' | 'cheque' | 'cash' | 'upay_card') {
    await openPayments()
    await userEvent.click(screen.getByTestId('sheet-payments-method'))
    await screen.findByTestId('sheet-method')
    await userEvent.click(screen.getByTestId(`method-s1-${method}`))
  }

  it('offers one mandate link per child, at the amount it will charge', async () => {
    // A uPay shared link is fixed at ONE amount and the page it opens does not say which,
    // so a bare link has a family sign one mandate and underpay for the other child every
    // month. The name and the figure beside it are the whole reason it is a list.
    stubMoney()
    await openMethod('standing_order')
    const link = screen.getByTestId('sheet-standing-order-link')
    expect(link).toHaveAttribute('href', LINK.url)
    // Opens away from the app, so following it does not lose פרופיל.
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    // The child is named by the block the link sits in, and by the link's own accessible
    // name — two anchors reading 'קישור להקמת הוראת קבע' are two a screen reader cannot
    // tell apart. The row carries the plan and the amount the mandate will charge.
    expect(link).toHaveAccessibleName(expect.stringContaining('יובל כהן'))
    expect(screen.getByTestId('sheet-standing-order-row')).toHaveTextContent('250₪')
  })

  it('prices the cheque route as open charges PLUS the club’s term', async () => {
    // ₪208.33 open and twelve months at ₪250.00. Shown broken down rather than as one
    // figure, because ₪3,208.33 with no explanation is the number a parent phones about.
    stubMoney()
    await openMethod('cheque')
    expect(screen.getByTestId('sheet-cheque-total')).toHaveTextContent('3,208.33₪')
    expect(screen.getByTestId('sheet-cheque-term')).toBeInTheDocument()
  })

  it('raises a cheque promise over the open charges and the term', async () => {
    const calls = stubMoney()
    await openMethod('cheque')
    await userEvent.click(screen.getByTestId('sheet-cheque-request'))
    await waitFor(() => {
      const posted = calls.find(
        (call) => call.url.includes('/me/payment-promises') && call.init?.method === 'POST',
      )
      expect(posted, 'no cheque promise was raised — the manager would never hear').toBeDefined()
      const body = JSON.parse(String(posted!.init!.body))
      expect(body.charge_ids).toEqual(['ch-1'])
      expect(body.method).toBe('cheque')
      // A COUNT, never an amount: the server prices the months from the payer's own total.
      expect(body.prepay_months).toBe(12)
      expect(body.already_paid).toBe(false)
    })
  })

  it('no longer sends a parent to the payments screen to arrange a method', async () => {
    // That screen answers "what do I owe right now". Pointing at it from here was pointing
    // at the wrong place the moment these two routes moved.
    stubMoney()
    const sheet = await openPayments()
    const method = screen.getByTestId('sheet-payments-method')
    expect(sheet).toContainElement(method)
    expect(method.querySelector('a[href="#/payments"]')).toBeNull()
  })
})

// ── the method a family picked is finally readable (owner review, 2026-09-08) ─────────
//
// It was derived from `/me/payment-promises` row zero, and `payment_promise.method` is
// `IN ('cash','cheque','standing_order')` — so a card family had no promise and read
// `לא הוגדר` however many times they answered the wizard. It has a column of its own now,
// and these assert the whole path: `fetch → state → sheet`, not props built by hand.

describe('what the אמצעי תשלום row says', () => {
  function stubMethods(items: unknown[], onPut?: (body: unknown) => void) {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        calls.push({ url, init })
        if (url.includes('/me/payment-methods')) {
          if (init?.method === 'PUT') {
            onPut?.(JSON.parse(String(init.body)))
            return new Response('{"items":[]}', { status: 200 })
          }
          return new Response(JSON.stringify({ items }), { status: 200 })
        }
        if (url.includes('/me/prepay-terms')) {
          return new Response(
            JSON.stringify({
              cash_prepay_months: 3,
              cheque_prepay_months: 12,
              monthly_total_agorot: 25_000,
            }),
            { status: 200 },
          )
        }
        if (url.includes('/me/balance')) {
          return new Response(
            JSON.stringify({ balance_agorot: 0, open_charge_count: 0, credit_agorot: 0 }),
            { status: 200 },
          )
        }
        return new Response('{"items":[]}', { status: 200 })
      }),
    )
    return calls
  }

  async function openPaymentsSheet() {
    renderScreen()
    await userEvent.click(await screen.findByTestId('profile-row-payments'))
    return screen.findByTestId('sheet-payments')
  }

  it('reads a CARD family through the real client, where no promise could exist', async () => {
    // The exact case the old derivation could never answer. No promises are returned here.
    stubMethods([{ student_id: 's1', student_name: 'יובל כהן', method: 'upay_card' }])
    await openPaymentsSheet()
    expect(screen.getByTestId('sheet-payments-method')).toHaveTextContent(
      t('he', 'billing.method.card'),
    )
  })

  it('says מעורב when the children do not agree', async () => {
    // A real answer, not a failure: the method is per child precisely so a family can put
    // one on a mandate and pay another by card.
    stubMethods([
      { student_id: 's1', student_name: 'יובל כהן', method: 'upay_card' },
      { student_id: 's2', student_name: 'נועה כהן', method: 'standing_order' },
    ])
    await openPaymentsSheet()
    expect(screen.getByTestId('sheet-payments-method')).toHaveTextContent(
      t('he', 'people.profile.paymentMethodMixed'),
    )
  })

  it('still says לא הוגדר when nobody has answered', async () => {
    stubMethods([{ student_id: 's1', student_name: 'יובל כהן', method: null }])
    await openPaymentsSheet()
    expect(screen.getByTestId('sheet-payments-method')).toHaveTextContent(
      t('he', 'people.profile.paymentMethodNone'),
    )
  })

  it('opens the picker and saves a change, in the vocabulary the column holds', async () => {
    let posted: unknown = null
    stubMethods([{ student_id: 's1', student_name: 'יובל כהן', method: null }], (body) => {
      posted = body
    })
    await openPaymentsSheet()

    await userEvent.click(screen.getByTestId('sheet-payments-method'))
    await screen.findByTestId('sheet-method')
    await userEvent.click(screen.getByTestId('method-s1-cash'))
    await userEvent.click(screen.getByTestId('method-save'))

    await waitFor(() => {
      expect(posted).toEqual({ items: [{ student_id: 's1', method: 'cash' }] })
    })
    // …and the row behind it now reads the new answer rather than the stale one.
    await waitFor(() => {
      expect(screen.getByTestId('sheet-payments-method')).toHaveTextContent(
        t('he', 'billing.method.cash'),
      )
    })
  })

  it('shows only the selected method’s detail, not every route at once', async () => {
    // The report: the two routes were always-open cards under an inert label, shouting at
    // every family whether or not they used either.
    stubMethods([{ student_id: 's1', student_name: 'יובל כהן', method: null }])
    await openPaymentsSheet()
    expect(screen.queryByTestId('sheet-payments-cheque')).toBeNull()

    await userEvent.click(screen.getByTestId('sheet-payments-method'))
    await screen.findByTestId('sheet-method')
    await userEvent.click(screen.getByTestId('method-s1-cash'))
    expect(screen.getByTestId('method-detail-cash-s1')).toBeInTheDocument()
    expect(screen.queryByTestId('method-detail-standing-order-s1')).toBeNull()
    expect(screen.queryByTestId('sheet-payments-cheque')).toBeNull()
  })
})

